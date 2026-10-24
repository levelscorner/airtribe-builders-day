import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { splitSql } from "./db.js";
import { InsufficientCreditsError, LedgerError } from "./errors.js";
import { createPostgresLedger, type Ledger } from "./ledger.js";
import { createMockLedger } from "./mock.js";
import { creditsForProviderCents, quote } from "./money.js";
import { seedUser, seedVideo, withPg } from "./testing.js";

test("60% margin rounds the price up to the next credit", () => {
  assert.equal(creditsForProviderCents(0), 0);
  assert.equal(creditsForProviderCents(1), 3);
  assert.equal(creditsForProviderCents(4), 10);
  assert.equal(quote({ operation: "image" }).creditCost, 10);
  assert.equal(quote({ operation: "clip" }).creditCost, 50);
  assert.equal(quote({ operation: "audio" }).creditCost, 5);
  assert.equal(quote({ operation: "final" }).creditCost, 3);
  assert.equal(quote({ operation: "cast_create" }).creditCost, 28);
  assert.equal(quote({ operation: "regenerate", artefactKind: "script" }).creditCost, 3);
  // 8 * (4 + 20 + 2) + 1 = 209 cents; ceil(209 * 2.5) = 523
  assert.equal(quote({ operation: "video_max" }).creditCost, 523);
});

test("migration declares a UNIQUE ref and the contract reasons", async () => {
  const sql = await readFile(join(dirname(fileURLToPath(import.meta.url)), "migrations", "001_ledger.sql"), "utf8");
  assert.match(sql, /ref\s+text NOT NULL UNIQUE/);
  for (const reason of ["signup_grant", "pack_purchase", "reserve", "settle", "refund", "regenerate", "cast_create"]) {
    assert.match(sql, new RegExp(reason));
  }
  assert.ok(splitSql(sql).length >= 4);
});

interface Ctx {
  ledger: Ledger;
  userId: string;
  videoId: string;
  close: () => Promise<void>;
}

async function postgresCtx(balance = 500): Promise<Ctx> {
  const pg = await withPg();
  const userId = await seedUser(pg.db, balance);
  const videoId = await seedVideo(pg.db, userId);
  return { ledger: createPostgresLedger(pg.db), userId, videoId, close: pg.close };
}

async function mockCtx(balance = 500): Promise<Ctx> {
  const ledger = createMockLedger();
  const userId = crypto.randomUUID();
  const videoId = crypto.randomUUID();
  ledger.seedUser(userId, balance);
  return { ledger, userId, videoId, close: async () => {} };
}

function suite(label: string, open: (balance?: number) => Promise<Ctx>): void {
  test(`${label}: reserve debits once when the ref is repeated`, async () => {
    const ctx = await open();
    try {
      const first = await ctx.ledger.reserve({
        userId: ctx.userId,
        videoId: ctx.videoId,
        amount: 40,
        ref: "job:max",
      });
      const second = await ctx.ledger.reserve({
        userId: ctx.userId,
        videoId: ctx.videoId,
        amount: 40,
        ref: "job:max",
      });
      assert.deepEqual(first, { reserved: 40 });
      assert.deepEqual(second, { reserved: 40 });
      assert.equal(await ctx.ledger.balance(ctx.userId), 460);
    } finally {
      await ctx.close();
    }
  });

  test(`${label}: reserve refuses to take the balance negative`, async () => {
    const ctx = await open(30);
    try {
      await assert.rejects(
        () =>
          ctx.ledger.reserve({
            userId: ctx.userId,
            videoId: ctx.videoId,
            amount: 31,
            ref: "job:too-big",
          }),
        (error: unknown) => error instanceof InsufficientCreditsError && error.balance === 30,
      );
      assert.equal(await ctx.ledger.balance(ctx.userId), 30);
    } finally {
      await ctx.close();
    }
  });

  test(`${label}: settle refunds the unused reserve and is idempotent`, async () => {
    const ctx = await open();
    try {
      await ctx.ledger.reserve({
        userId: ctx.userId,
        videoId: ctx.videoId,
        amount: 100,
        ref: "job:reserve",
      });
      const settled = await ctx.ledger.settle({
        userId: ctx.userId,
        videoId: ctx.videoId,
        actual: 40,
        reserveRef: "job:reserve",
        ref: "job:settle",
      });
      const replay = await ctx.ledger.settle({
        userId: ctx.userId,
        videoId: ctx.videoId,
        actual: 40,
        reserveRef: "job:reserve",
        ref: "job:settle",
      });
      assert.deepEqual(settled, { charged: 40, refunded: 60 });
      assert.deepEqual(replay, { charged: 40, refunded: 60 });
      assert.equal(await ctx.ledger.balance(ctx.userId), 460);
    } finally {
      await ctx.close();
    }
  });

  test(`${label}: a second settle ref for the same reserve is rejected`, async () => {
    const ctx = await open();
    try {
      await ctx.ledger.reserve({
        userId: ctx.userId,
        videoId: ctx.videoId,
        amount: 100,
        ref: "job:reserve",
      });
      await ctx.ledger.settle({
        userId: ctx.userId,
        videoId: ctx.videoId,
        actual: 40,
        reserveRef: "job:reserve",
        ref: "job:settle",
      });
      await assert.rejects(
        () =>
          ctx.ledger.settle({
            userId: ctx.userId,
            videoId: ctx.videoId,
            actual: 10,
            reserveRef: "job:reserve",
            ref: "job:settle-again",
          }),
        (error: unknown) => error instanceof LedgerError && error.code === "already_settled",
      );
      assert.equal(await ctx.ledger.balance(ctx.userId), 460);
    } finally {
      await ctx.close();
    }
  });

  test(`${label}: failure refund restores the reserve once`, async () => {
    const ctx = await open();
    try {
      await ctx.ledger.reserve({
        userId: ctx.userId,
        videoId: ctx.videoId,
        amount: 80,
        ref: "job:reserve",
      });
      await ctx.ledger.refund({
        userId: ctx.userId,
        videoId: ctx.videoId,
        amount: 80,
        ref: "job:refund",
        reason: "render_failed",
      });
      await ctx.ledger.refund({
        userId: ctx.userId,
        videoId: ctx.videoId,
        amount: 80,
        ref: "job:refund",
        reason: "render_failed",
      });
      assert.equal(await ctx.ledger.balance(ctx.userId), 500);
    } finally {
      await ctx.close();
    }
  });

  test(`${label}: pack grant is idempotent on ref`, async () => {
    const ctx = await open(0);
    try {
      const first = await ctx.ledger.grant({
        userId: ctx.userId,
        amount: 120,
        ref: "pack:pay_1",
        reason: "pack_purchase",
      });
      const second = await ctx.ledger.grant({
        userId: ctx.userId,
        amount: 120,
        ref: "pack:pay_1",
        reason: "pack_purchase",
      });
      assert.equal(first.applied, true);
      assert.equal(second.applied, false);
      assert.equal(await ctx.ledger.balance(ctx.userId), 120);
    } finally {
      await ctx.close();
    }
  });

  test(`${label}: reusing a ref for a different reason is rejected`, async () => {
    const ctx = await open();
    try {
      await ctx.ledger.grant({
        userId: ctx.userId,
        amount: 10,
        ref: "same-ref",
        reason: "signup_grant",
      });
      await assert.rejects(
        () =>
          ctx.ledger.reserve({
            userId: ctx.userId,
            videoId: ctx.videoId,
            amount: 10,
            ref: "same-ref",
          }),
        (error: unknown) => error instanceof LedgerError && error.code === "ref_conflict",
      );
      assert.equal(await ctx.ledger.balance(ctx.userId), 510);
    } finally {
      await ctx.close();
    }
  });
}

suite("postgres", postgresCtx);
suite("mock", mockCtx);

test("postgres: migration is idempotent and the ref unique constraint holds", async () => {
  const pg = await withPg();
  try {
    const again = await (await import("./db.js")).migrate(pg.db);
    assert.deepEqual(again, []);
    const userId = await seedUser(pg.db, 10);
    await pg.db.query(
      `INSERT INTO credit_ledger (user_id, ref, delta, reason) VALUES ($1, 'once', 1, 'signup_grant')`,
      [userId],
    );
    await assert.rejects(
      () =>
        pg.db.query(
          `INSERT INTO credit_ledger (user_id, ref, delta, reason) VALUES ($1, 'once', 1, 'signup_grant')`,
          [userId],
        ),
      (error: unknown) => (error as { code?: string }).code === "23505",
    );
  } finally {
    await pg.close();
  }
});

test("postgres: balance matches the sum of ledger deltas", async () => {
  const pg = await withPg();
  try {
    const ledger = createPostgresLedger(pg.db);
    const userId = await seedUser(pg.db, 200);
    const videoId = await seedVideo(pg.db, userId);
    await ledger.reserve({ userId, videoId, amount: 100, ref: "r" });
    await ledger.settle({ userId, videoId, actual: 25, reserveRef: "r", ref: "s" });
    const sum = await pg.db.query<{ total: number | string }>(
      "SELECT COALESCE(SUM(delta), 0) AS total FROM credit_ledger WHERE user_id = $1",
      [userId],
    );
    const balance = await ledger.balance(userId);
    assert.equal(balance, 200 + Number(sum.rows[0]?.total));
    assert.equal(balance, 175);
    const video = await pg.db.query<{ reserved_credits: number }>(
      "SELECT reserved_credits FROM videos WHERE id = $1",
      [videoId],
    );
    assert.equal(Number(video.rows[0]?.reserved_credits), 25);
  } finally {
    await pg.close();
  }
});

test("postgres: two reserves cannot overdraw the same balance", async () => {
  const pg = await withPg();
  try {
    const ledger = createPostgresLedger(pg.db);
    const userId = await seedUser(pg.db, 100);
    const videoId = await seedVideo(pg.db, userId);
    const results = await Promise.allSettled([
      ledger.reserve({ userId, videoId, amount: 80, ref: "a" }),
      ledger.reserve({ userId, videoId, amount: 80, ref: "b" }),
    ]);
    const ok = results.filter((result) => result.status === "fulfilled");
    assert.equal(ok.length, 1);
    assert.equal(await ledger.balance(userId), 20);
  } finally {
    await pg.close();
  }
});
