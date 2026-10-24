import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

export interface QueryResult<T> {
  rows: T[];
}

export interface Db {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
  transaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
}

export function createQueryDb(impl: {
  query: Db["query"];
  transaction?: Db["transaction"];
}): Db {
  const db: Db = {
    query: impl.query,
    transaction: (fn) => (impl.transaction ? impl.transaction(fn) : fn(db)),
  };
  return db;
}

export function createPgPool(connectionString: string): pg.Pool {
  return new Pool({ connectionString });
}

export function createPgDb(pool: pg.Pool): Db {
  return createQueryDb({
    query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
      const result = await pool.query(sql, params as never[]);
      return { rows: result.rows as T[] };
    },
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const tx = createQueryDb({
          query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
            const result = await client.query(sql, params as never[]);
            return { rows: result.rows as T[] };
          },
        });
        const value = await fn(tx);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // The original error is the one to surface.
        }
        throw error;
      } finally {
        client.release();
      }
    },
  });
}

const here = dirname(fileURLToPath(import.meta.url));

/** Mars SQL, plus later Mars folders when those PRs are present. */
const MIGRATION_DIRS = [
  join(here, "migrations"),
  join(here, "../payments/migrations"),
  join(here, "../admin/migrations"),
];

export function splitSql(sql: string): string[] {
  const stripped = sql
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return stripped
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

async function migrationFiles(): Promise<Array<{ id: string; sql: string }>> {
  const found: Array<{ id: string; path: string }> = [];
  for (const dir of MIGRATION_DIRS) {
    let names: string[];
    try {
      names = await readdir(dir);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") continue;
      throw error;
    }
    for (const name of names) {
      if (name.endsWith(".sql")) found.push({ id: name, path: join(dir, name) });
    }
  }
  found.sort((a, b) => a.id.localeCompare(b.id));
  const loaded: Array<{ id: string; sql: string }> = [];
  for (const file of found) {
    loaded.push({ id: file.id, sql: await readFile(file.path, "utf8") });
  }
  return loaded;
}

export async function migrate(db: Db): Promise<string[]> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const applied = await db.query<{ id: string }>("SELECT id FROM schema_migrations");
  const done = new Set(applied.rows.map((row) => row.id));
  const fresh: string[] = [];
  for (const file of await migrationFiles()) {
    if (done.has(file.id)) continue;
    await db.transaction(async (tx) => {
      for (const statement of splitSql(file.sql)) {
        await tx.query(statement);
      }
      await tx.query("INSERT INTO schema_migrations (id) VALUES ($1)", [file.id]);
    });
    fresh.push(file.id);
  }
  return fresh;
}
