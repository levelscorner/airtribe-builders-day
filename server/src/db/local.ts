import { mkdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import type pg from "pg";
import type { SqlClient } from "./client.js";

type Executor = Pick<PGlite, "query" | "exec">;
/** Local live projects use a disk-backed Postgres engine when no remote DB is configured. */
export async function createLocalDatabase(path: string): Promise<SqlClient> {
  await mkdir(path, { recursive: true });
  const engine = new PGlite(path);
  await engine.waitReady;
  const adapter = (executor: Executor): SqlClient => ({
    memory: false,
    async query<T extends pg.QueryResultRow>(
      sql: string,
      params?: unknown[],
    ): Promise<pg.QueryResult<T>> {
      const result = params?.length
        ? await executor.query<T>(sql, params)
        : (await executor.exec(sql)).at(-1);
      return {
        rows: (result?.rows ?? []) as T[],
        rowCount: result?.affectedRows || result?.rows?.length || 0,
        command: "",
        oid: 0,
        fields: [],
      };
    },
    close: () => engine.close(),
    withTransaction: (fn) => engine.transaction((tx) => fn(adapter(tx))),
  });
  return adapter(engine);
}
