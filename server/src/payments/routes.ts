import express, { Router, type Request, type Response } from "express";
import { LedgerError } from "../credits/errors.js";
import { PaymentError } from "./errors.js";
import type { PaymentsService } from "./service.js";

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
<html><head><meta charset="utf-8"/><title>${title}</title></head>
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
<html><head><meta charset="utf-8"/><title>${title}</title></head>
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
<html><head><meta charset="utf-8"/><title>${title}</title></head>
<body>
<h1>${title}</h1>
<p>Payment <code>${escapeHtml(result.paymentId)}</code> is ${escapeHtml(result.status)}.</p>
<p>Credits applied on this visit: ${result.creditsGranted}.</p>
</body></html>`);
    } catch (error) {
      sendError(res, error);
    }
  });

  return router;
}
