/**
 * Minimal Credits port. Mars replaces this with the real ledger (docs/14).
 * Keeps users.credit_balance + credit_ledger rows in sync under a unique ref.
 */
import type { ArtefactKind, Credits, CreditQuote } from "@chotu/shared";
import type { SqlClient } from "../db/client.js";

const COST: Record<string, number> = {
  video_max: 60,
  regenerate: 4,
  cast_create: 12,
  image: 8,
  clip: 40,
  audio: 5,
  final: 5,
  identity: 2,
  sheet: 6,
  anchor: 4,
  voice_sample: 2,
  script: 3,
  prompt: 1,
};

export function artefactCreditCost(kind: ArtefactKind): number {
  return COST[kind] ?? COST.regenerate ?? 4;
}

async function runTxn<T>(db: SqlClient, fn: (tx: SqlClient) => Promise<T>): Promise<T> {
  return db.withTransaction(fn);
}

export function createCreditsStub(db: SqlClient): Credits {
  return {
    quote(input): CreditQuote {
      const key = input.artefactKind ?? input.operation;
      return {
        operation: input.operation,
        creditCost: COST[key] ?? COST.regenerate ?? 4,
      };
    },

    async reserve(input) {
      return runTxn(db, async (tx) => {
        const user = await tx.query<{ credit_balance: number }>(
          db.memory
            ? "SELECT credit_balance FROM users WHERE id = $1"
            : "SELECT credit_balance FROM users WHERE id = $1 FOR UPDATE",
          [input.userId],
        );
        const balance = Number(user.rows[0]?.credit_balance ?? 0);
        const claimed = await tx.query(
          `INSERT INTO credit_ledger (user_id, ref, delta, reason, video_id, meta)
           VALUES ($1, $2, $3, 'reserve', $4, $5)
           ON CONFLICT (ref) DO NOTHING
           RETURNING id`,
          [input.userId, input.ref, -input.amount, input.videoId ?? null, JSON.stringify({})],
        );
        if (!claimed.rowCount) {
          return { reserved: input.amount };
        }
        if (balance < input.amount) {
          if (db.memory) {
            await tx.query("DELETE FROM credit_ledger WHERE ref = $1", [input.ref]);
          }
          throw new Error(`Insufficient credits: have ${balance}, need ${input.amount}`);
        }
        await tx.query("UPDATE users SET credit_balance = $1 WHERE id = $2", [
          balance - input.amount,
          input.userId,
        ]);
        if (input.videoId) {
          await tx.query(
            "UPDATE videos SET reserved_credits = reserved_credits + $1, updated_at = now() WHERE id = $2",
            [input.amount, input.videoId],
          );
        }
        return { reserved: input.amount };
      });
    },

    async settle(input) {
      const refunded = Math.max(0, input.actual >= 0 ? 0 : 0);
      await db.query(
        `INSERT INTO credit_ledger (user_id, ref, delta, reason, video_id, meta)
         VALUES ($1, $2, $3, 'settle', $4, $5)
         ON CONFLICT (ref) DO NOTHING`,
        [
          input.userId,
          input.ref,
          -input.actual,
          input.videoId,
          JSON.stringify({ reserveRef: input.reserveRef }),
        ],
      );
      return { charged: input.actual, refunded };
    },

    async refund(input) {
      return runTxn(db, async (tx) => {
        const claimed = await tx.query(
          `INSERT INTO credit_ledger (user_id, ref, delta, reason, video_id, meta)
           VALUES ($1, $2, $3, 'refund', $4, $5)
           ON CONFLICT (ref) DO NOTHING
           RETURNING id`,
          [
            input.userId,
            input.ref,
            input.amount,
            input.videoId ?? null,
            JSON.stringify({ reason: input.reason }),
          ],
        );
        if (!claimed.rowCount) return;
        const user = await tx.query<{ credit_balance: number }>(
          "SELECT credit_balance FROM users WHERE id = $1",
          [input.userId],
        );
        const balance = Number(user.rows[0]?.credit_balance ?? 0);
        await tx.query("UPDATE users SET credit_balance = $1 WHERE id = $2", [
          balance + input.amount,
          input.userId,
        ]);
      });
    },

    async balance(userId) {
      const result = await db.query<{ credit_balance: number }>(
        "SELECT credit_balance FROM users WHERE id = $1",
        [userId],
      );
      return result.rows[0]?.credit_balance ?? 0;
    },
  };
}

/**
 * Debit for regenerate (idempotent by ref).
 * Claims the unique ledger ref BEFORE mutating the balance so retries are safe.
 */
export async function debitRegenerate(
  db: SqlClient,
  input: { userId: string; videoId: string; amount: number; ref: string },
): Promise<number> {
  return runTxn(db, async (tx) => {
    const user = await tx.query<{ credit_balance: number }>(
      db.memory
        ? "SELECT credit_balance FROM users WHERE id = $1"
        : "SELECT credit_balance FROM users WHERE id = $1 FOR UPDATE",
      [input.userId],
    );
    const balance = Number(user.rows[0]?.credit_balance ?? 0);

    // Idempotency: existing ref means we already charged — never debit again.
    const existing = await tx.query("SELECT 1 FROM credit_ledger WHERE ref = $1", [input.ref]);
    if (existing.rowCount && existing.rowCount > 0) {
      return balance;
    }

    // Claim ref before debit (unique). Conflict ⇒ race loser, no debit.
    const claimed = await tx.query<{ id: string }>(
      `INSERT INTO credit_ledger (user_id, ref, delta, reason, video_id, meta)
       VALUES ($1, $2, $3, 'regenerate', $4, '{}'::jsonb)
       ON CONFLICT (ref) DO NOTHING
       RETURNING id`,
      [input.userId, input.ref, -input.amount, input.videoId],
    );
    if (!claimed.rowCount) {
      return balance;
    }

    if (balance < input.amount) {
      // Real Postgres rolls back the claim with the txn; memory must undo.
      if (db.memory) {
        await tx.query("DELETE FROM credit_ledger WHERE ref = $1", [input.ref]);
      }
      throw new Error(`Insufficient credits: have ${balance}, need ${input.amount}`);
    }
    const next = balance - input.amount;
    await tx.query("UPDATE users SET credit_balance = $1 WHERE id = $2", [next, input.userId]);
    return next;
  });
}

export async function grantSignupCredits(
  db: SqlClient,
  input: { userId: string; amount: number; ref: string },
): Promise<void> {
  await db.query("UPDATE users SET credit_balance = credit_balance + $1 WHERE id = $2", [
    input.amount,
    input.userId,
  ]);
  await db.query(
    `INSERT INTO credit_ledger (user_id, ref, delta, reason, meta)
     VALUES ($1, $2, $3, 'signup_grant', '{}'::jsonb)
     ON CONFLICT (ref) DO NOTHING`,
    [input.userId, input.ref, input.amount],
  );
}
