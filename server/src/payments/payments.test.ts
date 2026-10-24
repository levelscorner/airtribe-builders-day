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
import { createPayments, pineLabsMockEnabled } from "./service.js";
import { pineLabsSignature } from "./signature.js";

const SECRET = Buffer.from("abc1234").toString("base64");

test("Pine Labs base URL stays on the UAT host", () => {
  assert.equal(assertPineLabsTestOrigin(PINE_LABS_UAT_ORIGIN).origin, PINE_LABS_UAT_ORIGIN);
  assert.throws(
    () => assertPineLabsTestOrigin("https://api.pluralpay.in"),
    (error: unknown) => error instanceof PaymentError && error.code === "live_host_refused",
  );
  assert.throws(
    () => assertPineLabsTestOrigin("https://pluraluat.example.com"),
    (error: unknown) => error instanceof PaymentError && error.code === "live_host_refused",
  );
});

test("PINE_LABS_MOCK defaults on and only an explicit off selects the live adapter", () => {
  const previous = process.env.PINE_LABS_MOCK;
  delete process.env.PINE_LABS_MOCK;
  try {
    assert.equal(pineLabsMockEnabled({}), true);
    assert.equal(pineLabsMockEnabled({ PINE_LABS_MOCK: "1" }), true);
    assert.equal(pineLabsMockEnabled({ PINE_LABS_MOCK: "0" }), false);
    assert.equal(pineLabsMockEnabled({ pineLabsMock: false }), false);
  } finally {
    if (previous === undefined) delete process.env.PINE_LABS_MOCK;
    else process.env.PINE_LABS_MOCK = previous;
  }
});

test("mock checkout stays pending until the simulated capture credits the ledger once", async () => {
  const previous = process.env.PINE_LABS_MOCK;
  delete process.env.PINE_LABS_MOCK;
  try {
    const ledger = createMockLedger();
    const userId = crypto.randomUUID();
    ledger.seedUser(userId, 0);
    const payments = createPayments({ mock: false, ledger, publicBaseUrl: "http://localhost:8787" });
    assert.equal(payments.mode, "mock");
    const packs = await payments.listPacks();
    assert.equal(packs[0]?.id, "starter");
    const checkout = await payments.createCheckout({ userId, packId: "starter" });
    assert.equal(checkout.status, "pending");
    assert.equal(checkout.creditsGranted, 0);
    assert.equal(await ledger.balance(userId), 0);
    assert.equal(
      checkout.checkoutUrl,
      `http://localhost:8787/v1/packs/mock-pay?payment_id=${encodeURIComponent(checkout.paymentId)}`,
    );

    const paid = await payments.mockPay(checkout.paymentId);
    assert.equal(paid.status, "mocked");
    assert.equal(paid.creditsGranted, 500);
    assert.equal(await ledger.balance(userId), 500);
    const again = await payments.mockPay(checkout.paymentId);
    assert.equal(again.creditsGranted, 0);
    const replay = await payments.handleWebhook(
      JSON.stringify({
        data: {
          merchant_payment_link_reference: checkout.paymentId,
          status: "CAPTURED",
          amount: { value: inrToPaise(499) },
        },
      }),
    );
    assert.equal(replay.status, "mocked");
    assert.equal(replay.creditsGranted, 0);
    assert.equal(await ledger.balance(userId), 500);

    const second = await payments.createCheckout({ userId, packId: "creator" });
    const viaWebhook = await payments.handleWebhook(
      JSON.stringify({
        data: {
          merchant_payment_link_reference: second.paymentId,
          status: "CAPTURED",
          amount: { value: inrToPaise(999) },
        },
      }),
    );
    assert.equal(viaWebhook.creditsGranted, 1200);
    assert.equal(await ledger.balance(userId), 1700);

    const mismatch = await payments.createCheckout({ userId, packId: "starter" });
    await assert.rejects(
      () =>
        payments.handleWebhook(
          JSON.stringify({
            data: {
              merchant_payment_link_reference: mismatch.paymentId,
              status: "CAPTURED",
              amount: { value: 100 },
            },
          }),
        ),
      (error: unknown) => error instanceof PaymentError && error.code === "amount_mismatch",
    );
    assert.equal(await ledger.balance(userId), 1700);
    assert.equal((await payments.findPayment(mismatch.paymentId))?.status, "pending");
  } finally {
    if (previous === undefined) delete process.env.PINE_LABS_MOCK;
    else process.env.PINE_LABS_MOCK = previous;
  }
});

test("PINE_LABS_MOCK off without credentials does not build the Plural client", () => {
  const ledger = createMockLedger();
  assert.throws(
    () => createPayments({ mock: false, ledger, PINE_LABS_MOCK: "0" }),
    (error: unknown) => error instanceof PaymentError && error.code === "missing_secret",
  );
});

test("MOCK=1 keeps the fake link even when Pine Labs credentials are set", async () => {
  let called = false;
  const fetchImpl: typeof fetch = async () => {
    called = true;
    return new Response("nope", { status: 500 });
  };
  const ledger = createMockLedger();
  const userId = crypto.randomUUID();
  ledger.seedUser(userId, 0);
  const payments = createPayments({
    mock: true,
    ledger,
    PINE_LABS_MOCK: "0",
    merchantId: "merchant_uat",
    apiKey: "secret_uat",
    webhookSecret: SECRET,
    fetchImpl,
  });
  assert.equal(payments.mode, "mock");
  const checkout = await payments.createCheckout({ userId, packId: "starter" });
  assert.match(checkout.checkoutUrl ?? "", /\/v1\/packs\/mock-pay\?payment_id=/);
  assert.equal(checkout.creditsGranted, 0);
  assert.equal(await ledger.balance(userId), 0);
  assert.equal(called, false);
});

test("mock pay credits the Postgres ledger once", async () => {
  const pg = await withPg();
  try {
    const ledger = createPostgresLedger(pg.db);
    const userId = await seedUser(pg.db, 0);
    const payments = createPayments({
      mock: false,
      ledger,
      db: pg.db,
      PINE_LABS_MOCK: "1",
      publicBaseUrl: "http://localhost:8787",
    });
    const checkout = await payments.createCheckout({ userId, packId: "starter" });
    assert.equal(await ledger.balance(userId), 0);
    const paid = await payments.mockPay(checkout.paymentId);
    const replay = await payments.mockPay(checkout.paymentId);
    assert.equal(paid.creditsGranted, 500);
    assert.equal(replay.creditsGranted, 0);
    assert.equal(await ledger.balance(userId), 500);
    const stored = await pg.db.query<{ provider: string; status: string }>(
      "SELECT provider, status FROM payments WHERE id = $1",
      [checkout.paymentId],
    );
    assert.equal(stored.rows[0]?.provider, "mock");
    assert.equal(stored.rows[0]?.status, "mocked");
  } finally {
    await pg.close();
  }
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
        if (url.includes("pl_test_3")) {
          await pg.db.query("UPDATE payments SET status = 'paid' WHERE provider_ref = 'pl_test_3'");
          return Response.json({ status: "FAILED" });
        }
        if (url.includes("pl_test_4")) return Response.json({ status: "CAPTURED" });
        return Response.json({
          status: "CAPTURED",
          amount: { value: inrToPaise(499), currency: "INR" },
        });
      }
      return new Response("missing", { status: 404 });
    };

    const payments = createPayments({
      mock: false,
      PINE_LABS_MOCK: "0",
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

    const raced = await payments.createCheckout({ userId, packId: "starter" });
    const racedResult = await payments.confirmCallback(raced.paymentId);
    assert.equal(racedResult.status, "paid");
    const racedRow = await pg.db.query("SELECT status FROM payments WHERE id = $1", [raced.paymentId]);
    assert.equal(racedRow.rows[0]?.status, "paid");

    const bare = await payments.createCheckout({ userId, packId: "starter" });
    await assert.rejects(
      () => payments.confirmCallback(bare.paymentId),
      (error: unknown) => error instanceof PaymentError && error.code === "amount_missing",
    );
    const bareRow = await pg.db.query("SELECT status FROM payments WHERE id = $1", [bare.paymentId]);
    assert.equal(bareRow.rows[0]?.status, "pending");
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
      PINE_LABS_MOCK: "0",
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
      const mockPage = await fetch(`${base}/v1/packs/mock-pay?payment_id=${checkout.paymentId}`);
      assert.equal(mockPage.status, 404);
      const mockBody = (await mockPage.json()) as { error: string };
      assert.equal(mockBody.error, "mock_disabled");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    await pg.close();
  }
});

test("mock pay page posts a simulated capture and a replay grants nothing", async () => {
  const previous = process.env.PINE_LABS_MOCK;
  delete process.env.PINE_LABS_MOCK;
  const ledger = createMockLedger();
  const userId = crypto.randomUUID();
  ledger.seedUser(userId, 0);
  const payments = createPayments({ mock: false, ledger, publicBaseUrl: "http://127.0.0.1:8787" });
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use(paymentsRouter(payments));
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const base = `http://127.0.0.1:${port}`;
    const created = await fetch(`${base}/v1/packs/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": userId },
      body: JSON.stringify({ packId: "starter" }),
    });
    assert.equal(created.status, 201);
    const checkout = (await created.json()) as {
      paymentId: string;
      checkoutUrl: string;
      status: string;
      creditsGranted: number;
    };
    assert.equal(checkout.status, "pending");
    assert.equal(checkout.creditsGranted, 0);
    assert.equal(await ledger.balance(userId), 0);
    const pageUrl = new URL(checkout.checkoutUrl);
    const page = await fetch(`${base}${pageUrl.pathname}${pageUrl.search}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Pay \(simulated\)/);
    assert.match(html, new RegExp(checkout.paymentId));
    const paid = await fetch(`${base}/v1/packs/mock-pay`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ payment_id: checkout.paymentId }),
    });
    assert.equal(paid.status, 200);
    const body = (await paid.json()) as { status: string; creditsGranted: number };
    assert.equal(body.status, "mocked");
    assert.equal(body.creditsGranted, 500);
    const replay = await fetch(`${base}/v1/packs/mock-pay`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ paymentId: checkout.paymentId }),
    });
    const replayBody = (await replay.json()) as { creditsGranted: number };
    assert.equal(replayBody.creditsGranted, 0);
    assert.equal(await ledger.balance(userId), 500);
    const receipt = await fetch(`${base}/v1/packs/mock-pay?payment_id=${checkout.paymentId}`);
    const receiptHtml = await receipt.text();
    assert.match(receiptHtml, /already credited/);
  } finally {
    if (previous === undefined) delete process.env.PINE_LABS_MOCK;
    else process.env.PINE_LABS_MOCK = previous;
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
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
