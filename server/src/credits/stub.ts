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
      const useTxn = !db.memory;
      if (useTxn) await db.query("BEGIN");
      try {
        const user = await db.query<{ credit_balance: number }>(
          useTxn
            ? "SELECT credit_balance FROM users WHERE id = $1 FOR UPDATE"
            : "SELECT credit_balance FROM users WHERE id = $1",
          [input.userId],
        );
        const balance = Number(user.rows[0]?.credit_balance ?? 0);
        if (balance < input.amount) {
          throw new Error(`Insufficient credits: have ${balance}, need ${input.amount}`);
        }
        await db.query("UPDATE users SET credit_balance = $1 WHERE id = $2", [
          balance - input.amount,
          input.userId,
        ]);
        if (input.videoId) {
          await db.query(
            "UPDATE videos SET reserved_credits = reserved_credits + $1, updated_at = now() WHERE id = $2",
            [input.amount, input.videoId],
          );
        }
        await db.query(
          `INSERT INTO credit_ledger (user_id, ref, delta, reason, video_id, meta)
           VALUES ($1, $2, $3, 'reserve', $4, $5)
           ON CONFLICT (ref) DO NOTHING`,
          [input.userId, input.ref, -input.amount, input.videoId ?? null, JSON.stringify({})],
        );
        if (useTxn) await db.query("COMMIT");
        return { reserved: input.amount };
      } catch (error) {
        if (useTxn) {
          try {
            await db.query("ROLLBACK");
          } catch {
            /* ignore */
          }
        }
        throw error;
      }
    },

    async settle(input) {
      const refunded = Math.max(0, input.actual >= 0 ? 0 : 0);
      // Reserve already debited; settle records the actual spend ref.
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
      const useTxn = !db.memory;
      if (useTxn) await db.query("BEGIN");
      try {
        const user = await db.query<{ credit_balance: number }>(
          "SELECT credit_balance FROM users WHERE id = $1",
          [input.userId],
        );
        const balance = Number(user.rows[0]?.credit_balance ?? 0);
        await db.query("UPDATE users SET credit_balance = $1 WHERE id = $2", [
          balance + input.amount,
          input.userId,
        ]);
        await db.query(
          `INSERT INTO credit_ledger (user_id, ref, delta, reason, video_id, meta)
           VALUES ($1, $2, $3, 'refund', $4, $5)
           ON CONFLICT (ref) DO NOTHING`,
          [
            input.userId,
            input.ref,
            input.amount,
            input.videoId ?? null,
            JSON.stringify({ reason: input.reason }),
          ],
        );
        if (useTxn) await db.query("COMMIT");
      } catch (error) {
        if (useTxn) {
          try {
            await db.query("ROLLBACK");
          } catch {
            /* ignore */
          }
        }
        throw error;
      }
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

/** Debit for regenerate (idempotent by ref). */
export async function debitRegenerate(
  db: SqlClient,
  input: { userId: string; videoId: string; amount: number; ref: string },
): Promise<number> {
  // pg-mem mishandles BEGIN/FOR UPDATE + CHECK on balance; skip txn in memory mode.
  const useTxn = !db.memory;
  if (useTxn) await db.query("BEGIN");
  try {
    const user = await db.query<{ credit_balance: number }>(
      useTxn
        ? "SELECT credit_balance FROM users WHERE id = $1 FOR UPDATE"
        : "SELECT credit_balance FROM users WHERE id = $1",
      [input.userId],
    );
    const balance = Number(user.rows[0]?.credit_balance ?? 0);
    if (balance < input.amount) {
      throw new Error(`Insufficient credits: have ${balance}, need ${input.amount}`);
    }
    await db.query("UPDATE users SET credit_balance = $1 WHERE id = $2", [
      balance - input.amount,
      input.userId,
    ]);
    await db.query(
      `INSERT INTO credit_ledger (user_id, ref, delta, reason, video_id, meta)
       VALUES ($1, $2, $3, 'regenerate', $4, '{}'::jsonb)
       ON CONFLICT (ref) DO NOTHING`,
      [input.userId, input.ref, -input.amount, input.videoId],
    );
    if (useTxn) await db.query("COMMIT");
    return balance - input.amount;
  } catch (error) {
    if (useTxn) {
      try {
        await db.query("ROLLBACK");
      } catch {
        /* ignore */
      }
    }
    throw error;
  }
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
