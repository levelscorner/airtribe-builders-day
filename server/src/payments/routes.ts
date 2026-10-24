import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express, { Router, type Request, type Response } from "express";
import { LedgerError } from "../credits/errors.js";
import { VIEWPORT_META } from "../html.js";
import { PaymentError } from "./errors.js";
import { CREDIT_PACKS } from "./packs.js";
import { PHONEPE_PAYEE } from "./qr.js";
import type { PaymentsService } from "./service.js";

const qrFile = resolve(dirname(fileURLToPath(import.meta.url)), "../../../apps/mobile/assets/payments/phonepe-qr.jpg");
const PAGE_HEAD = `<meta charset="utf-8"/>${VIEWPORT_META}<style>
  body{font-family:system-ui,sans-serif;margin:1rem;line-height:1.45;color:#1a1a1a}
  img{width:min(100%,320px);height:auto}
  input,button,select{font:inherit;min-height:44px;max-width:100%}
  form{display:grid;gap:0.75rem;max-width:28rem}
  @media (min-width:800px){body{margin:2rem auto;max-width:40rem}}
</style>`;

export function rawBodyOf(req: Request): string {
  const withRaw = req as Request & { rawBody?: string };
  if (typeof withRaw.rawBody === "string") return withRaw.rawBody;
  if (Buffer.isBuffer(req.body)) return req.body.toString("utf8");
  if (typeof req.body === "string") return req.body;
  return "";
}

function sendError(res: Response, error: unknown): void {
  if (error instanceof PaymentError) {
    res.status(error.statusCode).json({ error: error.code, message: error.message });
    return;
  }
  if (error instanceof LedgerError && error.code === "user_not_found") {
    res.status(404).json({ error: error.code, message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "payment failed";
  res.status(500).json({ error: "payment_failed", message });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paymentIdFrom(req: Request): string {
  const query = typeof req.query.payment_id === "string" ? req.query.payment_id.trim() : "";
  const body = req.body;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const fromBody = record.payment_id ?? record.paymentId;
    if (typeof fromBody === "string" && fromBody.trim()) return fromBody.trim();
  }
  return query;
}

export interface PaymentHooks {
  onCreditsGranted?: (info: { userId?: string; paymentId: string; creditsGranted: number }) => Promise<void>;
}

async function noteGrant(
  hooks: PaymentHooks | undefined,
  info: { userId?: string; paymentId: string; creditsGranted: number },
): Promise<void> {
  if (!hooks?.onCreditsGranted || info.creditsGranted <= 0) return;
  try {
    await hooks.onCreditsGranted(info);
  } catch (error) {
    console.warn(`traction log failed: ${error instanceof Error ? error.message : error}`);
  }
}

export function paymentsRouter(payments: PaymentsService, hooks?: PaymentHooks): Router {
  const router = Router();

  router.get("/v1/packs", async (_req, res) => {
    res.json({ packs: await payments.listPacks() });
  });

  router.post("/v1/packs/checkout", async (req, res) => {
    const userId = req.header("x-user-id")?.trim();
    if (!userId) {
      res.status(401).json({ error: "missing_user", message: "X-User-Id is required until session auth lands" });
      return;
    }
    const packId = req.body?.packId;
    if (typeof packId !== "string" || !packId) {
      res.status(400).json({ error: "pack_id_required", message: "packId is required" });
      return;
    }
    try {
      const checkout = await payments.createCheckout({ userId, packId });
      await noteGrant(hooks, {
        userId,
        paymentId: checkout.paymentId,
        creditsGranted: checkout.creditsGranted ?? 0,
      });
      res.status(201).json(checkout);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/v1/packs/webhook", async (req, res) => {
    const rawBody = rawBodyOf(req);
    const headerSignature = req.header("webhook-signature");
    const signature =
      headerSignature || req.header("webhook-id") || req.header("webhook-timestamp")
        ? JSON.stringify({
            webhookId: req.header("webhook-id") ?? "",
            webhookTimestamp: req.header("webhook-timestamp") ?? "",
            webhookSignature: headerSignature ?? "",
          })
        : undefined;
    try {
      const result = await payments.handleWebhook(rawBody, signature);
      const payment = await payments.findPayment(result.paymentId);
      await noteGrant(hooks, {
        userId: payment?.user_id,
        paymentId: result.paymentId,
        creditsGranted: result.creditsGranted,
      });
      res.json(result);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/v1/packs/mock-pay", async (req, res) => {
    if (payments.mode !== "mock") {
      res.status(404).json({ error: "mock_disabled", message: "Pine Labs mock checkout is off" });
      return;
    }
    const paymentId = paymentIdFrom(req);
    if (!paymentId) {
      res.status(400).json({ error: "payment_id_required", message: "payment_id is required" });
      return;
    }
    try {
      const payment = await payments.findPayment(paymentId);
      if (!payment) {
        res.status(404).json({ error: "payment_not_found", message: "payment not found" });
        return;
      }
      const settled = payment.status === "mocked" || payment.status === "paid";
      const title = settled ? "Payment received" : payment.status === "failed" ? "Payment failed" : "Mock payment";
      const action = settled
        ? `<p>This simulated capture already credited the ledger.</p>`
        : payment.status === "failed"
          ? `<p>This payment failed. Nothing was credited.</p>`
          : `<form method="post" action="/v1/packs/mock-pay">
<input type="hidden" name="payment_id" value="${escapeHtml(payment.id)}"/>
<button type="submit">Pay (simulated)</button>
</form>
<p>Submitting posts a simulated webhook. No charge leaves this server.</p>`;
      res.type("html").send(`<!doctype html>
<html><head>${PAGE_HEAD}<title>${title}</title></head>
<body>
<h1>${title}</h1>
<p>Payment <code>${escapeHtml(payment.id)}</code> is ${escapeHtml(payment.status)}.</p>
<p>Pack <code>${escapeHtml(payment.pack_id)}</code> · ${payment.credits} credits · ₹${payment.amount_inr}</p>
${action}
</body></html>`);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/v1/packs/mock-pay", express.urlencoded({ extended: false }), async (req, res) => {
    if (payments.mode !== "mock") {
      res.status(404).json({ error: "mock_disabled", message: "Pine Labs mock checkout is off" });
      return;
    }
    const paymentId = paymentIdFrom(req);
    if (!paymentId) {
      res.status(400).json({ error: "payment_id_required", message: "payment_id is required" });
      return;
    }
    try {
      const result = await payments.mockPay(paymentId);
      const payment = await payments.findPayment(paymentId);
      await noteGrant(hooks, {
        userId: payment?.user_id,
        paymentId: result.paymentId,
        creditsGranted: result.creditsGranted,
      });
      if ((req.header("accept") ?? "").includes("application/json")) {
        res.json(result);
        return;
      }
      const title = result.status === "failed" ? "Payment failed" : "Payment received";
      res.type("html").send(`<!doctype html>
<html><head>${PAGE_HEAD}<title>${title}</title></head>
<body>
<h1>${title}</h1>
<p>Payment <code>${escapeHtml(result.paymentId)}</code> is ${escapeHtml(result.status)}.</p>
<p>Credits applied on this visit: ${result.creditsGranted}.</p>
</body></html>`);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/v1/packs/callback", async (req, res) => {
    const paymentId = typeof req.query.payment_id === "string" ? req.query.payment_id : "";
    try {
      const result = await payments.confirmCallback(paymentId);
      const payment = await payments.findPayment(result.paymentId);
      await noteGrant(hooks, {
        userId: payment?.user_id,
        paymentId: result.paymentId,
        creditsGranted: result.creditsGranted,
      });
      const title =
        result.status === "paid" || result.status === "mocked" ? "Payment received" : "Payment pending";
      res.type("html").send(`<!doctype html>
<html><head>${PAGE_HEAD}<title>${title}</title></head>
<body>
<h1>${title}</h1>
<p>Payment <code>${escapeHtml(result.paymentId)}</code> is ${escapeHtml(result.status)}.</p>
<p>Credits applied on this visit: ${result.creditsGranted}.</p>
</body></html>`);
    } catch (error) {
      sendError(res, error);
    }
  });

  router.get("/payments/phonepe-qr.jpg", (_req, res) => {
    if (!existsSync(qrFile)) {
      res.status(404).type("text").send("phonepe-qr.jpg is not in the repo yet");
      return;
    }
    res.type("jpeg").sendFile(qrFile);
  });

  router.get("/v1/packs/qr", async (req, res) => {
    if (payments.mode !== "qr" || !payments.findPayment) {
      res.status(404).json({ error: "qr_disabled", message: "PhonePe QR is off. PAYMENTS_MODE is not qr." });
      return;
    }
    const paymentId = typeof req.query.payment_id === "string" ? req.query.payment_id.trim() : "";
    try {
      const payment = paymentId ? await payments.findPayment(paymentId) : null;
      if (paymentId && !payment) {
        res.status(404).json({ error: "payment_not_found", message: "payment not found" });
        return;
      }
      const packs = payment
        ? [{ id: payment.pack_id, label: payment.pack_id, credits: payment.credits, amountInr: payment.amount_inr }]
        : (await payments.listPacks()).map((pack) => ({ ...pack, amountInr: pack.amountInr }));
      res.type("html").send(renderQrPage({ paymentId, packs, notice: "" }));
    } catch (error) {
      sendError(res, error);
    }
  });

  router.post("/v1/packs/qr", express.urlencoded({ extended: false }), async (req, res) => {
    await submitQr(payments, req, res);
  });

  router.post("/v1/packs/phonepe", async (req, res) => {
    await submitQr(payments, req, res);
  });

  return router;
}

async function submitQr(payments: PaymentsService, req: Request, res: Response): Promise<void> {
  if (payments.mode !== "qr" || !payments.submitUtr) {
    res.status(404).json({ error: "qr_disabled", message: "PhonePe QR is off. PAYMENTS_MODE is not qr." });
    return;
  }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const userId = req.header("x-user-id")?.trim() || req.browserSession?.userId || "";
  const paymentId = textField(body.payment_id) || textField(body.paymentId) || paymentIdFrom(req);
  const packId = textField(body.pack_id) || textField(body.packId);
  const utr = textField(body.utr) || textField(body.upi_ref);
  if (!userId && !paymentId) {
    res.status(401).json({ error: "missing_user", message: "X-User-Id is required until session auth lands" });
    return;
  }
  try {
    const result = await payments.submitUtr({ userId, paymentId, packId, utr });
    const wantsJson = req.is("application/json") || (req.header("accept") ?? "").includes("application/json");
    if (wantsJson) {
      res.status(201).json(result);
      return;
    }
    const packs = CREDIT_PACKS.map((pack) => ({ ...pack }));
    res.type("html").send(
      renderQrPage({
        paymentId: result.paymentId,
        packs,
        notice: `UTR saved. Status is pending verification. Credits applied on this visit: ${result.creditsGranted}.`,
      }),
    );
  } catch (error) {
    sendError(res, error);
  }
}

function textField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function renderQrPage(input: {
  paymentId: string;
  packs: Array<{ id: string; label: string; credits: number; amountInr: number }>;
  notice: string;
}): string {
  const choices = input.packs
    .map(
      (pack, index) => `<label><input type="radio" name="pack_id" value="${escapeHtml(pack.id)}"${index === 0 ? " checked" : ""}/> ${escapeHtml(pack.label)} · ₹${pack.amountInr} · ${pack.credits} credits</label>`,
    )
    .join("");
  const hiddenPayment = input.paymentId
    ? `<input type="hidden" name="payment_id" value="${escapeHtml(input.paymentId)}"/>`
    : "";
  return `<!doctype html>
<html><head>${PAGE_HEAD}<title>PhonePe payment</title></head>
<body>
<h1>Pay ${escapeHtml(PHONEPE_PAYEE)}</h1>
<p>Scan the PhonePe QR, then enter the UPI reference. Credits stay pending until an admin approves.</p>
<img src="/payments/phonepe-qr.jpg" alt="PhonePe QR for ${escapeHtml(PHONEPE_PAYEE)}" width="320"/>
${input.notice ? `<p>${escapeHtml(input.notice)}</p>` : ""}
<form method="post" action="/v1/packs/qr">
${hiddenPayment}
<fieldset>${choices}</fieldset>
<label>UPI ref / UTR <input name="utr" autocomplete="off" inputmode="text" required/></label>
<button type="submit">I've paid</button>
</form>
</body></html>`;
}
