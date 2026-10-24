/**
 * G22 Venus QA: owner, txn client, idempotent debit, stage CAS,
 * failed artefact recovery, intake no re-enter cast.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { debitRegenerate, grantSignupCredits } from "../credits/stub.js";
import { getDb, migrate, resetDbForTests, type SqlClient } from "../db/client.js";
import {
  __testMarkStageFailed,
  approveArtefact,
  createOrchestratorContext,
  handleAnswer,
  regenerateArtefact,
  rejectArtefact,
  startChat,
  type OrchestratorContext,
} from "./machine.js";
import * as store from "./store.js";

process.env.MOCK = "1";
delete process.env.DATABASE_URL;

let db: SqlClient;
let ctx: OrchestratorContext;

before(async () => {
  await resetDbForTests();
  db = await getDb();
  await migrate(db);
  ctx = createOrchestratorContext(db, true);
});

after(async () => {
  await resetDbForTests();
});

async function signup(name: string, email: string) {
  const user = await store.insertUser(db, { displayName: name, phoneOrEmail: email });
  await grantSignupCredits(db, {
    userId: user.id,
    amount: store.STARTER_CREDITS,
    ref: `signup:${user.id}`,
  });
  return (await store.getUser(db, user.id))!;
}

async function finishBrief(chatId: string) {
  for (let i = 0; i < 12; i += 1) {
    const videoId = (await store.getChatMeta(db, chatId))!.videoId;
    const video = (await store.getVideoRow(db, videoId))!;
    if (video.stage !== "brief") return video;
    const messages = await store.listMessages(db, chatId);
    const question = [...messages].reverse().find((m) => m.kind === "question");
    assert.ok(question && question.kind === "question");
    await handleAnswer(ctx, chatId, { field: question.field, useDefaults: true });
  }
  const videoId = (await store.getChatMeta(db, chatId))!.videoId;
  return (await store.getVideoRow(db, videoId))!;
}

test("G22-owner: only the chat owner can approve/reject/regenerate", async () => {
  const owner = await signup("Owner", "owner-g22@example.com");
  const stranger = await signup("Stranger", "stranger-g22@example.com");
  const opened = await startChat(ctx, {
    userId: owner.id,
    initialMessage: "bees for kids",
  });
  await finishBrief(opened.chatId);
  const artefacts = await store.listArtefacts(db, opened.videoId);
  const target = artefacts.find((a) => a.state === "awaiting_approval");
  assert.ok(target);

  await assert.rejects(
    () => approveArtefact(ctx, { artefactId: target.id, userId: stranger.id }),
    /forbidden/,
  );
  await assert.rejects(
    () =>
      rejectArtefact(ctx, {
        artefactId: target.id,
        userId: stranger.id,
        rejectNote: "nope",
      }),
    /forbidden/,
  );
  await assert.rejects(
    () =>
      regenerateArtefact(ctx, {
        artefactId: target.id,
        userId: stranger.id,
        confirm: true,
      }),
    /forbidden/,
  );

  const ok = await approveArtefact(ctx, { artefactId: target.id, userId: owner.id });
  assert.equal(ok.state, "approved");
});

test("G22-txn: withTransaction pins one connection (BEGIN API present)", async () => {
  assert.equal(typeof db.withTransaction, "function");
  let seen = 0;
  await db.withTransaction(async (tx) => {
    seen += 1;
    await tx.query("SELECT 1 as ok");
    await tx.withTransaction(async (inner) => {
      seen += 1;
      await inner.query("SELECT 1 as ok");
    });
  });
  assert.equal(seen, 2);
});

test("G22-double: debitRegenerate is idempotent on the same ref", async () => {
  const user = await signup("Debit", "debit-g22@example.com");
  const opened = await startChat(ctx, { userId: user.id, initialMessage: "honey" });
  const before = (await store.getUser(db, user.id))!.creditBalance;
  const ref = `regen:test-${user.id}:v1`;

  const first = await debitRegenerate(db, {
    userId: user.id,
    videoId: opened.videoId,
    amount: 5,
    ref,
  });
  assert.equal(first, before - 5);

  const second = await debitRegenerate(db, {
    userId: user.id,
    videoId: opened.videoId,
    amount: 5,
    ref,
  });
  // Second call must not debit again.
  assert.equal(second, before - 5);
  const after = (await store.getUser(db, user.id))!.creditBalance;
  assert.equal(after, before - 5);

  const ledger = await db.query("SELECT count(*)::int AS n FROM credit_ledger WHERE ref = $1", [ref]);
  assert.equal(Number(ledger.rows[0]?.n), 1);
});

test("G22-twice: parallel stage transitions only advance once", async () => {
  const user = await signup("Race", "race-g22@example.com");
  const opened = await startChat(ctx, { userId: user.id, initialMessage: "race kids" });
  await finishBrief(opened.chatId);
  // Force stage to script with all cast approved so we can CAS script→prompts twice.
  const castArts = await store.listArtefacts(db, opened.videoId);
  for (const art of castArts) {
    if (art.state === "awaiting_approval") {
      await store.updateArtefact(db, art.id, { state: "approved" });
    }
  }
  const movedA = await store.tryTransitionStage(db, opened.videoId, "cast", "script");
  assert.equal(movedA, true);
  const [b, c] = await Promise.all([
    store.tryTransitionStage(db, opened.videoId, "script", "prompts"),
    store.tryTransitionStage(db, opened.videoId, "script", "prompts"),
  ]);
  assert.equal(
    [b, c].filter(Boolean).length,
    1,
    "exactly one CAS winner",
  );
  const video = (await store.getVideoRow(db, opened.videoId))!;
  assert.equal(video.stage, "prompts");
});

test("G22-stuck: early failure marks artefact failed; regenerate recovers", async () => {
  const user = await signup("Fail", "fail-g22@example.com");
  const opened = await startChat(ctx, { userId: user.id, initialMessage: "fail kids" });
  await finishBrief(opened.chatId);
  // Move to script without running beginScript, then mark failed.
  const castArts = await store.listArtefacts(db, opened.videoId);
  for (const art of castArts) {
    if (art.state === "awaiting_approval") {
      await store.updateArtefact(db, art.id, { state: "approved" });
    }
  }
  assert.equal(await store.tryTransitionStage(db, opened.videoId, "cast", "script"), true);
  await __testMarkStageFailed(ctx, opened.chatId, opened.videoId, "script", new Error("boom"));

  const failed = (await store.listArtefacts(db, opened.videoId)).find((a) => a.state === "failed");
  assert.ok(failed);
  assert.equal(failed.kind, "script");
  assert.equal(failed.payload.generationFailed, true);

  const recovered = await regenerateArtefact(ctx, {
    artefactId: failed.id,
    userId: user.id,
    confirm: true,
    feedback: "try again",
  });
  assert.ok("artefact" in recovered);
  assert.equal(recovered.artefact.state, "awaiting_approval");
});

test("G22-retry: final intake retry does not re-enter cast", async () => {
  const user = await signup("Retry", "retry-g22@example.com");
  const opened = await startChat(ctx, { userId: user.id, initialMessage: "retry kids" });
  await finishBrief(opened.chatId);
  const afterBrief = (await store.getVideoRow(db, opened.videoId))!;
  assert.equal(afterBrief.stage, "cast");
  const castCount = (await store.listArtefacts(db, opened.videoId)).filter(
    (a) => a.kind === "identity",
  ).length;

  // Duplicate "final" intake answer while already in cast.
  await handleAnswer(ctx, opened.chatId, { field: "cast_ids", useDefaults: true });
  const again = (await store.getVideoRow(db, opened.videoId))!;
  assert.equal(again.stage, "cast");
  const castCount2 = (await store.listArtefacts(db, opened.videoId)).filter(
    (a) => a.kind === "identity",
  ).length;
  assert.equal(castCount2, castCount, "cast artefacts must not duplicate");
});
