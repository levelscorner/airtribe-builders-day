import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { createLocalDatabase } from "./local.js";
import { newDb, type IMemoryDb } from "pg-mem";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type SqlClient = {
  query: <T extends pg.QueryResultRow = pg.QueryResultRow>(
    text: string,
    params?: unknown[],
  ) => Promise<pg.QueryResult<T>>;
  /** True when backed by pg-mem (MOCK=1 / no DATABASE_URL). */
  memory: boolean;
  close: () => Promise<void>;
  /**
   * Run fn on a single pooled connection with BEGIN/COMMIT.
   * Required so transactional work does not hop connections.
   */
  withTransaction: <T>(fn: (tx: SqlClient) => Promise<T>) => Promise<T>;
};

let singleton: SqlClient | null = null;

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function useMemory(): boolean {
  if (truthy(process.env.MOCK) || truthy(process.env.MOCK_MODE)) return true;
  return false;
}

function patchGenRandomUuid(db: IMemoryDb): void {
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid" as never,
    // pg-mem caches pure defaults; uuid must be impure or every DEFAULT collapses to one value.
    impure: true,
    implementation: () => randomUUID(),
  });
}

function clientFromPool(pool: pg.Pool, memory: boolean): SqlClient {
  const base: SqlClient = {
    memory,
    query: (text, params) => pool.query(text, params as never),
    close: async () => {
      await pool.end();
    },
    async withTransaction(fn) {
      const conn = await pool.connect();
      const tx: SqlClient = {
        memory,
        query: (text, params) => conn.query(text, params as never),
        close: async () => {
          /* connection owned by withTransaction */
        },
        withTransaction: (inner) => inner(tx),
      };
      try {
        // pg-mem CHECK + BEGIN is fragile; still pin one connection for ordering.
        if (!memory) await conn.query("BEGIN");
        const result = await fn(tx);
        if (!memory) await conn.query("COMMIT");
        return result;
      } catch (error) {
        if (!memory) {
          try {
            await conn.query("ROLLBACK");
          } catch {
            /* ignore */
          }
        }
        throw error;
      } finally {
        conn.release();
      }
    },
  };
  return base;
}

async function openMemory(): Promise<SqlClient> {
  const db = newDb({
    autoCreateForeignKeyIndices: true,
    // Full docs/14 DDL uses CHECK / IF NOT EXISTS forms pg-mem only partially covers.
    noAstCoverageCheck: true,
  });
  patchGenRandomUuid(db);
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as pg.Pool;
  return clientFromPool(pool, true);
}

async function openPostgres(url: string): Promise<SqlClient> {
  const pool = new pg.Pool({ connectionString: url });
  return clientFromPool(pool, false);
}

/** Shared DB handle. MOCK=1 (or missing DATABASE_URL) → pg-mem. */
export async function getDb(): Promise<SqlClient> {
  if (singleton) return singleton;
  singleton = useMemory() ? await openMemory() : process.env.DATABASE_URL?.trim()
    ? await openPostgres(process.env.DATABASE_URL.trim())
    : await createLocalDatabase(process.env.LOCAL_DATABASE_DIR || join(__dirname, "../../data/slb2-db"));
  return singleton;
}

/** Test helper: drop the singleton so the next getDb() is fresh. */
export async function resetDbForTests(): Promise<void> {
  if (singleton) await singleton.close();
  singleton = null;
}

function migrationFiles(): string[] {
  const dir = join(__dirname, "migrations");
  return readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => join(dir, name));
}

export async function migrate(client?: SqlClient): Promise<{ applied: string[]; memory: boolean }> {
  const db = client ?? (await getDb());
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const applied: string[] = [];
  for (const file of migrationFiles()) {
    const id = file.split(/[/\\]/).pop()!;
    const existing = await db.query<{ id: string }>("SELECT id FROM schema_migrations WHERE id = $1", [id]);
    if (existing.rowCount && existing.rowCount > 0) continue;
    const sql = readFileSync(file, "utf8");
    try {
      await db.query(sql);
    } catch (error) {
      // pg-mem may already have failed in 001 CHECK; skip widen-only migration.
      if (id === "002_artefact_failed.sql" && db.memory) {
        await db.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
        applied.push(id);
        continue;
      }
      throw error;
    }
    await db.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
    applied.push(id);
  }
  const seed = readFileSync(join(__dirname, "seed/voices_cast.sql"), "utf8");
  await db.query(seed);
  return { applied, memory: db.memory };
}
