import { InsufficientCreditsError, LedgerError, isUniqueViolation } from "./errors.js";
import type { Db } from "./db.js";
import { quote, type ArtefactKind, type CreditOperation, type CreditQuote } from "./money.js";

export type LedgerReason =
  | "signup_grant"
  | "pack_purchase"
  | "reserve"
  | "settle"
  | "refund"
  | "regenerate"
  | "cast_create";

export interface GrantInput {
  userId: string;
  amount: number;
  ref: string;
  reason: "signup_grant" | "pack_purchase";
  meta?: Record<string, unknown>;
}

export interface ReserveInput {
  userId: string;
  videoId: string;
  amount: number;
  ref: string;
}

export interface SettleInput {
  userId: string;
  videoId: string;
  actual: number;
  reserveRef: string;
  ref: string;
}

export interface RefundInput {
  userId: string;
  videoId?: string;
  amount: number;
  ref: string;
  reason: string;
}

interface LedgerRow {
  ref: string;
  delta: number;
  reason: LedgerReason;
  user_id: string;
  video_id: string | null;
  meta: Record<string, unknown>;
}

export interface Ledger {
  quote(input: { operation: CreditOperation; artefactKind?: ArtefactKind }): CreditQuote;
  reserve(input: ReserveInput): Promise<{ reserved: number }>;
  settle(input: SettleInput): Promise<{ charged: number; refunded: number }>;
  refund(input: RefundInput): Promise<void>;
  balance(userId: string): Promise<number>;
  grant(input: GrantInput): Promise<{ balance: number; applied: boolean }>;
}

function asInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") return Number(value);
  throw new LedgerError("expected an integer column", "bad_amount");
}

function asMeta(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  return {};
}

function rowFrom(record: Record<string, unknown>): LedgerRow {
  return {
    ref: String(record.ref),
    delta: asInt(record.delta),
    reason: String(record.reason) as LedgerReason,
    user_id: String(record.user_id),
    video_id: record.video_id == null ? null : String(record.video_id),
    meta: asMeta(record.meta),
  };
}

function assertPositive(amount: number, name: string): void {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new LedgerError(`${name} must be a positive integer`, "bad_amount");
  }
}

function assertNonNegative(amount: number, name: string): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new LedgerError(`${name} must be a non-negative integer`, "bad_amount");
  }
}

async function readRef(db: Db, ref: string): Promise<LedgerRow | null> {
  const found = await db.query("SELECT ref, delta, reason, user_id, video_id, meta FROM credit_ledger WHERE ref = $1", [
    ref,
  ]);
  const record = found.rows[0];
  return record ? rowFrom(record) : null;
}

async function requireUser(db: Db, userId: string): Promise<number> {
  const found = await db.query<{ credit_balance: unknown }>(
    "SELECT credit_balance FROM users WHERE id = $1",
    [userId],
  );
  const record = found.rows[0];
  if (!record) throw new LedgerError(`user not found: ${userId}`, "user_not_found");
  return asInt(record.credit_balance);
}

async function insertEntry(
  db: Db,
  input: {
    userId: string;
    ref: string;
    delta: number;
    reason: LedgerReason;
    videoId?: string;
    meta?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO credit_ledger (user_id, ref, delta, reason, video_id, meta)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      input.userId,
      input.ref,
      input.delta,
      input.reason,
      input.videoId ?? null,
      JSON.stringify(input.meta ?? {}),
    ],
  );
}

async function applyDelta(db: Db, userId: string, delta: number, needed: number): Promise<number> {
  const updated = await db.query<{ credit_balance: unknown }>(
    `UPDATE users
        SET credit_balance = credit_balance + $1
      WHERE id = $2
        AND credit_balance + $1 >= 0
      RETURNING credit_balance`,
    [delta, userId],
  );
  const record = updated.rows[0];
  if (!record) {
    const balance = await requireUser(db, userId);
    throw new InsufficientCreditsError(balance, needed);
  }
  return asInt(record.credit_balance);
}

async function addReserved(db: Db, videoId: string, amount: number): Promise<void> {
  await db.query(
    `UPDATE videos
        SET reserved_credits = reserved_credits + $1,
            updated_at = now()
      WHERE id = $2`,
    [amount, videoId],
  );
}

async function releaseReserved(db: Db, videoId: string, amount: number): Promise<void> {
  await db.query(
    `UPDATE videos
        SET reserved_credits = GREATEST(0, reserved_credits - $1),
            updated_at = now()
      WHERE id = $2`,
    [amount, videoId],
  );
}

function expectReason(row: LedgerRow, reason: LedgerReason): void {
  if (row.reason !== reason) {
    throw new LedgerError(`ref ${row.ref} is already a ${row.reason} entry`, "ref_conflict");
  }
}

export function createPostgresLedger(db: Db): Ledger {
  return {
    quote,

    async balance(userId) {
      return requireUser(db, userId);
    },

    async grant(input) {
      assertPositive(input.amount, "amount");
      try {
        return await db.transaction(async (tx) => {
          const existing = await readRef(tx, input.ref);
          if (existing) {
            expectReason(existing, input.reason);
            return { balance: await requireUser(tx, input.userId), applied: false };
          }
          await requireUser(tx, input.userId);
          await insertEntry(tx, {
            userId: input.userId,
            ref: input.ref,
            delta: input.amount,
            reason: input.reason,
            meta: input.meta,
          });
          const balance = await applyDelta(tx, input.userId, input.amount, input.amount);
          return { balance, applied: true };
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await readRef(db, input.ref);
        if (!existing) throw error;
        expectReason(existing, input.reason);
        return { balance: await requireUser(db, input.userId), applied: false };
      }
    },

    async reserve(input) {
      assertPositive(input.amount, "amount");
      const run = async (tx: Db): Promise<number> => {
        const existing = await readRef(tx, input.ref);
        if (existing) {
          expectReason(existing, "reserve");
          return -existing.delta;
        }
        await requireUser(tx, input.userId);
        await insertEntry(tx, {
          userId: input.userId,
          ref: input.ref,
          delta: -input.amount,
          reason: "reserve",
          videoId: input.videoId,
          meta: { amount: input.amount },
        });
        await applyDelta(tx, input.userId, -input.amount, input.amount);
        await addReserved(tx, input.videoId, input.amount);
        return input.amount;
      };
      try {
        const reserved = await db.transaction(run);
        return { reserved };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await readRef(db, input.ref);
        if (!existing) throw error;
        expectReason(existing, "reserve");
        return { reserved: -existing.delta };
      }
    },

    async settle(input) {
      assertNonNegative(input.actual, "actual");
      const run = async (tx: Db): Promise<{ charged: number; refunded: number }> => {
        const existing = await readRef(tx, input.ref);
        if (existing) {
          expectReason(existing, "settle");
          return {
            charged: asInt(existing.meta.charged),
            refunded: asInt(existing.meta.refunded),
          };
        }
        const prior = await tx.query<{ ref: string }>(
          `SELECT ref FROM credit_ledger
            WHERE reason = 'settle' AND meta->>'reserveRef' = $1
            LIMIT 1`,
          [input.reserveRef],
        );
        if (prior.rows[0]) {
          throw new LedgerError(
            `reserve ${input.reserveRef} was already settled as ${prior.rows[0].ref}`,
            "already_settled",
          );
        }
        const reserve = await readRef(tx, input.reserveRef);
        if (!reserve || reserve.reason !== "reserve") {
          throw new LedgerError(`reserve not found: ${input.reserveRef}`, "reserve_not_found");
        }
        if (reserve.user_id !== input.userId || reserve.video_id !== input.videoId) {
          throw new LedgerError("reserve does not match this user and video", "reserve_mismatch");
        }
        const reserved = -reserve.delta;
        const refunded = Math.max(0, reserved - input.actual);
        const delta = reserved - input.actual;
        await insertEntry(tx, {
          userId: input.userId,
          ref: input.ref,
          delta,
          reason: "settle",
          videoId: input.videoId,
          meta: {
            reserveRef: input.reserveRef,
            actual: input.actual,
            reserved,
            charged: input.actual,
            refunded,
          },
        });
        if (delta !== 0) {
          await applyDelta(tx, input.userId, delta, Math.max(0, -delta));
        }
        if (refunded > 0) await releaseReserved(tx, input.videoId, refunded);
        return { charged: input.actual, refunded };
      };
      try {
        return await db.transaction(run);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await readRef(db, input.ref);
        if (!existing) throw error;
        expectReason(existing, "settle");
        return {
          charged: asInt(existing.meta.charged),
          refunded: asInt(existing.meta.refunded),
        };
      }
    },

    async refund(input) {
      assertPositive(input.amount, "amount");
      const run = async (tx: Db): Promise<void> => {
        const existing = await readRef(tx, input.ref);
        if (existing) {
          expectReason(existing, "refund");
          return;
        }
        await requireUser(tx, input.userId);
        await insertEntry(tx, {
          userId: input.userId,
          ref: input.ref,
          delta: input.amount,
          reason: "refund",
          videoId: input.videoId,
          meta: { detail: input.reason, amount: input.amount },
        });
        await applyDelta(tx, input.userId, input.amount, input.amount);
        if (input.videoId) await releaseReserved(tx, input.videoId, input.amount);
      };
      try {
        await db.transaction(run);
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await readRef(db, input.ref);
        if (!existing) throw error;
        expectReason(existing, "refund");
      }
    },
  };
}
