import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "migrations/004_user_columns.sql"), "utf8");

test("signup columns are added when missing and left in place when present", async () => {
  const sparse = new PGlite();
  try {
    await sparse.exec(`CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      credit_balance integer NOT NULL DEFAULT 0
    )`);
    await sparse.exec(sql);
    await sparse.exec(sql);
    const cols = await sparse.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'",
    );
    const names = new Set(cols.rows.map((row) => row.column_name));
    assert.equal(names.has("display_name"), true);
    assert.equal(names.has("phone_or_email"), true);
    assert.equal(names.has("created_at"), true);
    const inserted = await sparse.query<{ display_name: string; phone_or_email: string; created_at: string }>(
      `INSERT INTO users (display_name, phone_or_email)
       VALUES ('Asha', 'asha@example.com')
       RETURNING display_name, phone_or_email, created_at`,
    );
    assert.equal(inserted.rows[0]?.display_name, "Asha");
    assert.equal(inserted.rows[0]?.phone_or_email, "asha@example.com");
    assert.ok(inserted.rows[0]?.created_at);
  } finally {
    await sparse.close();
  }

  const present = new PGlite();
  try {
    await present.exec(`CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      display_name text NOT NULL,
      phone_or_email text UNIQUE,
      credit_balance integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await present.query("INSERT INTO users (display_name, phone_or_email) VALUES ('Kept', 'kept@example.com')");
    await present.exec(sql);
    const found = await present.query<{ display_name: string; phone_or_email: string }>(
      "SELECT display_name, phone_or_email FROM users",
    );
    assert.equal(found.rows[0]?.display_name, "Kept");
    assert.equal(found.rows[0]?.phone_or_email, "kept@example.com");
  } finally {
    await present.close();
  }
});
