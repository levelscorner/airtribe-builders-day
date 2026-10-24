import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { createPostgresLedger } from "../credits/ledger.js";
import { seedUser, withPg } from "../credits/testing.js";
import { createApp } from "../deploy/app.js";
import { paymentsRouter } from "./routes.js";
import { createPayments, paymentsModeFrom } from "./service.js";
import { PHONEPE_PAYEE } from "./qr.js";

test("PAYMENTS_MODE defaults to qr and leaves Pine Labs dormant", () => {
  assert.equal(paymentsModeFrom({}), "qr");
  assert.equal(paymentsModeFrom({ PAYMENTS_MODE: "pinelabs" }), "pinelabs");
  assert.equal(paymentsModeFrom({ PAYMENTS_MODE: "mock" }), "mock");
  const payments = createPayments({
    mock: false,
    ledger: { async grant() { return { applied: true, balance: 0 }; } } as never,
    publicBaseUrl: "http://127.0.0.1:9",
  });
  assert.equal(payments.mode, "qr");
});

test("PhonePe UTR stays pending until admin approval, and a second approve grants nothing", async () => {
  const pg = await withPg();
  try {
    const userId = await seedUser(pg.db, 0);
    const ledger = createPostgresLedger(pg.db);
    const payments = createPayments({
      mock: false,
      ledger,
      db: pg.db,
      publicBaseUrl: "http://127.0.0.1:9",
    });
    assert.equal(payments.mode, "qr");
    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(paymentsRouter(payments));
    const server = app.listen(0);
    try {
      const port = await listeningPort(server);
      const base = `http://127.0.0.1:${port}`;
      const page = await fetch(`${base}/v1/packs/qr`);
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.match(html, /width=device-width, initial-scale=1/);
      assert.match(html, new RegExp(PHONEPE_PAYEE));
      assert.match(html, /I've paid/);
      assert.match(html, /\/payments\/phonepe-qr\.jpg/);
      assert.equal(html.includes("sk-"), false);

      const declared = await fetch(`${base}/v1/packs/phonepe`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "x-user-id": userId },
        body: JSON.stringify({ packId: "starter", utr: "utr123456789" }),
      });
      const body = (await declared.json()) as { paymentId: string; status: string; creditsGranted: number };
      assert.equal(declared.status, 201);
      assert.equal(body.status, "pending_verification");
      assert.equal(body.creditsGranted, 0);
      assert.equal(await ledger.balance(userId), 0);

      const duplicate = await fetch(`${base}/v1/packs/phonepe`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "x-user-id": userId },
        body: JSON.stringify({ packId: "creator", utr: "UTR123456789" }),
      });
      assert.equal(duplicate.status, 409);
      const duplicateBody = await duplicate.text();
      assert.match(duplicateBody, /duplicate_utr/);

      const pending = await payments.listPending!();
      assert.equal(pending.length, 1);
      assert.equal(pending[0]?.utr, "UTR123456789");

      const approved = await payments.approvePayment!(body.paymentId);
      assert.equal(approved.creditsGranted, 500);
      assert.equal(await ledger.balance(userId), 500);
      const again = await payments.approvePayment!(body.paymentId);
      assert.equal(again.creditsGranted, 0);
      assert.equal(await ledger.balance(userId), 500);

      const rejected = await fetch(`${base}/v1/packs/phonepe`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "x-user-id": userId },
        body: JSON.stringify({ packId: "creator", utr: "reject987654" }),
      });
      const rejectBody = (await rejected.json()) as { paymentId: string };
      await payments.rejectPayment!(rejectBody.paymentId);
      assert.equal(await ledger.balance(userId), 500);
      const replayReject = await payments.rejectPayment!(rejectBody.paymentId);
      assert.equal(replayReject.status, "rejected");
    } finally {
      await close(server);
    }
  } finally {
    await pg.close();
  }
});

test("the admin payments page approves a PhonePe row once", async () => {
  const pg = await withPg();
  try {
    const userId = await seedUser(pg.db, 40);
    const app = await createApp({
      env: { PORT: "0", PUBLIC_BASE_URL: "http://127.0.0.1:9" },
      db: pg.db,
    });
    const server = app.listen(0);
    try {
      const port = await listeningPort(server);
      const base = `http://127.0.0.1:${port}`;
      const declared = await fetch(`${base}/v1/packs/phonepe`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json", "x-user-id": userId },
        body: JSON.stringify({ packId: "starter", utr: "adminutr12345" }),
      });
      const body = (await declared.json()) as { paymentId: string; creditsGranted: number };
      assert.equal(body.creditsGranted, 0);
      const review = await fetch(`${base}/admin/payments`);
      const html = await review.text();
      assert.match(html, /width=device-width, initial-scale=1/);
      assert.match(html, /adminutr12345/i);
      const approved = await fetch(`${base}/admin/payments/approve`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ paymentId: body.paymentId }),
      });
      const approvedBody = (await approved.json()) as { creditsGranted: number; status: string };
      assert.equal(approved.status, 200);
      assert.equal(approvedBody.status, "paid");
      assert.equal(approvedBody.creditsGranted, 500);
      const balance = await pg.db.query<{ credit_balance: number }>("SELECT credit_balance FROM users WHERE id = $1", [userId]);
      assert.equal(balance.rows[0]?.credit_balance, 540);
    } finally {
      await close(server);
    }
  } finally {
    await pg.close();
  }
});

function listeningPort(server: ReturnType<express.Express["listen"]>): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("listening", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("no port"));
        return;
      }
      resolve(address.port);
    });
    server.once("error", reject);
  });
}

function close(server: ReturnType<express.Express["listen"]>): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
