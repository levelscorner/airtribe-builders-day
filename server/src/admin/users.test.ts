import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { withPg } from "../credits/testing.js";
import { createApp } from "../deploy/app.js";
import { renderUsersCsv } from "./format.js";

const ADMIN_TOKEN = "test-admin-token";

test("user csv quotes commas, quotes, and newlines", () => {
  const csv = renderUsersCsv([
    {
      id: "00000000-0000-4000-8000-000000000001",
      displayName: 'Ada "Bee", Jr.',
      phoneOrEmail: "ada@example.com\n<script>",
      createdAt: "2026-01-02T03:04:05.000Z",
    },
  ]);
  assert.equal(
    csv,
    [
      "display_name,phone_or_email,created_at",
      '"Ada ""Bee"", Jr.","ada@example.com\n<script>","2026-01-02T03:04:05.000Z"',
    ].join("\n") + "\n",
  );
});

test("admin lists each user and the csv repeats those fields", async () => {
  const previous = process.env.ADMIN_TOKEN;
  process.env.ADMIN_TOKEN = ADMIN_TOKEN;
  const pg = await withPg();
  try {
    await pg.db.query(
      `INSERT INTO users (id, display_name, phone_or_email, credit_balance, created_at)
       VALUES ($1, $2, $3, 0, $4), ($5, $6, $7, 0, $8)`,
      [
        crypto.randomUUID(),
        'Ada "Bee", Jr.',
        "ada@example.com\n<script>",
        "2026-01-02T03:04:05.000Z",
        crypto.randomUUID(),
        "Newer, Plain",
        null,
        "2026-02-03T04:05:06.000Z",
      ],
    );
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
      const headers = { cookie: `chotu_admin=${encodeURIComponent(ADMIN_TOKEN)}` };
      const page = await fetch(`http://127.0.0.1:${port}/admin`, { headers });
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.match(html, /Ada &quot;Bee&quot;, Jr\./);
      assert.match(html, /ada@example\.com\n&lt;script&gt;/);
      assert.match(html, /Newer, Plain/);
      assert.equal(html.includes("<script>"), false);
      const adaAt = html.indexOf("Ada &quot;Bee&quot;, Jr.");
      const newerAt = html.indexOf("Newer, Plain");
      assert.ok(newerAt >= 0 && adaAt > newerAt);

      const csv = await (await fetch(`http://127.0.0.1:${port}/admin/export.csv`, { headers })).text();
      assert.match(csv.split("\n")[0] ?? "", /^id,created_at,kind,user_id,video_id,payload$/);
      assert.match(csv, /display_name,phone_or_email,created_at/);
      assert.match(csv, /"Ada ""Bee"", Jr\.","ada@example\.com\n<script>","2026-01-02T03:04:05\.000Z"/);
      assert.match(csv, /"Newer, Plain","","2026-02-03T04:05:06\.000Z"/);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    }
  } finally {
    if (previous === undefined) delete process.env.ADMIN_TOKEN;
    else process.env.ADMIN_TOKEN = previous;
    await pg.close();
  }
});
