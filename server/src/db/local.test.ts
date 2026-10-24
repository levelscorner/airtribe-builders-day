import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLocalDatabase } from "./local.js";
import { migrate } from "./client.js";

test("local live project data survives closing and reopening the database", async () => {
  const folder = await mkdtemp(join(tmpdir(), "slb2-db-"));
  let db = await createLocalDatabase(join(folder, "nested", "db"));
  try {
    await migrate(db);
    const created = await db.query<{id:string}>("INSERT INTO users (display_name) VALUES ($1) RETURNING id", ["Persisted creator"]);
    const id = created.rows[0]!.id;
    await db.close();
    db = await createLocalDatabase(join(folder, "nested", "db"));
    const found = await db.query<{display_name:string}>("SELECT display_name FROM users WHERE id=$1", [id]);
    assert.equal(found.rows[0]?.display_name, "Persisted creator");
  } finally { await db.close(); await rm(folder, { recursive: true, force: true }); }
});
