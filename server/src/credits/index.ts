import { createPgDb, createPgPool, migrate, type Db } from "./db.js";
import { LedgerError } from "./errors.js";
import { createPostgresLedger, type Ledger } from "./ledger.js";
import { createMockLedger } from "./mock.js";

export { InsufficientCreditsError, LedgerError } from "./errors.js";
export { migrate, createPgDb, createPgPool, type Db } from "./db.js";
export { quote, creditsForProviderCents, PROVIDER_CENTS, MAX_BILLABLE_SCENES } from "./money.js";
export { createPostgresLedger, type Ledger, type GrantInput } from "./ledger.js";
export { createMockLedger, type MockLedger } from "./mock.js";

function isDb(value: unknown): value is Db {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Db;
  return typeof candidate.query === "function" && typeof candidate.transaction === "function";
}

/** `MOCK=1` returns the in-memory ledger. Otherwise `db` is required. */
export function createCredits(env: { mock: boolean; db?: Db; [key: string]: unknown }): Ledger {
  if (env.mock) return createMockLedger();
  if (!isDb(env.db)) {
    throw new LedgerError("Postgres ledger requires db", "db_required");
  }
  return createPostgresLedger(env.db);
}

export async function createCreditsFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<Ledger> {
  if (env.MOCK === "1") return createMockLedger();
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new LedgerError("Postgres ledger requires db", "db_required");
  const pool = createPgPool(url);
  const db = createPgDb(pool);
  await migrate(db);
  return createPostgresLedger(db);
}
