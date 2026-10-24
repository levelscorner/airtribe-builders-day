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
  readonly mode: "mock" | "pine_labs";
  confirmCallback(paymentId: string): Promise<CallbackResult>;
  findPayment(paymentId: string): Promise<PaymentRow | null>;
  /** Simulated capture. Credits through settlePackPurchase, same ref as a real webhook. */
  mockPay(paymentId: string): Promise<WebhookResult>;
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

/** Shared by the Plural webhook and the mock pay page. The ledger ref makes a replay a no-op. */
export async function settlePackPurchase(
  ledger: Ledger,
  payment: Pick<PaymentRow, "id" | "user_id" | "pack_id" | "credits" | "amount_inr" | "status">,
  amountPaise: number | undefined,
): Promise<number> {
  if (amountPaise !== undefined && amountPaise !== inrToPaise(payment.amount_inr)) {
    throw new PaymentError("webhook amount does not match the pack", 400, "amount_mismatch");
  }
  if (payment.status === "paid" || payment.status === "mocked") return 0;
  try {
    const granted = await ledger.grant({
      userId: payment.user_id,
      amount: payment.credits,
      ref: packPurchaseRef(payment.id),
      reason: "pack_purchase",
      meta: { paymentId: payment.id, packId: payment.pack_id },
    });
    return granted.applied ? payment.credits : 0;
  } catch (error) {
    if (error instanceof LedgerError && error.code === "user_not_found") {
      throw new PaymentError("user not found", 404, "user_not_found");
    }
    throw error;
  }
}

const MOCK_OFF = new Set(["0", "false", "off", "no"]);

/** Defaults to on. Only an explicit off value selects the real Plural adapter. */
export function pineLabsMockEnabled(source: Record<string, unknown>): boolean {
  const hasOwn =
    Object.prototype.hasOwnProperty.call(source, "PINE_LABS_MOCK") ||
    Object.prototype.hasOwnProperty.call(source, "pineLabsMock");
  const raw = hasOwn ? (source.PINE_LABS_MOCK ?? source.pineLabsMock) : process.env.PINE_LABS_MOCK;
  if (raw === undefined || raw === null || raw === "") return true;
  if (typeof raw === "boolean") return raw;
  return !MOCK_OFF.has(String(raw).trim().toLowerCase());
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

  async function markFailedIfPending(paymentId: string): Promise<PaymentRow["status"]> {
    const updated = await input.db.query(
      "UPDATE payments SET status = 'failed', updated_at = now() WHERE id = $1 AND status = 'pending' RETURNING status",
      [paymentId],
    );
    if (updated.rows[0]) return "failed";
    const fresh = await input.db.query("SELECT status FROM payments WHERE id = $1", [paymentId]);
    const status = fresh.rows[0] ? asPayment(fresh.rows[0]).status : "pending";
    return status;
  }

  async function creditIfPaid(payment: PaymentRow, amountPaise: number | undefined): Promise<number> {
    if (amountPaise === undefined) {
      throw new PaymentError("paid notice has no amount", 400, "amount_missing");
    }
    const creditsGranted = await settlePackPurchase(input.ledger, payment, amountPaise);
    if (payment.status !== "paid" && payment.status !== "mocked") {
      await input.db.query("UPDATE payments SET status = 'paid', updated_at = now() WHERE id = $1", [payment.id]);
      payment.status = "paid";
    }
    return creditsGranted;
  }

  return {
    mode: "pine_labs",
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
        const status = await markFailedIfPending(payment.id);
        return {
          paymentId: payment.id,
          status: status === "paid" || status === "mocked" ? status : "failed",
          creditsGranted: 0,
        };
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
        const status = await markFailedIfPending(payment.id);
        return { paymentId: payment.id, status, creditsGranted: 0 };
      }
      return { paymentId: payment.id, status: "pending", creditsGranted: 0 };
    },

    async findPayment(paymentId) {
      const found = await input.db.query("SELECT * FROM payments WHERE id = $1", [paymentId]);
      return found.rows[0] ? asPayment(found.rows[0]) : null;
    },

    async mockPay() {
      throw new PaymentError("Pine Labs mock checkout is off", 404, "mock_disabled");
    },
  };
}

export function createMockPayments(input: {
  ledger: Ledger;
  db?: Db;
  publicBaseUrl?: string;
}): PaymentsService {
  const packs = [...CREDIT_PACKS];
  const rows = new Map<string, PaymentRow>();
  const base = (input.publicBaseUrl ?? "http://localhost:8787").replace(/\/$/, "");

  function checkoutUrl(paymentId: string): string {
    return `${base}/v1/packs/mock-pay?payment_id=${encodeURIComponent(paymentId)}`;
  }

  async function remember(row: PaymentRow): Promise<void> {
    rows.set(row.id, row);
    if (!input.db) return;
    await input.db.query(
      `INSERT INTO payments (id, user_id, pack_id, credits, amount_inr, provider, provider_ref, status)
       VALUES ($1, $2, $3, $4, $5, 'mock', $6, $7)`,
      [row.id, row.user_id, row.pack_id, row.credits, row.amount_inr, row.provider_ref, row.status],
    );
  }

  async function find(notice: { paymentId?: string; providerRef?: string }): Promise<PaymentRow | null> {
    if (notice.paymentId && rows.has(notice.paymentId)) return rows.get(notice.paymentId) ?? null;
    for (const row of rows.values()) {
      if (notice.providerRef && row.provider_ref === notice.providerRef) return row;
    }
    if (!input.db) return null;
    if (notice.paymentId) {
      const byId = await input.db.query("SELECT * FROM payments WHERE id = $1", [notice.paymentId]);
      if (byId.rows[0]) {
        const row = asPayment(byId.rows[0]);
        rows.set(row.id, row);
        return row;
      }
    }
    if (notice.providerRef) {
      const byRef = await input.db.query("SELECT * FROM payments WHERE provider_ref = $1", [notice.providerRef]);
      if (byRef.rows[0]) {
        const row = asPayment(byRef.rows[0]);
        rows.set(row.id, row);
        return row;
      }
    }
    return null;
  }

  async function mark(payment: PaymentRow, status: PaymentRow["status"]): Promise<void> {
    payment.status = status;
    rows.set(payment.id, payment);
    if (input.db) {
      await input.db.query("UPDATE payments SET status = $1, updated_at = now() WHERE id = $2", [status, payment.id]);
    }
  }

  async function handleWebhook(rawBody: string): Promise<WebhookResult> {
    const notice = readNotice(rawBody);
    const payment = await find(notice);
    if (!payment) throw new PaymentError("payment not found", 404, "payment_not_found");
    const outcome = classify(notice.status);
    if (outcome === "failed") {
      if (payment.status === "pending") await mark(payment, "failed");
      return { paymentId: payment.id, status: "failed", creditsGranted: 0 };
    }
    if (outcome !== "paid") {
      throw new PaymentError(`webhook status ${notice.status} is not final`, 400, "ignored_status");
    }
    const creditsGranted = await settlePackPurchase(input.ledger, payment, notice.amountPaise);
    if (payment.status === "pending") await mark(payment, "mocked");
    return { paymentId: payment.id, status: "mocked", creditsGranted };
  }

  return {
    mode: "mock",
    async listPacks() {
      return packs.map((pack) => ({ ...pack }));
    },
    async createCheckout({ userId, packId }) {
      const pack = packs.find((item) => item.id === packId);
      if (!pack) throw new PaymentError(`unknown pack: ${packId}`, 400, "unknown_pack");
      const paymentId = crypto.randomUUID();
      const row: PaymentRow = {
        id: paymentId,
        user_id: userId,
        pack_id: pack.id,
        credits: pack.credits,
        amount_inr: pack.amountInr,
        provider_ref: `mock_${paymentId}`,
        status: "pending",
      };
      try {
        await remember(row);
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code === "23503") throw new PaymentError("user not found", 404, "user_not_found");
        throw error;
      }
      return {
        paymentId,
        status: "pending",
        checkoutUrl: checkoutUrl(paymentId),
        creditsGranted: 0,
      };
    },
    handleWebhook,
    async confirmCallback(paymentId) {
      const payment = await find({ paymentId });
      if (!payment) throw new PaymentError("payment not found", 404, "payment_not_found");
      return { paymentId, status: payment.status, creditsGranted: 0 };
    },
    async findPayment(paymentId) {
      return find({ paymentId });
    },
    async mockPay(paymentId) {
      const payment = await find({ paymentId });
      if (!payment) throw new PaymentError("payment not found", 404, "payment_not_found");
      const rawBody = JSON.stringify({
        event: "ORDER_CAPTURED",
        data: {
          payment_link_id: payment.provider_ref,
          merchant_payment_link_reference: payment.id,
          status: "CAPTURED",
          amount: { value: inrToPaise(payment.amount_inr), currency: "INR" },
        },
      });
      return handleWebhook(rawBody);
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
  const publicBase = stringEnv(env, "publicBaseUrl", "PUBLIC_BASE_URL") || "http://localhost:8787";
  // MOCK=1 (contract) and PINE_LABS_MOCK (default on) both stay on the fake link.
  if (env.mock === true || pineLabsMockEnabled(env)) {
    return createMockPayments({
      ledger: env.ledger,
      db: env.db && typeof env.db.query === "function" ? env.db : undefined,
      publicBaseUrl: publicBase,
    });
  }
  const merchantId = stringEnv(env, "merchantId", "PINE_LABS_MERCHANT_ID");
  const apiKey = stringEnv(env, "apiKey", "PINE_LABS_API_KEY");
  const webhookSecret = stringEnv(env, "webhookSecret", "PINE_LABS_WEBHOOK_SECRET");
  if (!merchantId || !apiKey || !webhookSecret) {
    throw new PaymentError(
      "PINE_LABS_MOCK is off but Pine Labs credentials are not set",
      500,
      "missing_secret",
    );
  }
  if (!env.db || typeof env.db.query !== "function") {
    throw new PaymentError("Pine Labs payments require db", 500, "db_required");
  }
  const fetchImpl = typeof env.fetchImpl === "function" ? (env.fetchImpl as typeof fetch) : undefined;
  const baseUrl = typeof env.pineBaseUrl === "string" ? env.pineBaseUrl : undefined;
  return createPinePayments({
    db: env.db,
    ledger: env.ledger,
    client: createPineLabsClient({ clientId: merchantId, clientSecret: apiKey, fetchImpl, baseUrl }),
    webhookSecret,
    publicBaseUrl: publicBase,
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
