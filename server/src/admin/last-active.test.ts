import assert from "node:assert/strict";
import test from "node:test";
import { formatIst } from "@chotu/shared";
import { withPg } from "../credits/testing.js";
import { touchLastActive } from "../orchestrator/store.js";

test("formatIst is Asia/Kolkata and never a raw UTC stamp", () => {
  assert.equal(formatIst("2026-10-24T13:02:00.000Z"), "24 Oct, 6:32 PM IST");
  assert.equal(formatIst(null), "—");
  assert.equal(formatIst("not-a-date"), "—");
});

test("touchLastActive writes at most once a minute", async () => {
  const pg = await withPg();
  try {
    const id = crypto.randomUUID();
    await pg.db.query(
      `INSERT INTO users (id, display_name, phone_or_email, credit_balance, created_at)
       VALUES ($1, 'Ada', $2, 0, $3)`,
      [id, `ada-active-${id}@example.com`, "2026-01-02T03:04:05.000Z"],
    );
    const start = Date.parse("2026-10-24T13:00:00.000Z");
    await touchLastActive(pg.db, id, start);
    await touchLastActive(pg.db, id, start + 30_000);
    const held = await pg.db.query<{ last_active_at: Date | string }>(
      "SELECT last_active_at FROM users WHERE id = $1",
      [id],
    );
    assert.equal(new Date(held.rows[0]!.last_active_at).toISOString(), "2026-10-24T13:00:00.000Z");

    await touchLastActive(pg.db, id, start + 61_000);
    const moved = await pg.db.query<{ last_active_at: Date | string }>(
      "SELECT last_active_at FROM users WHERE id = $1",
      [id],
    );
    assert.equal(new Date(moved.rows[0]!.last_active_at).toISOString(), "2026-10-24T13:01:01.000Z");
  } finally {
    await pg.close();
  }
});
