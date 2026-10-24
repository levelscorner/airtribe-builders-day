import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import express from "express";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createPostgresLedger } from "../credits/ledger.js";
import { createMockLedger } from "../credits/mock.js";
import { seedUser, withPg } from "../credits/testing.js";
import { PaymentError } from "./errors.js";
import { inrToPaise } from "./packs.js";
import { assertPineLabsTestOrigin, PINE_LABS_UAT_ORIGIN } from "./pine.js";
import { paymentsRouter } from "./routes.js";
import { createPayments } from "./service.js";
import { pineLabsSignature } from "./signature.js";

const SECRET = Buffer.from("abc1234").toString("base64");

test("Pine Labs base URL stays on the UAT host", () => {
  assert.equal(assertPineLabsTestOrigin(PINE_LABS_UAT_ORIGIN).origin, PINE_LABS_UAT_ORIGIN);
  assert.throws(
    () => assertPineLabsTestOrigin("https://api.pluralpay.in"),
    (error: unknown) => error instanceof PaymentError && error.code === "live_host_refused",
  );
});

test("MOCK=1 grants pack credits once and the webhook does not grant again", async () => {
  const ledger = createMockLedger();
  const userId = crypto.randomUUID();
  ledger.seedUser(userId, 0);
  const payments = createPayments({ mock: true, ledger });
  const packs = await payments.listPacks();
  assert.equal(packs[0]?.id, "starter");
  const checkout = await payments.createCheckout({ userId, packId: "starter" });
  assert.equal(checkout.status, "mocked");
  assert.equal(checkout.creditsGranted, 500);
  assert.equal(await ledger.balance(userId), 500);
  const replay = await payments.handleWebhook(JSON.stringify({ data: { merchant_payment_link_reference: checkout.paymentId, status: "CAPTURED" } }));
  assert.equal(replay.creditsGranted, 0);
  assert.equal(await ledger.balance(userId), 500);
});

test("UAT webhook and callback credit the ledger once", async () => {
  const pg = await withPg();
  try {
    const ledger = createPostgresLedger(pg.db);
    const userId = await seedUser(pg.db, 0);
    const calls: string[] = [];
    let links = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      assert.ok(url.startsWith(PINE_LABS_UAT_ORIGIN));
      if (url.endsWith("/api/auth/v1/token")) {
        const sent = JSON.parse(String(init?.body));
        assert.equal(sent.client_id, "merchant_uat");
        assert.equal(sent.client_secret, "secret_uat");
        return Response.json({ access_token: "uat-token", expires_in: 3600 });
      }
      if (url.endsWith("/api/pay/v1/payment-links") && init?.method === "POST") {
        assert.match(String(init.headers && headerOf(init.headers, "authorization")), /^Bearer uat-token$/);
        const sent = JSON.parse(String(init.body));
        assert.equal(sent.payment_link_amount.value, inrToPaise(499));
        assert.equal(sent.payment_link_amount.currency, "INR");
        links += 1;
        const paymentLinkId = `pl_test_${links}`;
        return Response.json({
          payment_link_id: paymentLinkId,
          payment_link_url: `https://pluraluat.v2.pinepg.in/pay/${paymentLinkId}`,
          status: "CREATED",
        });
      }
      if (url.includes("/api/pay/v1/payment-links/pl_test_")) {
        return Response.json({
          status: "CAPTURED",
          amount: { value: inrToPaise(499), currency: "INR" },
        });
      }
      return new Response("missing", { status: 404 });
    };

    const payments = createPayments({
      mock: false,
      ledger,
      db: pg.db,
      merchantId: "merchant_uat",
      apiKey: "secret_uat",
      webhookSecret: SECRET,
      publicBaseUrl: "http://localhost:8787",
      fetchImpl,
      now: () => new Date("2026-04-01T00:00:00Z"),
    });

    const checkout = await payments.createCheckout({ userId, packId: "starter" });
    assert.equal(checkout.status, "pending");
    assert.equal(checkout.checkoutUrl, "https://pluraluat.v2.pinepg.in/pay/pl_test_1");
    assert.equal(await ledger.balance(userId), 0);

    const rawBody = JSON.stringify({
      event: "ORDER_CAPTURED",
      data: {
        payment_link_id: "pl_test_1",
        merchant_payment_link_reference: checkout.paymentId,
        status: "CAPTURED",
        amount: { value: inrToPaise(499), currency: "INR" },
      },
    });
    const webhookId = "wh_1";
    const webhookTimestamp = "1775001600";
    const signature = pineLabsSignature({
      webhookId,
      webhookTimestamp,
      rawBody,
      secret: Buffer.from(SECRET, "base64"),
    });
    const independent = createHmac("sha256", Buffer.from("abc1234"))
      .update(`${webhookId}.${webhookTimestamp}.${rawBody}`)
      .digest("base64");
    assert.equal(signature, independent);

    const envelope = JSON.stringify({
      webhookId,
      webhookTimestamp,
      webhookSignature: `v1,${signature}`,
    });
    const paid = await payments.handleWebhook(rawBody, envelope);
    const replay = await payments.handleWebhook(rawBody, envelope);
    assert.equal(paid.creditsGranted, 500);
    assert.equal(replay.creditsGranted, 0);
    assert.equal(replay.status, "paid");
    assert.equal(await ledger.balance(userId), 500);

    await assert.rejects(
      () => payments.handleWebhook(rawBody, envelope.replace(signature, `${signature}x`)),
      (error: unknown) => error instanceof PaymentError && error.code === "bad_signature",
    );
    assert.equal(await ledger.balance(userId), 500);

    const mismatch = rawBody.replace(String(inrToPaise(499)), "100");
    const mismatchSig = pineLabsSignature({
      webhookId,
      webhookTimestamp,
      rawBody: mismatch,
      secret: Buffer.from(SECRET, "base64"),
    });
    await assert.rejects(
      () =>
        payments.handleWebhook(
          mismatch,
          JSON.stringify({ webhookId, webhookTimestamp, webhookSignature: mismatchSig }),
        ),
      (error: unknown) => error instanceof PaymentError && error.code === "amount_mismatch",
    );

    const second = await payments.createCheckout({ userId, packId: "starter" });
    const viaCallback = await payments.confirmCallback(second.paymentId);
    const viaCallbackAgain = await payments.confirmCallback(second.paymentId);
    assert.equal(viaCallback.status, "paid");
    assert.equal(viaCallback.creditsGranted, 500);
    assert.equal(viaCallbackAgain.creditsGranted, 0);
    assert.equal(await ledger.balance(userId), 1000);
    assert.ok(calls.some((call) => call.startsWith("POST https://pluraluat.v2.pinepg.in/api/pay/v1/payment-links")));
  } finally {
    await pg.close();
  }
});

test("checkout route uses X-User-Id and the webhook route verifies headers", async () => {
  const pg = await withPg();
  try {
    const ledger = createPostgresLedger(pg.db);
    const userId = await seedUser(pg.db, 0);
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      if (url.endsWith("/api/auth/v1/token")) return Response.json({ access_token: "uat-token", expires_in: 60 });
      if (init?.method === "POST") {
        return Response.json({
          payment_link_id: "pl_http",
          payment_link_url: "https://pluraluat.v2.pinepg.in/pay/pl_http",
          status: "CREATED",
        });
      }
      return Response.json({ status: "CREATED" });
    };
    const now = new Date();
    const payments = createPayments({
      mock: false,
      ledger,
      db: pg.db,
      merchantId: "merchant_uat",
      apiKey: "secret_uat",
      webhookSecret: SECRET,
      fetchImpl,
      now: () => now,
    });
    const app = express();
    app.use(
      express.json({
        verify: (req, _res, buf) => {
          (req as { rawBody?: string }).rawBody = buf.toString("utf8");
        },
      }),
    );
    app.use(paymentsRouter(payments));
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const base = `http://127.0.0.1:${port}`;
      const missingUser = await fetch(`${base}/v1/packs/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ packId: "starter" }),
      });
      assert.equal(missingUser.status, 401);
      const created = await fetch(`${base}/v1/packs/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ packId: "starter" }),
      });
      assert.equal(created.status, 201);
      const checkout = (await created.json()) as { paymentId: string; status: string; checkoutUrl: string };
      assert.equal(checkout.status, "pending");
      const rawBody = JSON.stringify({
        data: {
          merchant_payment_link_reference: checkout.paymentId,
          payment_link_id: "pl_http",
          status: "FAILED",
        },
      });
      const webhookTimestamp = String(Math.floor(now.getTime() / 1000));
      const signature = pineLabsSignature({
        webhookId: "wh_http",
        webhookTimestamp,
        rawBody,
        secret: Buffer.from(SECRET, "base64"),
      });
      const failed = await fetch(`${base}/v1/packs/webhook`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "webhook-id": "wh_http",
          "webhook-timestamp": webhookTimestamp,
          "webhook-signature": `v1,${signature}`,
        },
        body: rawBody,
      });
      assert.equal(failed.status, 200);
      const body = (await failed.json()) as { status: string; creditsGranted: number };
      assert.equal(body.status, "failed");
      assert.equal(body.creditsGranted, 0);
      assert.equal(await ledger.balance(userId), 0);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    await pg.close();
  }
});

function headerOf(headers: HeadersInit, name: string): string {
  if (headers instanceof Headers) return headers.get(name) ?? "";
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === name);
    return found ? String(found[1]) : "";
  }
  const value = (headers as Record<string, string>)[name] ?? (headers as Record<string, string>)[name.toLowerCase()];
  return value ?? "";
}
