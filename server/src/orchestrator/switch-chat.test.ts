/**
 * Generation must not depend on the client connection: switching chats
 * (SSE closes, the page stops waiting) must never stop a running stage.
 * Failed scene/stage artefacts must be retryable instead of "bad_state".
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { grantSignupCredits } from "../credits/stub.js";
import { getDb, migrate, resetDbForTests, type SqlClient } from "../db/client.js";
import { timeoutMs } from "../media/ark/client.js";
import { chatBus } from "./bus.js";
import {
  __testEnterStageFrom,
  __testMarkStageFailed,
  approveArtefact,
  createOrchestratorContext,
  handleAnswer,
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
  ctx.detachStageWork = true;
});
after(async () => {
  await resetDbForTests();
});

async function signup(email: string) {
  const user = await store.insertUser(db, { displayName: "S", phoneOrEmail: email });
  await grantSignupCredits(db, { userId: user.id, amount: store.STARTER_CREDITS, ref: `signup:${user.id}` });
  return user;
}

async function finishBrief(chatId: string) {
  for (let i = 0; i < 12; i += 1) {
    const videoId = (await store.getChatMeta(db, chatId))!.videoId;
    if ((await store.getVideoRow(db, videoId))!.stage !== "brief") return;
    const question = [...(await store.listMessages(db, chatId))].reverse().find((m) => m.kind === "question");
    assert.ok(question && question.kind === "question");
    await handleAnswer(ctx, chatId, { field: question.field, useDefaults: true });
  }
}

async function settle(videoId: string) {
  for (let i = 0; i < 20 && ctx.inflight?.get(videoId); i += 1) await ctx.inflight.get(videoId);
}

test("stage work keeps running after the client unsubscribes (chat switch)", async () => {
  const user = await signup("switch@example.com");
  const opened = await startChat(ctx, { userId: user.id, initialMessage: "bees for kids" });
  await finishBrief(opened.chatId);
  await settle(opened.videoId);
  for (const art of await store.listArtefacts(db, opened.videoId)) {
    if (art.state === "awaiting_approval") await store.updateArtefact(db, art.id, { state: "approved" });
  }
  const from = (await store.getVideoRow(db, opened.videoId))!.stage;

  // The client is watching, then switches chat: its SSE subscription closes.
  const unsubscribe = chatBus.subscribe(opened.chatId, () => {});
  const before = (await store.listArtefacts(db, opened.videoId)).length;
  const moved = await __testEnterStageFrom(ctx, opened.chatId, opened.videoId, from, "script");
  unsubscribe();
  assert.equal(moved, true);
  assert.ok(ctx.inflight?.has(opened.videoId), "work runs detached from the caller");

  await settle(opened.videoId);
  const afterArts = await store.listArtefacts(db, opened.videoId);
  assert.ok(afterArts.length > before, "script work finished with nobody subscribed");
  // Returning to the chat: GET state shows the progress made while away.
  assert.equal((await store.getVideoRow(db, opened.videoId))!.stage, "script");
});

test("approving a failed artefact retries it instead of bad_state", async () => {
  const user = await signup("failed@example.com");
  const opened = await startChat(ctx, { userId: user.id, initialMessage: "fail kids" });
  await finishBrief(opened.chatId);
  await settle(opened.videoId);
  for (const art of await store.listArtefacts(db, opened.videoId)) {
    if (art.state === "awaiting_approval") await store.updateArtefact(db, art.id, { state: "approved" });
  }
  const from = (await store.getVideoRow(db, opened.videoId))!.stage;
  assert.equal(await store.tryTransitionStage(db, opened.videoId, from, "script"), true);
  await __testMarkStageFailed(ctx, opened.chatId, opened.videoId, "script", new Error("ark poll timed out"));
  const failed = (await store.listArtefacts(db, opened.videoId)).find((a) => a.state === "failed");
  assert.ok(failed);
  const retried = await approveArtefact(ctx, { artefactId: failed.id, userId: user.id });
  assert.notEqual(retried.state, "failed");
});

test("ARK poll timeout is at least 10 minutes", () => {
  assert.equal(timeoutMs({}), 600_000);
  assert.equal(timeoutMs({ ARK_POLL_TIMEOUT_MS: "120000" }), 600_000);
  assert.equal(timeoutMs({ ARK_POLL_TIMEOUT_MS: "900000" }), 900_000);
});
