import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { seedVideo, withPg } from "../credits/testing.js";
import { createApp } from "../deploy/app.js";

const TOKEN = "test-admin-token";

test("an admin user page shows that person's details and video status", async () => {
  const previous = { token: process.env.ADMIN_TOKEN, open: process.env.ADMIN_OPEN };
  process.env.ADMIN_TOKEN = TOKEN;
  delete process.env.ADMIN_OPEN;
  const pg = await withPg();
  try {
    const asha = crypto.randomUUID();
    const ravi = crypto.randomUUID();
    await pg.db.query(
      `INSERT INTO users (id, display_name, phone_or_email, credit_balance)
       VALUES ($1, 'Asha', 'asha@example.com', 0), ($2, 'Ravi', 'ravi-secret@example.com', 0)`,
      [asha, ravi],
    );
    const ashaVideo = await seedVideo(pg.db, asha);
    await pg.db.query("UPDATE videos SET status = 'failed' WHERE id = $1", [ashaVideo]);
    await pg.db.query("UPDATE chats SET title = 'Bees' WHERE user_id = $1", [asha]);
    await seedVideo(pg.db, ravi);
    await pg.db.query("UPDATE chats SET title = 'Secret film' WHERE user_id = $1", [ravi]);

    const app = await createApp({
      env: { PORT: "0", PUBLIC_BASE_URL: "http://127.0.0.1:9", MOCK: "1" },
      db: pg.db,
    });
    const server = app.listen(0);
    try {
      const port = await new Promise<number>((resolve, reject) => {
        server.once("listening", () => resolve((server.address() as AddressInfo).port));
        server.once("error", reject);
      });
      const base = `http://127.0.0.1:${port}`;
      const path = `/admin/users/${asha}`;
      const locked = await fetch(`${base}${path}`);
      assert.equal(locked.status, 200);
      const login = await locked.text();
      assert.match(login, /Sign in/);
      assert.equal(login.includes("asha@example.com"), false);
      assert.equal(login.includes("ravi-secret@example.com"), false);

      const headers = { cookie: `chotu_admin=${encodeURIComponent(TOKEN)}` };
      const page = await fetch(`${base}${path}`, { headers });
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.match(html, /Asha/);
      assert.match(html, /asha@example.com/);
      assert.match(html, /Bees/);
      assert.match(html, /failed/);
      assert.equal(html.includes("ravi-secret@example.com"), false);
      assert.equal(html.includes("Secret film"), false);
      assert.equal(html.includes("ADMIN_TOKEN"), false);

      const missing = await fetch(`${base}/admin/users/not-a-user`, { headers });
      assert.equal(missing.status, 404);
      assert.match(await missing.text(), /No such user/);

      delete process.env.ADMIN_TOKEN;
      const closed = await fetch(`${base}${path}`);
      assert.equal(closed.status, 503);
      assert.deepEqual(await closed.json(), { error: "admin_unconfigured" });

      process.env.ADMIN_OPEN = "1";
      const opened = await fetch(`${base}${path}`);
      const openHtml = await opened.text();
      assert.equal(opened.status, 200);
      assert.match(openHtml, /asha@example.com/);
      assert.match(openHtml, /failed/);
      assert.equal(openHtml.includes("ravi-secret@example.com"), false);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    if (previous.token === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous.token;
    if (previous.open === undefined) delete process.env.ADMIN_OPEN;
    else process.env.ADMIN_OPEN = previous.open;
    await pg.close();
  }
});
