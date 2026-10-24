import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const here = dirname(fileURLToPath(import.meta.url));
const dbSql = readFileSync(join(here, "migrations/005_user_email_phone.sql"), "utf8");
const adminSql = readFileSync(join(here, "../admin/migrations/004_user_email_phone.sql"), "utf8");

test("email and phone columns are added and email is backfilled from an address", async () => {
  assert.equal(dbSql, adminSql);
  const db = new PGlite();
  try {
    await db.exec(`CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      display_name text NOT NULL,
      phone_or_email text,
      credit_balance integer NOT NULL DEFAULT 0
    )`);
    await db.exec(
      `INSERT INTO users (display_name, phone_or_email) VALUES
        ('Ada', 'ada@example.com'),
        ('Num', '99999')`,
    );
    await db.exec(dbSql);
    await db.exec(dbSql);
    const rows = await db.query<{ display_name: string; email: string | null; phone: string | null }>(
      "SELECT display_name, email, phone FROM users ORDER BY display_name",
    );
    assert.deepEqual(rows.rows, [
      { display_name: "Ada", email: "ada@example.com", phone: null },
      { display_name: "Num", email: null, phone: null },
    ]);
  } finally {
    await db.close();
  }
});
