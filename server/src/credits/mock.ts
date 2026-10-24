import { InsufficientCreditsError, LedgerError } from "./errors.js";
import type { GrantInput, Ledger, LedgerReason, RefundInput, ReserveInput, SettleInput } from "./ledger.js";
import { quote } from "./money.js";

interface MockRow {
  ref: string;
  delta: number;
  reason: LedgerReason;
  userId: string;
  videoId?: string;
  meta: Record<string, unknown>;
}

export interface MockLedger extends Ledger {
  seedUser(userId: string, balance: number): void;
}

export function createMockLedger(): MockLedger {
  const balances = new Map<string, number>();
  const rows = new Map<string, MockRow>();

  function requireUser(userId: string): number {
    const balance = balances.get(userId);
    if (balance === undefined) throw new LedgerError(`user not found: ${userId}`, "user_not_found");
    return balance;
  }

  function takeRef(row: MockRow): void {
    const existing = rows.get(row.ref);
    if (existing) {
      if (existing.reason !== row.reason) {
        throw new LedgerError(`ref ${row.ref} is already a ${existing.reason} entry`, "ref_conflict");
      }
      return;
    }
    const balance = requireUser(row.userId);
    const next = balance + row.delta;
    if (next < 0) throw new InsufficientCreditsError(balance, -row.delta);
    balances.set(row.userId, next);
    rows.set(row.ref, row);
  }

  return {
    quote,
    seedUser(userId, balance) {
      balances.set(userId, balance);
    },
    async balance(userId) {
      return requireUser(userId);
    },
    async grant(input: GrantInput) {
      if (!Number.isInteger(input.amount) || input.amount <= 0) {
        throw new LedgerError("amount must be a positive integer", "bad_amount");
      }
      if (!balances.has(input.userId)) balances.set(input.userId, 0);
      const existing = rows.get(input.ref);
      if (existing) {
        if (existing.reason !== input.reason) {
          throw new LedgerError(`ref ${input.ref} is already a ${existing.reason} entry`, "ref_conflict");
        }
        return { balance: requireUser(input.userId), applied: false };
      }
      takeRef({
        ref: input.ref,
        delta: input.amount,
        reason: input.reason,
        userId: input.userId,
        meta: input.meta ?? {},
      });
      return { balance: requireUser(input.userId), applied: true };
    },
    async reserve(input: ReserveInput) {
      if (!Number.isInteger(input.amount) || input.amount <= 0) {
        throw new LedgerError("amount must be a positive integer", "bad_amount");
      }
      const existing = rows.get(input.ref);
      if (existing) {
        if (existing.reason !== "reserve") {
          throw new LedgerError(`ref ${input.ref} is already a ${existing.reason} entry`, "ref_conflict");
        }
        return { reserved: -existing.delta };
      }
      takeRef({
        ref: input.ref,
        delta: -input.amount,
        reason: "reserve",
        userId: input.userId,
        videoId: input.videoId,
        meta: { amount: input.amount },
      });
      return { reserved: input.amount };
    },
    async settle(input: SettleInput) {
      if (!Number.isInteger(input.actual) || input.actual < 0) {
        throw new LedgerError("actual must be a non-negative integer", "bad_amount");
      }
      const existing = rows.get(input.ref);
      if (existing) {
        if (existing.reason !== "settle") {
          throw new LedgerError(`ref ${input.ref} is already a ${existing.reason} entry`, "ref_conflict");
        }
        return {
          charged: Number(existing.meta.charged),
          refunded: Number(existing.meta.refunded),
        };
      }
      for (const row of rows.values()) {
        if (row.reason === "settle" && row.meta.reserveRef === input.reserveRef) {
          throw new LedgerError(
            `reserve ${input.reserveRef} was already settled as ${row.ref}`,
            "already_settled",
          );
        }
      }
      const reserve = rows.get(input.reserveRef);
      if (!reserve || reserve.reason !== "reserve") {
        throw new LedgerError(`reserve not found: ${input.reserveRef}`, "reserve_not_found");
      }
      if (reserve.userId !== input.userId || reserve.videoId !== input.videoId) {
        throw new LedgerError("reserve does not match this user and video", "reserve_mismatch");
      }
      const reserved = -reserve.delta;
      const refunded = Math.max(0, reserved - input.actual);
      const delta = reserved - input.actual;
      takeRef({
        ref: input.ref,
        delta,
        reason: "settle",
        userId: input.userId,
        videoId: input.videoId,
        meta: {
          reserveRef: input.reserveRef,
          actual: input.actual,
          reserved,
          charged: input.actual,
          refunded,
        },
      });
      return { charged: input.actual, refunded };
    },
    async refund(input: RefundInput) {
      if (!Number.isInteger(input.amount) || input.amount <= 0) {
        throw new LedgerError("amount must be a positive integer", "bad_amount");
      }
      const existing = rows.get(input.ref);
      if (existing) {
        if (existing.reason !== "refund") {
          throw new LedgerError(`ref ${input.ref} is already a ${existing.reason} entry`, "ref_conflict");
        }
        return;
      }
      takeRef({
        ref: input.ref,
        delta: input.amount,
        reason: "refund",
        userId: input.userId,
        videoId: input.videoId,
        meta: { detail: input.reason, amount: input.amount },
      });
    },
  };
}
