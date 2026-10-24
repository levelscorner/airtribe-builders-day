import { PGlite } from "@electric-sql/pglite";
import { createQueryDb, migrate, type Db } from "./db.js";

export async function withPg(): Promise<{ db: Db; close: () => Promise<void> }> {
  const pg = new PGlite();
  const db = createQueryDb({
    query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
      const result = await pg.query(sql, params as never[]);
      return { rows: result.rows as T[] };
    },
    transaction: async (fn) =>
      pg.transaction(async (tx) => {
        const txDb = createQueryDb({
          query: async <T = Record<string, unknown>>(sql: string, params?: unknown[]) => {
            const result = await tx.query(sql, params as never[]);
            return { rows: result.rows as T[] };
          },
        });
        return fn(txDb);
      }),
  });
  await migrate(db);
  return {
    db,
    close: async () => {
      await pg.close();
    },
  };
}

export async function seedUser(db: Db, balance: number): Promise<string> {
  const id = crypto.randomUUID();
  await db.query("INSERT INTO users (id, display_name, credit_balance) VALUES ($1, $2, $3)", [
    id,
    "tester",
    balance,
  ]);
  return id;
}

export async function seedVideo(db: Db, userId: string): Promise<string> {
  const chatId = crypto.randomUUID();
  const videoId = crypto.randomUUID();
  await db.query("INSERT INTO chats (id, user_id, title) VALUES ($1, $2, 'test')", [chatId, userId]);
  await db.query(
    "INSERT INTO videos (id, user_id, chat_id, genre, language) VALUES ($1, $2, $3, 'kids', 'hi')",
    [videoId, userId, chatId],
  );
  return videoId;
}
