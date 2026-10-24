import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import { adminRouter } from "./routes.js";
import { createPostgresLedger } from "../credits/ledger.js";
import { seedUser, seedVideo, withPg } from "../credits/testing.js";
import { createApp } from "../deploy/app.js";
import { readDeployConfig, deployLogLine } from "../deploy/config.js";
import { renderEventsCsv } from "./format.js";
import { createPostgresEventLog } from "./log.js";

test("deploy config reads env names and the log line hides secrets", () => {
  const config = readDeployConfig({
    MOCK: "1",
    PORT: "8787",
    PUBLIC_BASE_URL: "https://demo.example/",
    DATABASE_URL: "postgres://user:secret@localhost/db",
    PINE_LABS_API_KEY: "super-secret",
    PINE_LABS_MERCHANT_ID: "merchant",
    PINE_LABS_WEBHOOK_SECRET: "c2VjcmV0",
    RENDER_API_KEY: "rnd_secret",
    STARTER_CREDITS: "40",
  });
  assert.equal(config.mock, true);
  assert.equal(config.pineLabsMock, true);
  assert.equal(readDeployConfig({ PINE_LABS_MOCK: "0" }).pineLabsMock, false);
  assert.equal(config.publicBaseUrl, "https://demo.example");
  assert.equal(config.starterCredits, 40);
  assert.equal(config.pineApiKey, "super-secret");
  const line = deployLogLine(config, true);
  assert.match(line, /mock=true/);
  assert.match(line, /pineMock=true/);
  assert.match(line, /pine=true/);
  assert.match(line, /starterCredits=40/);
  assert.equal(line.includes("super-secret"), false);
  assert.equal(line.includes("rnd_secret"), false);
  assert.equal(line.includes("postgres://"), false);
});

test(".env.example documents the contract variables and the start command", async () => {
  const root = join(dirnameOfRepo(), ".env.example");
  const text = await readFile(root, "utf8");
  for (const name of [
    "DATABASE_URL",
    "HIGGSFIELD_API_KEY",
    "ELEVENLABS_API_KEY",
    "LLM_API_KEY",
    "ANTHROPIC_API_KEY",
    "CLAUDE_MODEL",
    "LLM_PROVIDER",
    "PINE_LABS_MOCK",
    "PINE_LABS_MERCHANT_ID",
    "PINE_LABS_API_KEY",
    "PINE_LABS_WEBHOOK_SECRET",
    "RENDER_API_KEY",
    "MOCK",
    "PORT",
    "PUBLIC_BASE_URL",
    "STARTER_CREDITS",
  ]) {
    assert.match(text, new RegExp(`^${name}=`, "m"), name);
  }
  assert.match(text, /npm start/);
  assert.equal(/sk-[A-Za-z0-9]{8,}/.test(text), false);
  assert.equal(/rnd_[A-Za-z0-9]{8,}/.test(text), false);
});

test("checkout stays on the fake Pine Labs link until PINE_LABS_MOCK is off", async () => {
  const app = await createApp({
    env: {
      PORT: "0",
      PUBLIC_BASE_URL: "http://127.0.0.1:9",
      PINE_LABS_MERCHANT_ID: "merchant",
      PINE_LABS_API_KEY: "secret",
      PINE_LABS_WEBHOOK_SECRET: "c2VjcmV0",
    },
  });
  const base = await listen(app);
  try {
    const userId = crypto.randomUUID();
    const created = await fetch(`${base}/v1/packs/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": userId },
      body: JSON.stringify({ packId: "starter" }),
    });
    assert.equal(created.status, 201);
    const checkout = (await created.json()) as { paymentId: string; status: string; checkoutUrl: string; creditsGranted: number };
    assert.equal(checkout.status, "pending");
    assert.equal(checkout.creditsGranted, 0);
    assert.match(checkout.checkoutUrl, /\/v1\/packs\/mock-pay\?payment_id=/);
    const paid = await fetch(`${base}/v1/packs/mock-pay`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ paymentId: checkout.paymentId }),
    });
    const paidBody = (await paid.json()) as { creditsGranted: number; status: string };
    assert.equal(paidBody.status, "mocked");
    assert.equal(paidBody.creditsGranted, 500);
    const replay = await fetch(`${base}/v1/packs/mock-pay`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ paymentId: checkout.paymentId }),
    });
    const replayBody = (await replay.json()) as { creditsGranted: number };
    assert.equal(replayBody.creditsGranted, 0);
    const html = await (await fetch(`${base}/admin`)).text();
    assert.match(html, /payment/);
  } finally {
    await close(base);
  }

  const liveOff = await createApp({
    env: { PINE_LABS_MOCK: "0", PORT: "0", PUBLIC_BASE_URL: "http://127.0.0.1:9" },
  });
  const offBase = await listen(liveOff);
  try {
    const refused = await fetch(`${offBase}/v1/packs/checkout`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-user-id": crypto.randomUUID() },
      body: JSON.stringify({ packId: "starter" }),
    });
    assert.equal(refused.status, 503);
  } finally {
    await close(offBase);
  }
});

test("admin HTML and CSV come from the events table", async () => {
  const pg = await withPg();
  const workDir = await mkdtemp(join(tmpdir(), "chotu-admin-"));
  try {
    const userId = await seedUser(pg.db, 0);
    const videoId = await seedVideo(pg.db, userId);
    const ledger = createPostgresLedger(pg.db);
    await ledger.grant({ userId, amount: 10, ref: "signup:test", reason: "signup_grant" });
    const log = createPostgresEventLog(pg.db);
    await log.record({
      kind: "render_done",
      userId,
      videoId,
      payload: { note: "<script>alert(1)</script>" },
    });
    await mkdir(join(workDir, videoId), { recursive: true });
    await writeFile(join(workDir, videoId, "final.mp4"), "fake-mp4");

    const app = await createApp({
      env: { MOCK: "1", PORT: "0", PUBLIC_BASE_URL: "http://127.0.0.1:9" },
      db: pg.db,
      workDir,
    });
    const base = await listen(app);
    try {
      const checkout = await fetch(`${base}/v1/packs/checkout`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ packId: "starter" }),
      });
      assert.equal(checkout.status, 201);
      const created = (await checkout.json()) as { paymentId: string; checkoutUrl?: string; creditsGranted?: number };
      assert.equal(created.creditsGranted, 0);
      assert.match(created.checkoutUrl ?? "", /\/v1\/packs\/mock-pay\?payment_id=/);
      const paid = await fetch(`${base}/v1/packs/mock-pay`, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ paymentId: created.paymentId }),
      });
      assert.equal(paid.status, 200);
      const paidBody = (await paid.json()) as { creditsGranted: number };
      assert.equal(paidBody.creditsGranted, 500);

      const page = await fetch(`${base}/admin`);
      const html = await page.text();
      assert.equal(page.status, 200);
      assert.match(html, /render_done/);
      assert.match(html, /payment/);
      assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
      assert.equal(html.includes("<script>alert(1)</script>"), false);

      const csvRes = await fetch(`${base}/admin/export.csv`);
      const csv = await csvRes.text();
      assert.match(csv.split("\n")[0] ?? "", /id,created_at,kind,user_id,video_id,payload/);
      assert.match(csv, /render_done/);
      assert.match(csv, /payment/);
      assert.equal(renderEventsCsv([]).startsWith("id,created_at,kind"), true);

      const download = await fetch(`${base}/v1/videos/${videoId}/download`);
      assert.equal(download.status, 200);
      assert.equal(await download.text(), "fake-mp4");
      const after = await (await fetch(`${base}/admin`)).text();
      assert.match(after, /download/);

      const missing = await fetch(`${base}/v1/videos/missing-file/download`);
      assert.equal(missing.status, 404);
    } finally {
      await close(base);
    }
  } finally {
    await pg.close();
    await rm(workDir, { recursive: true, force: true });
  }
});

test("a database error on /admin returns 500", async () => {
  const app = express();
  app.use(
    adminRouter(
      {
        async list() {
          throw new Error("db down");
        },
        async counts() {
          throw new Error("db down");
        },
        async record() {},
      },
      { mock: true, database: true },
    ),
  );
  app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    res.status(500).json({ error: "request_failed" });
  });
  const server = app.listen(0);
  try {
    const port = (server.address() as AddressInfo).port;
    const page = await fetch(`http://127.0.0.1:${port}/admin`);
    assert.equal(page.status, 500);
    const body = (await page.json()) as { error: string };
    assert.equal(body.error, "request_failed");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
});

const servers = new Map<string, ReturnType<import("express").Express["listen"]>>();

async function listen(app: import("express").Express): Promise<string> {
  const server = app.listen(0);
  const port = await new Promise<number>((resolve, reject) => {
    server.once("listening", () => {
      const address = server.address() as AddressInfo;
      resolve(address.port);
    });
    server.once("error", reject);
  });
  const base = `http://127.0.0.1:${port}`;
  servers.set(base, server);
  return base;
}

async function close(base: string): Promise<void> {
  const server = servers.get(base);
  if (!server) return;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

function dirnameOfRepo(): string {
  return join(fileUrlDir(import.meta.url), "../../..");
}

function fileUrlDir(url: string): string {
  return new URL(".", url).pathname;
}
