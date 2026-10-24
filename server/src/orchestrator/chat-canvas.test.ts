import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  getDb,
  migrate,
  resetDbForTests,
  type SqlClient,
} from "../db/client.js";
import { grantSignupCredits } from "../credits/stub.js";
import {
  createOrchestratorContext,
  startChat,
  handleAnswer,
  approveArtefact,
  approveAllRemaining,
  regenerateArtefact,
  rejectArtefact,
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
async function user() {
  const u = await store.insertUser(db, { displayName: "Canvas creator" });
  await grantSignupCredits(db, {
    userId: u.id,
    amount: 80,
    ref: `signup:${u.id}`,
  });
  return u;
}
test("detailed web prompt goes directly to script; visuals wait for approval", async () => {
  const owner = await user();
  const chat = await startChat(ctx, {
    userId: owner.id,
    experience: "chat_canvas",
    initialMessage:
      "45 second English cartoon video about honey for kids in vertical format",
  });
  assert.equal(chat.stage, "script");
  let arts = await store.listArtefacts(db, chat.videoId);
  assert.deepEqual(
    arts.map((a) => a.kind),
    ["script"],
  );
  const messages = await store.listMessages(db, chat.chatId);
  assert.equal(
    messages.some((m) => m.kind === "question"),
    false,
  );
  const script = arts[0]!;
  const oldNarration = (script.payload.scenes as { narration: string }[])[0]!
    .narration;
  await rejectArtefact(ctx, {
    userId: owner.id,
    artefactId: script.id,
    rejectNote: "Make the opening simpler",
  });
  const quote = await regenerateArtefact(ctx, {
    userId: owner.id,
    artefactId: script.id,
    confirm: false,
  });
  assert.ok("canAfford" in quote && quote.canAfford);
  await regenerateArtefact(ctx, {
    userId: owner.id,
    artefactId: script.id,
    confirm: true,
    feedback: "Make the opening simpler",
  });
  const revised = (await store.getArtefact(db, script.id))!;
  assert.equal(revised.version, 2);
  assert.notEqual(
    (revised.payload.scenes as { narration: string }[])[0]!.narration,
    oldNarration,
  );
  assert.doesNotMatch(
    (revised.payload.scenes as { narration: string }[])[0]!.narration,
    /Make the opening simpler/,
  );
  assert.equal((await store.getVideoRow(db, chat.videoId))!.stage, "script");
  assert.equal((await store.listArtefacts(db, chat.videoId)).length, 1);
  await approveArtefact(ctx, { userId: owner.id, artefactId: script.id });
  arts = await store.listArtefacts(db, chat.videoId);
  assert.equal((await store.getVideoRow(db, chat.videoId))!.stage, "cast");
  assert.ok(arts.some((a) => a.kind === "identity"));
  assert.equal(arts.filter((a) => a.kind === "image").length, 5);
  assert.equal(
    arts.some((a) => a.kind === "clip"),
    false,
  );
  assert.ok(
    arts
      .filter((a) => a.kind === "image")
      .every((a) => a.state === "awaiting_approval"),
  );
  // Approving one frame must not release the whole visual gate.
  await approveArtefact(ctx, {
    userId: owner.id,
    artefactId: arts.find((a) => a.kind === "image")!.id,
  });
  assert.equal((await store.getVideoRow(db, chat.videoId))!.stage, "cast");
  await approveAllRemaining(ctx, { userId: owner.id, videoId: chat.videoId });
  assert.equal((await store.getVideoRow(db, chat.videoId))!.stage, "clips");
});
test("vague intake persists answers across orchestrator recreation and defaults respect choices", async () => {
  const owner = await user();
  const chat = await startChat(ctx, {
    userId: owner.id,
    experience: "chat_canvas",
    initialMessage: "bees",
  });
  assert.equal(chat.stage, "brief");
  await handleAnswer(ctx, chat.chatId, { field: "genre", optionId: "kids" });
  await handleAnswer(ctx, chat.chatId, {
    field: "aspect_ratio",
    optionId: "16:9",
  });
  const resumed = createOrchestratorContext(db, true);
  await handleAnswer(resumed, chat.chatId, {
    field: "__defaults",
    useDefaults: true,
  });
  const video = (await store.getVideoRow(db, chat.videoId))!;
  assert.equal(video.stage, "script");
  assert.equal(video.aspectRatio, "16:9");
  assert.equal(video.targetSeconds, 45);
  assert.equal(video.language, "en");
  assert.equal(video.brief.experience, "chat_canvas");
});

test("a stale script action cannot change the already approved web review", async () => {
  const owner = await user();
  const chat = await startChat(ctx, {
    userId: owner.id,
    experience: "chat_canvas",
    initialMessage:
      "45 second English cartoon video about honey for kids in vertical format",
  });
  const script = (await store.listArtefacts(db, chat.videoId))[0]!;
  await approveArtefact(ctx, { userId: owner.id, artefactId: script.id });
  await assert.rejects(
    () =>
      rejectArtefact(ctx, {
        userId: owner.id,
        artefactId: script.id,
        rejectNote: "old tab",
      }),
    /already complete/,
  );
  await assert.rejects(
    () =>
      regenerateArtefact(ctx, {
        userId: owner.id,
        artefactId: script.id,
        confirm: true,
      }),
    /already complete/,
  );
  assert.equal((await store.getArtefact(db, script.id))!.state, "approved");
  assert.equal((await store.getVideoRow(db, chat.videoId))!.stage, "cast");
});

test('one complete configuration summary is persisted before the script', async () => {
  const owner = await user();
  const chat = await startChat(ctx, { userId: owner.id, experience: 'chat_canvas', initialMessage: 'bees' });
  await handleAnswer(ctx, chat.chatId, { field: 'genre', optionId: 'kids' });
  await handleAnswer(ctx, chat.chatId, { field: 'aspect_ratio', optionId: '1:1' });
  await handleAnswer(ctx, chat.chatId, { field: '__defaults', useDefaults: true });
  const messages = await store.listMessages(db, chat.chatId);
  const summaries = messages.filter(m => m.kind === 'text' && m.role === 'assistant' && m.text.startsWith('Your video is set:'));
  assert.equal(summaries.length, 1);
  const summary = summaries[0]!;
  assert.ok(summary.kind === 'text');
  for (const setting of ['45 seconds', '1:1 (square)', 'English', 'Bright 2D cartoon', '1080p', 'Chintu, Mini']) assert.ok(summary.text.includes(setting), setting);
  assert.ok(messages.indexOf(summary) < messages.findIndex(m => m.kind === 'approval' && m.artefactKind === 'script'));
});
