/**
 * Script stage attaches the AgenticOrg review and does not block on agent failure.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import type { AgentReview } from "@chotu/shared";
import { getDb, migrate, resetDbForTests, type SqlClient } from "../db/client.js";
import {
  approveAllRemaining,
  createOrchestratorContext,
  handleAnswer,
  startChat,
  type OrchestratorContext,
} from "./machine.js";
import * as store from "./store.js";

process.env.MOCK = "1";
delete process.env.DATABASE_URL;

let db: SqlClient;

before(async () => {
  await resetDbForTests();
  db = await getDb();
  await migrate(db);
});

after(async () => {
  await resetDbForTests();
});

async function openScript(ctx: OrchestratorContext): Promise<{ chatId: string; videoId: string }> {
  const user = await store.insertUser(db, {
    displayName: "Reviewer",
    phoneOrEmail: `review-${randomUUID()}@example.com`,
  });
  const opened = await startChat(ctx, { userId: user.id, initialMessage: "bees for kids" });
  for (let i = 0; i < 12; i += 1) {
    const video = (await store.getVideoRow(db, opened.videoId))!;
    if (video.stage !== "brief") break;
    const messages = await store.listMessages(db, opened.chatId);
    const question = [...messages].reverse().find((item) => item.kind === "question");
    assert.ok(question && question.kind === "question");
    await handleAnswer(ctx, opened.chatId, { field: question.field, useDefaults: true });
  }
  const cast = (await store.getVideoRow(db, opened.videoId))!;
  assert.equal(cast.stage, "cast");
  await approveAllRemaining(ctx, { videoId: opened.videoId, userId: user.id });
  const script = (await store.getVideoRow(db, opened.videoId))!;
  assert.equal(script.stage, "script");
  return { chatId: opened.chatId, videoId: opened.videoId };
}

function scriptReview(videoId: string): Promise<AgentReview | undefined> {
  return store.listArtefacts(db, videoId).then((items) => items.find((item) => item.kind === "script")?.agentReview);
}

test("script stage agent review", { concurrency: false }, async (t) => {
  await t.test("mocked review is attached and the script still waits", async () => {
    const ctx = createOrchestratorContext(db, true);
    const opened = await openScript(ctx);
    const artefacts = await store.listArtefacts(db, opened.videoId);
    const script = artefacts.find((item) => item.kind === "script");
    assert.ok(script);
    assert.equal(script.state, "awaiting_approval");
    assert.equal(script.agentReview?.status, "mocked");
    assert.equal(script.agentReview?.confidence, 1);
    const stored = script.payload.agentReview as AgentReview;
    assert.equal(stored.status, "mocked");
    assert.deepEqual(stored, script.agentReview);
  });

  await t.test("hitl_triggered keeps the script step awaiting approval", async () => {
    const ctx = createOrchestratorContext(db, true);
    let genre = "";
    let scriptText = "";
    ctx.reviewScript = async (input) => {
      genre = input.genre;
      scriptText = input.scriptText;
      return { status: "hitl_triggered", confidence: 0.33, output: "Check the claim." };
    };
    const opened = await openScript(ctx);
    const video = (await store.getVideoRow(db, opened.videoId))!;
    assert.equal(video.stage, "script");
    assert.equal(video.status, "active");
    const review = await scriptReview(opened.videoId);
    assert.equal(review?.status, "hitl_triggered");
    assert.equal(review?.confidence, 0.33);
    assert.equal(review?.output, "Check the claim.");
    assert.equal(review?.warning, undefined);
    assert.equal(genre, "kids");
    assert.match(scriptText, /hook/);
    const messages = await store.listMessages(db, opened.chatId);
    const card = [...messages].reverse().find((item) => item.kind === "approval" && item.artefactKind === "script");
    assert.ok(card && card.kind === "approval");
    assert.equal(card.state, "awaiting_approval");
    assert.equal((card.preview.agentReview as AgentReview).status, "hitl_triggered");
  });

  await t.test("budget and transport failures warn and leave the pipeline on the script card", async () => {
    const budgetCtx = createOrchestratorContext(db, true);
    budgetCtx.reviewScript = async () => ({ status: "budget_exceeded", confidence: 0, output: "Stopped before scene 3." });
    const budget = await openScript(budgetCtx);
    const budgetVideo = (await store.getVideoRow(db, budget.videoId))!;
    assert.equal(budgetVideo.stage, "script");
    assert.equal(budgetVideo.status, "active");
    const budgetReview = await scriptReview(budget.videoId);
    assert.equal(budgetReview?.status, "budget_exceeded");
    assert.match(budgetReview?.warning ?? "", /budget/);
    const budgetMessages = await store.listMessages(db, budget.chatId);
    assert.ok(budgetMessages.some((item) => item.kind === "progress" && item.text === budgetReview?.warning));

    const secret = "super-secret-token";
    const failedCtx = createOrchestratorContext(db, true);
    failedCtx.reviewScript = async () => {
      throw new Error(`connect ECONNREFUSED Bearer ${secret}`);
    };
    const failed = await openScript(failedCtx);
    const failedVideo = (await store.getVideoRow(db, failed.videoId))!;
    assert.equal(failedVideo.stage, "script");
    assert.equal(failedVideo.status, "active");
    const failedReview = await scriptReview(failed.videoId);
    assert.equal(failedReview?.status, "failed");
    assert.equal(failedReview?.warning, "AgenticOrg review could not be reached");
    const dumped = JSON.stringify({
      review: failedReview,
      messages: await store.listMessages(db, failed.chatId),
      artefacts: await store.listArtefacts(db, failed.videoId),
    });
    assert.equal(dumped.includes(secret), false);
    assert.equal(dumped.toLowerCase().includes("bearer"), false);
  });
});
