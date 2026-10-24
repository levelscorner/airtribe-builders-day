import { createHash } from "node:crypto";
import type { Db } from "../credits/db.js";
import { isUniqueViolation, LedgerError } from "../credits/errors.js";
import type { Ledger } from "../credits/ledger.js";
import { PaymentError } from "./errors.js";
import { CREDIT_PACKS, findPack, type CreditPack } from "./packs.js";

export const PHONEPE_PAYEE = "ABHINAV RANA";
export const PHONEPE_PROVIDER = "phonepe";

export interface PendingPayment {
  id: string;
  userId: string;
  packId: string;
  credits: number;
  amountInr: number;
  utr: string;
}

export interface QrCheckout {
  paymentId: string;
  status: "pending";
  checkoutUrl: string;
  creditsGranted: 0;
  payee: typeof PHONEPE_PAYEE;
  amountInr: number;
  credits: number;
}

export interface QrSubmission {
  paymentId: string;
  status: "pending_verification";
  creditsGranted: 0;
}

interface StoredPayment {
  id: string;
  user_id: string;
  pack_id: string;
  credits: number;
  amount_inr: number;
  provider_ref: string | null;
  status: "pending" | "paid" | "failed" | "mocked" | "pending_verification" | "rejected";
}

export interface QrPayments {
  readonly mode: "qr";
  listPacks(): Promise<CreditPack[]>;
  createCheckout(input: { userId: string; packId: string }): Promise<QrCheckout>;
  submitUtr(input: { userId?: string; paymentId?: string; packId?: string; utr: string }): Promise<QrSubmission>;
  findPayment(paymentId: string): Promise<StoredPayment | null>;
  listPending(): Promise<PendingPayment[]>;
  approvePayment(paymentId: string): Promise<{ paymentId: string; status: "paid"; creditsGranted: number }>;
  rejectPayment(paymentId: string): Promise<{ paymentId: string; status: "rejected" }>;
  handleWebhook(): Promise<never>;
  confirmCallback(paymentId: string): Promise<{ paymentId: string; status: "paid" | "failed" | "pending" | "mocked"; creditsGranted: number }>;
  mockPay(): Promise<never>;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Mock-studio ids are not uuids. Map them to a stable uuid so the ledger foreign key holds. */
export function paymentUserId(raw: string): string {
  const trimmed = raw.trim();
  if (UUID_RE.test(trimmed)) return trimmed.toLowerCase();
  const bytes = createHash("sha256").update(trimmed).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Buffer.from(bytes).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function normalizeUtr(raw: string): string {
  const utr = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z0-9]{8,22}$/.test(utr)) {
    throw new PaymentError("Enter the UPI reference (UTR)", 400, "bad_utr");
  }
  return utr;
}

export function createQrPayments(input: {
  ledger: Ledger;
  db?: Db;
  packs?: readonly CreditPack[];
  publicBaseUrl: string;
}): QrPayments {
  const packs = input.packs ?? CREDIT_PACKS;
  const base = input.publicBaseUrl.replace(/\/$/, "");
  const memory: StoredPayment[] = [];
  let ready: Promise<void> | null = null;

  async function storeReady(): Promise<void> {
    if (!input.db) return;
    if (!ready) ready = widenPaymentStatus(input.db);
    await ready;
  }

  async function ensureUser(userId: string): Promise<string> {
    const id = paymentUserId(userId);
    if (!input.db) return id;
    await storeReady();
    await input.db.query(
      `INSERT INTO users (id, display_name, credit_balance) VALUES ($1, 'Creator', 0) ON CONFLICT (id) DO NOTHING`,
      [id],
    );
    return id;
  }

  async function insertPending(userId: string, pack: CreditPack): Promise<StoredPayment> {
    const id = crypto.randomUUID();
    const owner = await ensureUser(userId);
    const row: StoredPayment = {
      id,
      user_id: owner,
      pack_id: pack.id,
      credits: pack.credits,
      amount_inr: pack.amountInr,
      provider_ref: null,
      status: "pending",
    };
    if (!input.db) {
      memory.push(row);
      return row;
    }
    await input.db.query(
      `INSERT INTO payments (id, user_id, pack_id, credits, amount_inr, provider, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [row.id, row.user_id, row.pack_id, row.credits, row.amount_inr, PHONEPE_PROVIDER],
    );
    return row;
  }

  async function read(paymentId: string): Promise<StoredPayment | null> {
    if (!input.db) return memory.find((row) => row.id === paymentId) ?? null;
    await storeReady();
    const found = await input.db.query<StoredPayment>(
      `SELECT id, user_id, pack_id, credits, amount_inr, provider_ref, status FROM payments WHERE id = $1`,
      [paymentId],
    );
    return found.rows[0] ?? null;
  }

  async function markUtr(row: StoredPayment, utr: string): Promise<void> {
    if (!input.db) {
      const taken = memory.find((item) => item.provider_ref === utr && item.id !== row.id);
      if (taken) throw new PaymentError("That UTR is already used", 409, "duplicate_utr");
      row.provider_ref = utr;
      row.status = "pending_verification";
      return;
    }
    try {
      const updated = await input.db.query<{ id: string }>(
        `UPDATE payments
            SET provider_ref = $2, status = 'pending_verification', updated_at = now()
          WHERE id = $1 AND status = 'pending'
          RETURNING id`,
        [row.id, utr],
      );
      if (!updated.rows[0]) throw new PaymentError("payment is not awaiting a UTR", 409, "not_pending");
    } catch (error) {
      if (error instanceof PaymentError) throw error;
      if (isUniqueViolation(error)) throw new PaymentError("That UTR is already used", 409, "duplicate_utr");
      throw error;
    }
  }

  return {
    mode: "qr",
    async listPacks() {
      return packs.map((pack) => ({ ...pack }));
    },
    async createCheckout({ userId, packId }) {
      const pack = packOrThrow(await this.listPacks(), packId);
      const row = await insertPending(userId, pack);
      return {
        paymentId: row.id,
        status: "pending",
        checkoutUrl: `${base}/v1/packs/qr?payment_id=${encodeURIComponent(row.id)}`,
        creditsGranted: 0,
        payee: PHONEPE_PAYEE,
        amountInr: pack.amountInr,
        credits: pack.credits,
      };
    },
    async submitUtr(submission) {
      const utr = normalizeUtr(submission.utr);
      let row = submission.paymentId ? await read(submission.paymentId) : null;
      if (!row) {
        if (!submission.userId || !submission.packId) {
          throw new PaymentError("payment not found", 404, "payment_not_found");
        }
        const pack = packOrThrow(await this.listPacks(), submission.packId);
        row = await insertPending(submission.userId, pack);
      }
      if (row.status === "pending_verification" && row.provider_ref === utr) {
        return { paymentId: row.id, status: "pending_verification", creditsGranted: 0 };
      }
      if (row.status !== "pending") {
        throw new PaymentError("payment is not awaiting a UTR", 409, "not_pending");
      }
      await markUtr(row, utr);
      return { paymentId: row.id, status: "pending_verification", creditsGranted: 0 };
    },
    findPayment: read,
    async listPending() {
      if (!input.db) {
        return memory.filter((row) => row.status === "pending_verification").map(pendingFrom);
      }
      await storeReady();
      const found = await input.db.query<StoredPayment>(
        `SELECT id, user_id, pack_id, credits, amount_inr, provider_ref, status
           FROM payments
          WHERE status = 'pending_verification'
          ORDER BY created_at ASC`,
      );
      return found.rows.map(pendingFrom);
    },
    async approvePayment(paymentId) {
      const row = await read(paymentId);
      if (!row) throw new PaymentError("payment not found", 404, "payment_not_found");
      if (row.status === "paid") return { paymentId, status: "paid", creditsGranted: 0 };
      if (row.status !== "pending_verification" || !row.provider_ref) {
        throw new PaymentError("payment is not waiting for review", 409, "not_pending");
      }
      let creditsGranted = 0;
      try {
        const granted = await input.ledger.grant({
          userId: row.user_id,
          amount: row.credits,
          ref: row.provider_ref,
          reason: "pack_purchase",
          meta: { paymentId: row.id, packId: row.pack_id, provider: PHONEPE_PROVIDER },
        });
        creditsGranted = granted.applied ? row.credits : 0;
      } catch (error) {
        if (error instanceof LedgerError && error.code === "user_not_found") {
          throw new PaymentError("user not found", 404, "user_not_found");
        }
        throw error;
      }
      if (input.db) {
        await input.db.query(
          `UPDATE payments SET status = 'paid', updated_at = now() WHERE id = $1 AND status = 'pending_verification'`,
          [paymentId],
        );
      } else {
        row.status = "paid";
      }
      return { paymentId, status: "paid", creditsGranted };
    },
    async rejectPayment(paymentId) {
      const row = await read(paymentId);
      if (!row) throw new PaymentError("payment not found", 404, "payment_not_found");
      if (row.status === "rejected") return { paymentId, status: "rejected" };
      if (row.status !== "pending_verification") {
        throw new PaymentError("payment is not waiting for review", 409, "not_pending");
      }
      if (input.db) {
        await input.db.query(
          `UPDATE payments SET status = 'rejected', updated_at = now() WHERE id = $1 AND status = 'pending_verification'`,
          [paymentId],
        );
      } else {
        row.status = "rejected";
      }
      return { paymentId, status: "rejected" };
    },
    handleWebhook() {
      return Promise.reject(new PaymentError("Pine Labs webhooks are dormant in qr mode", 404, "pine_dormant"));
    },
    async confirmCallback(paymentId) {
      const row = await read(paymentId);
      if (!row) throw new PaymentError("payment not found", 404, "payment_not_found");
      const status = row.status === "pending_verification" || row.status === "rejected" ? "pending" : row.status;
      return { paymentId, status, creditsGranted: 0 as const };
    },
    mockPay() {
      return Promise.reject(new PaymentError("Pine Labs mock checkout is off", 404, "mock_disabled"));
    },
  };
}

function packOrThrow(packs: CreditPack[], packId: string): CreditPack {
  const pack = packs.find((item) => item.id === packId) ?? findPack(packId);
  if (!pack) throw new PaymentError("unknown pack", 400, "unknown_pack");
  return pack;
}

function pendingFrom(row: StoredPayment): PendingPayment {
  return {
    id: row.id,
    userId: row.user_id,
    packId: row.pack_id,
    credits: row.credits,
    amountInr: row.amount_inr,
    utr: row.provider_ref ?? "",
  };
}

export async function widenPaymentStatus(db: Db): Promise<void> {
  // Postgres names the inline CHECK payments_status_check. pg-mem names it
  // payments_constraint_1, and leaving that copy rejects pending_verification.
  await db.query(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_status_check`);
  await db.query(`ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_constraint_1`);
  await db.query(`ALTER TABLE payments ADD CONSTRAINT payments_status_check CHECK (status IN (
    'pending', 'paid', 'failed', 'mocked', 'pending_verification', 'rejected'
  ))`);
}
