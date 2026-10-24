import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { getDb, migrate, resetDbForTests } from "./client.js";

before(async () => {
  process.env.MOCK = "1";
  delete process.env.DATABASE_URL;
  await resetDbForTests();
});

after(async () => {
  await resetDbForTests();
});

test("MOCK=1 migrate applies schema and seeds cast presets", async () => {
  const first = await migrate();
  assert.equal(first.memory, true);
  assert.ok(first.applied.includes("001_init.sql"));

  const db = await getDb();
  const voices = await db.query("SELECT id FROM voices ORDER BY id");
  assert.equal(voices.rowCount, 4);

  const cast = await db.query<{ id: string }>(
    "SELECT id FROM cast_members WHERE is_preset = true ORDER BY id",
  );
  assert.deepEqual(
    cast.rows.map((row) => row.id),
    ["preset_chintu", "preset_mini", "preset_narrator", "preset_riya"],
  );

  const second = await migrate();
  assert.deepEqual(second.applied, []);
});

test("users insert works with gen_random_uuid", async () => {
  const db = await getDb();
  const result = await db.query<{ id: string; credit_balance: number }>(
    `INSERT INTO users (display_name, phone_or_email, credit_balance)
     VALUES ($1, $2, $3) RETURNING id, credit_balance`,
    ["Asha", "asha@example.com", 80],
  );
  assert.ok(result.rows[0]?.id);
  assert.equal(result.rows[0]?.credit_balance, 80);
});
