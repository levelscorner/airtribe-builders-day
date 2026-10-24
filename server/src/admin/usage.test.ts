import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { Db } from "../credits/db.js";
import { withPg } from "../credits/testing.js";
import { createApp } from "../deploy/app.js";
import { createMemoryEventLog } from "./log.js";
import { adminRouter } from "./routes.js";
import { bucketForStage, isTestAccount, loadUsage, maskEmail, renderUsageHtml, type UsageReport } from "./usage.js";

const ADMIN_TOKEN = "test-admin-token";
process.env.ADMIN_TOKEN = ADMIN_TOKEN;

function adminHeaders(): Record<string, string> {
  return { cookie: `chotu_admin=${encodeURIComponent(ADMIN_TOKEN)}` };
}

test("test accounts and masked emails follow the admin rule", () => {
  assert.equal(isTestAccount("marsqa+qa@gmail.com"), true);
  assert.equal(isTestAccount("  MarsQA+qa@Gmail.com "), true);
  assert.equal(isTestAccount("marsqa+@gmail.com"), true);
  assert.equal(isTestAccount("notmarsqa+qa@gmail.com"), false);
  assert.equal(isTestAccount("marsqa@gmail.com"), false);
  assert.equal(isTestAccount("someone@example.com"), true);
  assert.equal(isTestAccount("someone@Example.COM"), true);
  assert.equal(isTestAccount("user@sub.example.com"), false);
  assert.equal(isTestAccount(null), false);
  assert.equal(isTestAccount("9990011122"), false);
  assert.equal(maskEmail("asha@gmail.com"), "a***@g***.com");
  assert.equal(maskEmail(" someone@example.com "), "s***@e***.com");
  assert.equal(maskEmail("ab@cd.co"), "a***@c***.co");
  assert.equal(maskEmail("no-at"), "");
  assert.equal(maskEmail(null), "");
  assert.equal(bucketForStage("prompts"), "visuals");
  assert.equal(bucketForStage("images"), "visuals");
  assert.equal(bucketForStage("clips"), "visuals");
  assert.equal(bucketForStage("audio"), "voice");
  assert.equal(bucketForStage("final"), "final");
  assert.equal(bucketForStage("mystery"), null);

  const html = renderUsageHtml({
    ...zeros(true),
    recentUsers: [{ name: "Pat & Co <b>", email: "p***@s***.in", signedUpAt: "2026-10-21T00:00:00.000Z", videos: 0, credits: 4 }],
  });
  assert.match(html, /Pat &amp; Co &lt;b&gt;/);
  assert.equal(html.includes("<b>"), false);
  assert.match(html, /Database not connected/);
  assert.match(html, /width=device-width, initial-scale=1/);
});

test("usage metrics skip test accounts until the toggle is off", async () => {
  const pg = await withPg();
  try {
    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const at = (offsetMs: number) => new Date(todayStart.getTime() + offsetMs).toISOString();
    const past = at(-10 * 24 * 60 * 60 * 1000);

    const asha = await insertUser(pg.db, { name: "Asha", email: "asha@gmail.com", credits: 120, createdAt: at(12 * 60 * 60 * 1000) });
    const pat = await insertUser(pg.db, { name: "Pat & Co", email: "pat@studio.in", credits: 4, createdAt: at(-3 * 24 * 60 * 60 * 1000) });
    await insertUser(pg.db, { name: "Old Creator", email: "old@studio.in", credits: 1, createdAt: past });
    const marsqa = await insertUser(pg.db, {
      name: "QA Bot",
      email: "marsqa+qa@gmail.com",
      credits: 9,
      createdAt: at(13 * 60 * 60 * 1000),
    });
    await insertUser(pg.db, {
      name: "Example Person",
      email: "someone@example.com",
      credits: 2,
      createdAt: at(14 * 60 * 60 * 1000),
    });

    for (const stage of ["brief", "cast", "script", "clips", "audio", "final", "done"]) {
      await insertVideo(pg.db, asha, stage, past);
    }
    await insertVideo(pg.db, marsqa, "done", past);
    const patChat = crypto.randomUUID();
    await pg.db.query("INSERT INTO chats (id, user_id, title, created_at) VALUES ($1, $2, 'pat', $3)", [patChat, pat, past]);

    await ledger(pg.db, asha, "signup:asha", 40, "signup_grant");
    await ledger(pg.db, asha, "pack:asha", 500, "pack_purchase");
    await ledger(pg.db, asha, "reserve:asha", -20, "reserve");
    await ledger(pg.db, asha, "settle:asha", 5, "settle");
    await ledger(pg.db, asha, "refund:asha", 3, "refund");
    await ledger(pg.db, asha, "regen:asha", -2, "regenerate");
    await ledger(pg.db, asha, "cast:asha", -4, "cast_create");
    await ledger(pg.db, marsqa, "signup:qa", 100, "signup_grant");

    await payment(pg.db, asha, 99, "phonepe", "pending_verification");
    await payment(pg.db, asha, 199, "phonepe", "paid");
    await payment(pg.db, asha, 500, "pine_labs", "mocked");
    await payment(pg.db, asha, 50, "pine_labs", "pending");
    await payment(pg.db, marsqa, 1000, "phonepe", "paid");

    const activeAt = at(60 * 60 * 1000);
    await pg.db.query(
      "INSERT INTO events (user_id, kind, payload, created_at) VALUES ($1, 'signup', '{}'::jsonb, $2)",
      [asha, activeAt],
    );
    await pg.db.query(
      "INSERT INTO events (user_id, kind, payload, created_at) VALUES ($1, 'signup', '{}'::jsonb, $2)",
      [marsqa, activeAt],
    );

    const hidden = await loadUsage(pg.db, { excludeTestAccounts: true, now });
    assert.equal(hidden.database, true);
    assert.equal(hidden.excludeTestAccounts, true);
    assert.deepEqual(hidden.signups, { total: 3, today: 1, last7Days: 2 });
    assert.equal(hidden.dailyActiveUsers, 1);
    assert.equal(hidden.chatsStarted, 8);
    assert.deepEqual(hidden.videosByStage, { brief: 1, cast: 1, script: 1, visuals: 1, voice: 1, final: 1, done: 1 });
    assert.deepEqual(hidden.funnel, { brief: 7, cast: 6, script: 5, visuals: 4, voice: 3, done: 1 });
    assert.equal(hidden.videosFinished, 1);
    assert.deepEqual(hidden.credits, { granted: 540, spent: 26, refunded: 8 });
    assert.deepEqual(hidden.qrPayments, { pending: 1, approved: 1, revenueInr: 199 });
    assert.deepEqual(
      hidden.recentUsers.map((user) => user.name),
      ["Asha", "Pat & Co", "Old Creator"],
    );
    const ashaRow = hidden.recentUsers[0];
    assert.equal(ashaRow?.email, "a***@g***.com");
    assert.equal(ashaRow?.videos, 7);
    assert.equal(ashaRow?.credits, 120);
    assert.equal(JSON.stringify(hidden).includes("asha@gmail.com"), false);
    assert.equal(JSON.stringify(hidden).includes("marsqa+qa@gmail.com"), false);

    await pg.db.query(
      `CREATE TABLE IF NOT EXISTS messages (
         id uuid PRIMARY KEY,
         chat_id uuid NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
         role text NOT NULL,
         kind text NOT NULL,
         body jsonb NOT NULL DEFAULT '{}',
         created_at timestamptz NOT NULL DEFAULT now()
       )`,
    );
    await pg.db.query(
      "INSERT INTO messages (id, chat_id, role, kind, body, created_at) VALUES ($1, $2, 'user', 'text', '{}'::jsonb, $3)",
      [crypto.randomUUID(), patChat, activeAt],
    );

    const withMessage = await loadUsage(pg.db, { excludeTestAccounts: true, now });
    assert.equal(withMessage.dailyActiveUsers, 2);

    const shown = await loadUsage(pg.db, { excludeTestAccounts: false, now });
    assert.deepEqual(shown.signups, { total: 5, today: 3, last7Days: 4 });
    assert.equal(shown.dailyActiveUsers, 3);
    assert.equal(shown.chatsStarted, 9);
    assert.equal(shown.videosFinished, 2);
    assert.equal(shown.funnel.done, 2);
    assert.equal(shown.funnel.brief, 8);
    assert.equal(shown.credits.granted, 640);
    assert.deepEqual(shown.qrPayments, { pending: 1, approved: 2, revenueInr: 1199 });
    assert.equal(shown.recentUsers[0]?.name, "Example Person");
    assert.equal(shown.recentUsers[0]?.email, "s***@e***.com");
    assert.equal(JSON.stringify(shown).includes("someone@example.com"), false);
    assert.equal(JSON.stringify(shown).includes("marsqa+qa@gmail.com"), false);

    const app = await createApp({
      env: { PAYMENTS_MODE: "mock", MOCK: "1", PORT: "0", PUBLIC_BASE_URL: "http://127.0.0.1:9" },
      db: pg.db,
    });
    const base = await listen(app);
    try {
      const traction = await fetch(`${base}/admin`, { headers: adminHeaders() });
      assert.match(await traction.text(), /href="\/admin\/usage"/);

      const page = await fetch(`${base}/admin/usage`, { headers: adminHeaders() });
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.match(html, /width=device-width, initial-scale=1/);
      assert.match(html, /Signups total: 3/);
      assert.match(html, /Daily active users: 2/);
      assert.match(html, /QR revenue: ₹199/);
      assert.match(html, /a\*\*\*@g\*\*\*\.com/);
      assert.match(html, /Show test accounts/);
      assert.equal(html.includes("asha@gmail.com"), false);
      assert.equal(html.includes("marsqa+qa@gmail.com"), false);
      assert.equal(html.includes("someone@example.com"), false);
      assert.match(html, /Pat &amp; Co/);

      const jsonRes = await fetch(`${base}/admin/usage.json`, { headers: adminHeaders() });
      assert.equal(jsonRes.status, 200);
      assert.match(jsonRes.headers.get("content-type") ?? "", /json/);
      const body = (await jsonRes.json()) as UsageReport;
      assert.equal(body.signups.total, 3);
      assert.equal(body.videosByStage.visuals, 1);
      assert.equal(body.credits.spent, 26);
      assert.equal(JSON.stringify(body).includes("asha@gmail.com"), false);

      const csvRes = await fetch(`${base}/admin/usage.csv`, { headers: adminHeaders() });
      const csv = await csvRes.text();
      assert.equal(csvRes.status, 200);
      assert.match(csvRes.headers.get("content-disposition") ?? "", /usage\.csv/);
      assert.match(csv, /"signups_total","3"/);
      assert.match(csv, /"qr_revenue_inr","199"/);
      assert.match(csv, /"Asha","a\*\*\*@g\*\*\*\.com"/);
      assert.equal(csv.includes("asha@gmail.com"), false);

      const included = await fetch(`${base}/admin/usage.json?includeTests=1`, { headers: adminHeaders() });
      const includedBody = (await included.json()) as UsageReport;
      assert.equal(includedBody.excludeTestAccounts, false);
      assert.equal(includedBody.signups.total, 5);
      assert.equal(includedBody.qrPayments.revenueInr, 1199);
      assert.equal(JSON.stringify(includedBody).includes("marsqa+qa@gmail.com"), false);

      const locked = await fetch(`${base}/admin/usage.json`);
      const lockedHtml = await locked.text();
      assert.equal(locked.status, 200);
      assert.match(lockedHtml, /Sign in/);
      assert.equal(lockedHtml.includes("Signups total"), false);
      assert.equal(lockedHtml.includes("asha@gmail.com"), false);
    } finally {
      await close(base);
    }
  } finally {
    await pg.close();
  }
});

test("usage without a database is an empty protected page", async () => {
  const empty = await loadUsage(undefined, { excludeTestAccounts: true });
  assert.equal(empty.database, false);
  assert.equal(empty.signups.total, 0);
  assert.deepEqual(empty.recentUsers, []);

  const app = express();
  app.use(adminRouter(createMemoryEventLog(), { mock: true, database: false }));
  const base = await listen(app);
  try {
    const page = await fetch(`${base}/admin/usage`, { headers: adminHeaders() });
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Database not connected/);
    assert.match(html, /Signups total: 0/);
    assert.match(html, /Daily active users: 0/);
  } finally {
    await close(base);
  }
});

function zeros(excludeTestAccounts: boolean): UsageReport {
  return {
    excludeTestAccounts,
    database: false,
    generatedAt: "2026-10-24T00:00:00.000Z",
    signups: { total: 0, today: 0, last7Days: 0 },
    dailyActiveUsers: 0,
    chatsStarted: 0,
    videosByStage: { brief: 0, cast: 0, script: 0, visuals: 0, voice: 0, final: 0, done: 0 },
    funnel: { brief: 0, cast: 0, script: 0, visuals: 0, voice: 0, done: 0 },
    videosFinished: 0,
    credits: { granted: 0, spent: 0, refunded: 0 },
    qrPayments: { pending: 0, approved: 0, revenueInr: 0 },
    recentUsers: [],
  };
}

async function insertUser(
  db: Db,
  input: { name: string; email: string; credits: number; createdAt: string },
): Promise<string> {
  const id = crypto.randomUUID();
  await db.query(
    "INSERT INTO users (id, display_name, phone_or_email, credit_balance, created_at) VALUES ($1, $2, $3, $4, $5)",
    [id, input.name, input.email, input.credits, input.createdAt],
  );
  return id;
}

async function insertVideo(db: Db, userId: string, stage: string, createdAt: string): Promise<void> {
  const chatId = crypto.randomUUID();
  const videoId = crypto.randomUUID();
  await db.query("INSERT INTO chats (id, user_id, title, created_at) VALUES ($1, $2, 'chat', $3)", [
    chatId,
    userId,
    createdAt,
  ]);
  await db.query(
    `INSERT INTO videos (id, user_id, chat_id, genre, language, stage, created_at, updated_at)
     VALUES ($1, $2, $3, 'kids', 'hi', $4, $5, $5)`,
    [videoId, userId, chatId, stage, createdAt],
  );
}

async function ledger(db: Db, userId: string, ref: string, delta: number, reason: string): Promise<void> {
  await db.query("INSERT INTO credit_ledger (user_id, ref, delta, reason) VALUES ($1, $2, $3, $4)", [
    userId,
    ref,
    delta,
    reason,
  ]);
}

async function payment(db: Db, userId: string, amountInr: number, provider: string, status: string): Promise<void> {
  await db.query(
    `INSERT INTO payments (user_id, pack_id, credits, amount_inr, provider, status)
     VALUES ($1, 'starter', 10, $2, $3, $4)`,
    [userId, amountInr, provider, status],
  );
}

const servers = new Map<string, ReturnType<express.Express["listen"]>>();

async function listen(app: express.Express): Promise<string> {
  const server = app.listen(0);
  const port = await new Promise<number>((resolve, reject) => {
    server.once("listening", () => resolve((server.address() as AddressInfo).port));
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${port}`;
  servers.set(base, server);
  return base;
}

async function close(base: string): Promise<void> {
  const server = servers.get(base);
  if (!server) return;
  servers.delete(base);
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}
