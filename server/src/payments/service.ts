import type { Db } from "../credits/db.js";
import { LedgerError } from "../credits/errors.js";
import type { Ledger } from "../credits/ledger.js";
import { PaymentError } from "./errors.js";
import { CREDIT_PACKS, inrToPaise, type CreditPack } from "./packs.js";
import { createPineLabsClient, type PineLabsClient } from "./pine.js";
import { decodeWebhookSecret, verifyPineLabsWebhook } from "./signature.js";

export interface CheckoutResponse {
  paymentId: string;
  status: "pending" | "paid" | "mocked";
  checkoutUrl?: string;
  creditsGranted?: number;
}

export interface WebhookResult {
  paymentId: string;
  status: "paid" | "failed" | "mocked";
  creditsGranted: number;
}

export interface Payments {
  listPacks(): Promise<CreditPack[]>;
  createCheckout(input: { userId: string; packId: string }): Promise<CheckoutResponse>;
  handleWebhook(rawBody: string, signature?: string): Promise<WebhookResult>;
}

export interface CallbackResult {
  paymentId: string;
  status: "paid" | "failed" | "pending" | "mocked";
  creditsGranted: number;
}

export interface PaymentsService extends Payments {
  confirmCallback(paymentId: string): Promise<CallbackResult>;
}

const PAID = new Set(["PAID", "CAPTURED", "PROCESSED", "SUCCESS", "ORDER_CAPTURED"]);
const FAILED = new Set(["FAILED", "CANCELLED", "CANCELED", "EXPIRED"]);

interface PaymentRow {
  id: string;
  user_id: string;
  pack_id: string;
  credits: number;
  amount_inr: number;
  provider_ref: string | null;
  status: "pending" | "paid" | "failed" | "mocked";
}

function asPayment(record: Record<string, unknown>): PaymentRow {
  return {
    id: String(record.id),
    user_id: String(record.user_id),
    pack_id: String(record.pack_id),
    credits: Number(record.credits),
    amount_inr: Number(record.amount_inr),
    provider_ref: record.provider_ref == null ? null : String(record.provider_ref),
    status: String(record.status) as PaymentRow["status"],
  };
}

function packPurchaseRef(paymentId: string): string {
  return `pack:${paymentId}`;
}

function classify(status: string): "paid" | "failed" | "pending" {
  const normalized = status.trim().toUpperCase();
  if (PAID.has(normalized)) return "paid";
  if (FAILED.has(normalized)) return "failed";
  return "pending";
}

interface ProviderNotice {
  paymentId?: string;
  providerRef?: string;
  status: string;
  amountPaise?: number;
}

function readNotice(rawBody: string): ProviderNotice {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    throw new PaymentError("webhook body is not JSON", 400, "bad_webhook");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new PaymentError("webhook body is not an object", 400, "bad_webhook");
  }
  const body = parsed as Record<string, unknown>;
  const data =
    body.data && typeof body.data === "object" && !Array.isArray(body.data)
      ? (body.data as Record<string, unknown>)
      : body;
  const amount = data.amount ?? data.payment_link_amount;
  const amountPaise =
    amount && typeof amount === "object" && amount !== null && "value" in amount
      ? Number((amount as { value: unknown }).value)
      : undefined;
  const merchantRef = data.merchant_payment_link_reference ?? body.merchant_payment_link_reference;
  const providerRef = data.payment_link_id ?? body.payment_link_id;
  const status = String(data.status ?? body.status ?? body.event ?? "");
  return {
    paymentId: typeof merchantRef === "string" ? merchantRef : undefined,
    providerRef: typeof providerRef === "string" ? providerRef : undefined,
    status,
    amountPaise: Number.isFinite(amountPaise) ? amountPaise : undefined,
  };
}

export function createPinePayments(input: {
  db: Db;
  ledger: Ledger;
  client: PineLabsClient;
  webhookSecret: string;
  publicBaseUrl: string;
  packs?: readonly CreditPack[];
  now?: () => Date;
}): PaymentsService {
  const packs = input.packs ?? CREDIT_PACKS;
  const secret = decodeWebhookSecret(input.webhookSecret);
  const base = input.publicBaseUrl.replace(/\/$/, "");

  async function loadPayment(notice: { paymentId?: string; providerRef?: string }): Promise<PaymentRow> {
    if (notice.paymentId) {
      const byId = await input.db.query("SELECT * FROM payments WHERE id = $1", [notice.paymentId]);
      if (byId.rows[0]) return asPayment(byId.rows[0]);
    }
    if (notice.providerRef) {
      const byRef = await input.db.query("SELECT * FROM payments WHERE provider_ref = $1", [notice.providerRef]);
      if (byRef.rows[0]) return asPayment(byRef.rows[0]);
    }
    throw new PaymentError("payment not found", 404, "payment_not_found");
  }

  async function creditIfPaid(payment: PaymentRow, amountPaise: number | undefined): Promise<number> {
    if (amountPaise !== undefined && amountPaise !== inrToPaise(payment.amount_inr)) {
      throw new PaymentError("webhook amount does not match the pack", 400, "amount_mismatch");
    }
    if (payment.status === "paid" || payment.status === "mocked") return 0;
    try {
      const granted = await input.ledger.grant({
        userId: payment.user_id,
        amount: payment.credits,
        ref: packPurchaseRef(payment.id),
        reason: "pack_purchase",
        meta: { paymentId: payment.id, packId: payment.pack_id },
      });
      await input.db.query("UPDATE payments SET status = 'paid', updated_at = now() WHERE id = $1", [payment.id]);
      return granted.applied ? payment.credits : 0;
    } catch (error) {
      if (error instanceof LedgerError && error.code === "user_not_found") {
        throw new PaymentError("user not found", 404, "user_not_found");
      }
      throw error;
    }
  }

  return {
    async listPacks() {
      return [...packs];
    },

    async createCheckout({ userId, packId }) {
      const pack = packs.find((item) => item.id === packId);
      if (!pack) throw new PaymentError(`unknown pack: ${packId}`, 400, "unknown_pack");
      const paymentId = crypto.randomUUID();
      try {
        await input.db.query(
          `INSERT INTO payments (id, user_id, pack_id, credits, amount_inr, provider, status)
           VALUES ($1, $2, $3, $4, $5, 'pine_labs', 'pending')`,
          [paymentId, userId, pack.id, pack.credits, pack.amountInr],
        );
      } catch (error) {
        if (error instanceof LedgerError) throw error;
        const code = (error as { code?: string }).code;
        if (code === "23503") throw new PaymentError("user not found", 404, "user_not_found");
        throw error;
      }
      try {
        const link = await input.client.createPaymentLink({
          reference: paymentId,
          amountPaise: inrToPaise(pack.amountInr),
          description: pack.label,
          callbackUrl: `${base}/v1/packs/callback?payment_id=${paymentId}`,
        });
        await input.db.query(
          "UPDATE payments SET provider_ref = $1, updated_at = now() WHERE id = $2",
          [link.paymentLinkId, paymentId],
        );
        return { paymentId, status: "pending" as const, checkoutUrl: link.paymentLinkUrl };
      } catch (error) {
        await input.db.query("UPDATE payments SET status = 'failed', updated_at = now() WHERE id = $1", [paymentId]);
        throw error;
      }
    },

    async handleWebhook(rawBody, signature) {
      verifyPineLabsWebhook({ rawBody, signature, secret, now: input.now?.() });
      const notice = readNotice(rawBody);
      const payment = await loadPayment(notice);
      const outcome = classify(notice.status);
      if (outcome === "paid") {
        const creditsGranted = await creditIfPaid(payment, notice.amountPaise);
        return { paymentId: payment.id, status: "paid" as const, creditsGranted };
      }
      if (outcome === "failed") {
        if (payment.status === "pending") {
          await input.db.query("UPDATE payments SET status = 'failed', updated_at = now() WHERE id = $1", [
            payment.id,
          ]);
        }
        return { paymentId: payment.id, status: "failed" as const, creditsGranted: 0 };
      }
      throw new PaymentError(`webhook status ${notice.status} is not final`, 400, "ignored_status");
    },

    async confirmCallback(paymentId) {
      const found = await input.db.query("SELECT * FROM payments WHERE id = $1", [paymentId]);
      const record = found.rows[0];
      if (!record) throw new PaymentError("payment not found", 404, "payment_not_found");
      const payment = asPayment(record);
      if (payment.status === "paid" || payment.status === "mocked") {
        return { paymentId: payment.id, status: payment.status, creditsGranted: 0 };
      }
      if (payment.status === "failed") {
        return { paymentId: payment.id, status: "failed", creditsGranted: 0 };
      }
      if (!payment.provider_ref) {
        return { paymentId: payment.id, status: "pending", creditsGranted: 0 };
      }
      const remote = await input.client.getPaymentLink(payment.provider_ref);
      const outcome = classify(remote.status);
      if (outcome === "paid") {
        const creditsGranted = await creditIfPaid(payment, remote.amountPaise);
        return { paymentId: payment.id, status: "paid", creditsGranted };
      }
      if (outcome === "failed") {
        await input.db.query("UPDATE payments SET status = 'failed', updated_at = now() WHERE id = $1", [payment.id]);
        return { paymentId: payment.id, status: "failed", creditsGranted: 0 };
      }
      return { paymentId: payment.id, status: "pending", creditsGranted: 0 };
    },
  };
}

export function createMockPayments(input: { ledger: Ledger; publicBaseUrl?: string }): PaymentsService {
  const packs = [...CREDIT_PACKS];
  const rows = new Map<string, PaymentRow>();
  const base = (input.publicBaseUrl ?? "http://localhost:8787").replace(/\/$/, "");

  return {
    async listPacks() {
      return packs.map((pack) => ({ ...pack }));
    },
    async createCheckout({ userId, packId }) {
      const pack = packs.find((item) => item.id === packId);
      if (!pack) throw new PaymentError(`unknown pack: ${packId}`, 400, "unknown_pack");
      const paymentId = crypto.randomUUID();
      const granted = await input.ledger.grant({
        userId,
        amount: pack.credits,
        ref: packPurchaseRef(paymentId),
        reason: "pack_purchase",
        meta: { paymentId, packId, mode: "mock" },
      });
      rows.set(paymentId, {
        id: paymentId,
        user_id: userId,
        pack_id: pack.id,
        credits: pack.credits,
        amount_inr: pack.amountInr,
        provider_ref: null,
        status: "mocked",
      });
      return {
        paymentId,
        status: "mocked",
        checkoutUrl: `${base}/v1/packs/callback?payment_id=${paymentId}`,
        creditsGranted: granted.applied ? pack.credits : 0,
      };
    },
    async handleWebhook(rawBody) {
      const notice = readNotice(rawBody);
      const paymentId = notice.paymentId;
      if (!paymentId || !rows.has(paymentId)) {
        throw new PaymentError("payment not found", 404, "payment_not_found");
      }
      const payment = rows.get(paymentId)!;
      return { paymentId: payment.id, status: "mocked", creditsGranted: 0 };
    },
    async confirmCallback(paymentId) {
      const payment = rows.get(paymentId);
      if (!payment) throw new PaymentError("payment not found", 404, "payment_not_found");
      return { paymentId, status: payment.status, creditsGranted: 0 };
    },
  };
}

export function createPayments(env: {
  mock: boolean;
  ledger?: Ledger;
  db?: Db;
  [key: string]: unknown;
}): PaymentsService {
  if (!env.ledger || typeof env.ledger.grant !== "function") {
    throw new PaymentError("payments require a ledger", 500, "ledger_required");
  }
  if (env.mock) {
    return createMockPayments({
      ledger: env.ledger,
      publicBaseUrl: typeof env.publicBaseUrl === "string" ? env.publicBaseUrl : undefined,
    });
  }
  if (!env.db || typeof env.db.query !== "function") {
    throw new PaymentError("Pine Labs payments require db", 500, "db_required");
  }
  const merchantId = stringEnv(env, "merchantId", "PINE_LABS_MERCHANT_ID");
  const apiKey = stringEnv(env, "apiKey", "PINE_LABS_API_KEY");
  const webhookSecret = stringEnv(env, "webhookSecret", "PINE_LABS_WEBHOOK_SECRET");
  if (!merchantId || !apiKey || !webhookSecret) {
    throw new PaymentError("Pine Labs TEST MODE needs merchant id, api key, and webhook secret", 500, "missing_secret");
  }
  const publicBaseUrl = stringEnv(env, "publicBaseUrl", "PUBLIC_BASE_URL") || "http://localhost:8787";
  const fetchImpl = typeof env.fetchImpl === "function" ? (env.fetchImpl as typeof fetch) : undefined;
  const baseUrl = typeof env.pineBaseUrl === "string" ? env.pineBaseUrl : undefined;
  return createPinePayments({
    db: env.db,
    ledger: env.ledger,
    client: createPineLabsClient({ clientId: merchantId, clientSecret: apiKey, fetchImpl, baseUrl }),
    webhookSecret,
    publicBaseUrl,
    now: typeof env.now === "function" ? (env.now as () => Date) : undefined,
  });
}

function stringEnv(env: Record<string, unknown>, key: string, alt: string): string {
  const direct = env[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const fromProcess = env[alt];
  if (typeof fromProcess === "string" && fromProcess.trim()) return fromProcess.trim();
  return "";
}
