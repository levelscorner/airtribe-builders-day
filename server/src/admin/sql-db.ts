import { createQueryDb, type Db } from "../credits/db.js";
import type { SqlClient } from "../db/client.js";

/** Saturn's pooled client and the Mars ledger share one Postgres. */
export function dbFromSql(sql: SqlClient): Db {
  return createQueryDb({
    query: async <T = Record<string, unknown>>(text: string, params?: unknown[]) => {
      const result = await sql.query(text, params);
      return { rows: result.rows as T[] };
    },
    transaction: (fn) => sql.withTransaction((tx) => fn(dbFromSql(tx))),
  });
}
