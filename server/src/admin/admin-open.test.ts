import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import test from "node:test";
import express from "express";
import { createMemoryEventLog } from "./log.js";
import { adminRouter } from "./routes.js";

const OPEN_PATHS = ["/admin", "/admin/payments", "/admin/export.csv"] as const;

test("ADMIN_OPEN defaults off and keeps the token check", async () => {
  await withAdminEnv({ token: undefined, open: undefined }, async (base) => {
    for (const path of OPEN_PATHS) {
      const response = await fetch(`${base}${path}`);
      assert.equal(response.status, 503, path);
      assert.deepEqual(await response.json(), { error: "admin_unconfigured" });
    }
    const approve = await fetch(`${base}/admin/payments/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: "pay_1" }),
    });
    assert.equal(approve.status, 503);
    assert.deepEqual(await approve.json(), { error: "admin_unconfigured" });
  });

  await withAdminEnv({ token: "test-admin-token", open: "0" }, async (base) => {
    const page = await fetch(`${base}/admin`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /Sign in/);
    assert.equal(html.includes("<h1>Traction</h1>"), false);

    const csv = await fetch(`${base}/admin/export.csv`);
    assert.equal(csv.status, 200);
    assert.equal((await csv.text()).includes("id,created_at"), false);

    const approve = await fetch(`${base}/admin/payments/approve`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: "chotu_admin=wrong" },
      body: JSON.stringify({ paymentId: "pay_1" }),
    });
    assert.equal(approve.status, 401);
    assert.deepEqual(await approve.json(), { error: "admin_required" });
  });
});

test("ADMIN_OPEN=1 serves the admin pages with no token", async () => {
  await withAdminEnv({ token: undefined, open: "1" }, async (base) => {
    const page = await fetch(`${base}/admin`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<h1>Traction<\/h1>/);

    const payments = await fetch(`${base}/admin/payments`);
    assert.equal(payments.status, 200);
    assert.match(await payments.text(), /utr-open/);

    const csv = await fetch(`${base}/admin/export.csv`);
    assert.equal(csv.status, 200);
    assert.match(await csv.text(), /^id,created_at/);

    const approve = await fetch(`${base}/admin/payments/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: "pay_1" }),
    });
    assert.equal(approve.status, 503);
    assert.deepEqual(await approve.json(), { error: "admin_unconfigured" });
  });

  await withAdminEnv({ token: "test-admin-token", open: "1" }, async (base) => {
    const page = await fetch(`${base}/admin`, { headers: { cookie: "chotu_admin=wrong" } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /<h1>Traction<\/h1>/);

    const payments = await fetch(`${base}/admin/payments`);
    assert.match(await payments.text(), /utr-open/);
    const csv = await fetch(`${base}/admin/export.csv`);
    assert.match(await csv.text(), /^id,created_at/);

    const approve = await fetch(`${base}/admin/payments/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ paymentId: "pay_1" }),
    });
    assert.equal(approve.status, 401);
    assert.deepEqual(await approve.json(), { error: "admin_required" });
  });
});

test("env examples document ADMIN_OPEN as off unless set to 1", async () => {
  for (const path of [join(repoRoot(), ".env.example"), join(repoRoot(), "server/.env.example")]) {
    const text = await readFile(path, "utf8");
    assert.match(text, /^ADMIN_OPEN=$/m, path);
    assert.match(text, /any value other than 1/, path);
    assert.equal(text.includes("ADMIN_OPEN=1"), false, path);
  }
});

function app(): express.Express {
  const application = express();
  application.use(express.json());
  application.use(
    adminRouter(
      createMemoryEventLog(),
      { mock: true, database: false },
      {
        async listPending() {
          return [
            {
              id: "pay_1",
              userId: "user_1",
              packId: "starter",
              credits: 10,
              amountInr: 99,
              utr: "utr-open",
            },
          ];
        },
        async approve() {
          return { creditsGranted: 10 };
        },
        async reject() {},
      },
    ),
  );
  return application;
}

async function withAdminEnv(
  env: { token: string | undefined; open: string | undefined },
  run: (base: string) => Promise<void>,
): Promise<void> {
  const previous = { token: process.env.ADMIN_TOKEN, open: process.env.ADMIN_OPEN };
  assign("ADMIN_TOKEN", env.token);
  assign("ADMIN_OPEN", env.open);
  const server = app().listen(0);
  try {
    const port = await new Promise<number>((resolve, reject) => {
      server.once("listening", () => resolve((server.address() as AddressInfo).port));
      server.once("error", reject);
    });
    await run(`http://127.0.0.1:${port}`);
  } finally {
    assign("ADMIN_TOKEN", previous.token);
    assign("ADMIN_OPEN", previous.open);
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

function assign(name: "ADMIN_TOKEN" | "ADMIN_OPEN", value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

function repoRoot(): string {
  return join(new URL(".", import.meta.url).pathname, "../../..");
}
