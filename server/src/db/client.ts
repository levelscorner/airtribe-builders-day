import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import pg from "pg";
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
};

let singleton: SqlClient | null = null;
let memDb: IMemoryDb | null = null;

function truthy(v: string | undefined): boolean {
  if (!v) return false;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function useMemory(): boolean {
  if (truthy(process.env.MOCK) || truthy(process.env.MOCK_MODE)) return true;
  return !process.env.DATABASE_URL?.trim();
}

function patchGenRandomUuid(db: IMemoryDb): void {
  db.public.registerFunction({
    name: "gen_random_uuid",
    returns: "uuid" as never,
    implementation: () => randomUUID(),
  });
}

async function openMemory(): Promise<SqlClient> {
  const db = newDb({
    autoCreateForeignKeyIndices: true,
    // Full docs/14 DDL uses CHECK / IF NOT EXISTS forms pg-mem only partially covers.
    noAstCoverageCheck: true,
  });
  patchGenRandomUuid(db);
  memDb = db;
  const { Pool } = db.adapters.createPg();
  const pool = new Pool() as unknown as pg.Pool;
  return {
    memory: true,
    query: (text, params) => pool.query(text, params as never),
    close: async () => {
      await pool.end();
    },
  };
}

async function openPostgres(url: string): Promise<SqlClient> {
  const pool = new pg.Pool({ connectionString: url });
  return {
    memory: false,
    query: (text, params) => pool.query(text, params),
    close: async () => {
      await pool.end();
    },
  };
}

/** Shared DB handle. MOCK=1 (or missing DATABASE_URL) → pg-mem. */
export async function getDb(): Promise<SqlClient> {
  if (singleton) return singleton;
  singleton = useMemory() ? await openMemory() : await openPostgres(process.env.DATABASE_URL!.trim());
  return singleton;
}

/** Test helper: drop the singleton so the next getDb() is fresh. */
export async function resetDbForTests(): Promise<void> {
  if (singleton) await singleton.close();
  singleton = null;
  memDb = null;
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
    await db.query(sql);
    await db.query("INSERT INTO schema_migrations (id) VALUES ($1)", [id]);
    applied.push(id);
  }
  const seed = readFileSync(join(__dirname, "seed/voices_cast.sql"), "utf8");
  await db.query(seed);
  return { applied, memory: db.memory };
}
