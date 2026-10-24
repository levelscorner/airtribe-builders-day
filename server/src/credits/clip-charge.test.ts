import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { artefactCreditCost, grantSignupCredits } from "./stub.js";
import { getDb, migrate, resetDbForTests, type SqlClient } from "../db/client.js";
import { createOrchestratorContext, regenerateScene } from "../orchestrator/machine.js";
import * as store from "../orchestrator/store.js";

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

describe("clip failure billing", { concurrency: 1 }, () => {
test("a failed clip is free and a later success is charged once", async () => {
  const saved = {
    CLIP_MOCK: process.env.CLIP_MOCK,
    IMAGE_PROVIDER: process.env.IMAGE_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ARK_API_KEY: process.env.ARK_API_KEY,
    OPENAI_API_BASE: process.env.OPENAI_API_BASE,
    CREDITS_ENABLED: process.env.CREDITS_ENABLED,
  };
  const user = await store.insertUser(db, { displayName: "Clip", phoneOrEmail: "clip-charge@example.com" });
  await grantSignupCredits(db, {
    userId: user.id,
    amount: store.STARTER_CREDITS,
    ref: `signup:${user.id}`,
  });
  const opened = await store.createChatVideo(db, { userId: user.id, title: "bees" });
  const scenes = await store.replaceScenes(db, opened.videoId, [
    {
      idx: 0,
      title: "hook",
      narration: "Bees visit flowers.",
      durationMs: 5000,
      doubts: [],
      castIds: [],
    },
  ]);
  const sceneId = scenes[0]!.id;
  await store.insertArtefact(db, {
    videoId: opened.videoId,
    sceneId,
    kind: "image",
    state: "approved",
    creditCost: artefactCreditCost("image"),
    payload: { url: "/mock/keyframe.png", provider: "openai" },
  });
  const clip = await store.insertArtefact(db, {
    videoId: opened.videoId,
    sceneId,
    kind: "clip",
    state: "failed",
    creditCost: 40,
    payload: { error: "seedance down", provider: "mock" },
  });

  try {
    process.env.CREDITS_ENABLED = "1";
    delete process.env.OPENAI_API_KEY;
    // A missing ARK key stays on the mock clip port and succeeds. A set key
    // with a non-http still fails in seedanceFirstFrame before any network call.
    process.env.ARK_API_KEY = "ark-test-key";
    process.env.CLIP_MOCK = "0";
    delete process.env.IMAGE_PROVIDER;
    const live = createOrchestratorContext(db, false);
    const failed = await regenerateScene(live, {
      videoId: opened.videoId,
      userId: user.id,
      sceneId,
      target: "clip",
    });
    assert.equal(failed.state, "failed");
    assert.equal(failed.creditCost, 0);
    assert.equal(failed.payload.provider, "ark");
    const afterFail = (await store.getUser(db, user.id))!.creditBalance;
    assert.equal(afterFail, store.STARTER_CREDITS);
    const ledger = await db.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM credit_ledger WHERE user_id = $1 AND reason = 'regenerate'",
      [user.id],
    );
    assert.equal(Number(ledger.rows[0]?.n), 0);

    delete process.env.CLIP_MOCK;
    const mocked = createOrchestratorContext(db, true);
    const succeeded = await regenerateScene(mocked, {
      videoId: opened.videoId,
      userId: user.id,
      sceneId,
      target: "clip",
    });
    assert.equal(succeeded.state, "awaiting_approval");
    assert.equal(succeeded.creditCost, artefactCreditCost("clip"));
    const afterOk = (await store.getUser(db, user.id))!.creditBalance;
    assert.equal(afterOk, store.STARTER_CREDITS - artefactCreditCost("clip"));
    assert.notEqual(succeeded.id, "");
    assert.equal(clip.kind, "clip");
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("a failed image retry is labelled with the provider that was called", async () => {
  const saved = {
    IMAGE_PROVIDER: process.env.IMAGE_PROVIDER,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    ARK_API_KEY: process.env.ARK_API_KEY,
    OPENAI_API_BASE: process.env.OPENAI_API_BASE,
  };
  const user = await store.insertUser(db, { displayName: "Image", phoneOrEmail: "image-label@example.com" });
  await grantSignupCredits(db, {
    userId: user.id,
    amount: store.STARTER_CREDITS,
    ref: `signup:${user.id}`,
  });
  const opened = await store.createChatVideo(db, { userId: user.id, title: "bees" });
  const scenes = await store.replaceScenes(db, opened.videoId, [
    {
      idx: 0,
      title: "hook",
      narration: "Bees visit flowers.",
      durationMs: 5000,
      doubts: [],
      castIds: [],
    },
  ]);
  const sceneId = scenes[0]!.id;
  await store.insertArtefact(db, {
    videoId: opened.videoId,
    sceneId,
    kind: "prompt",
    state: "approved",
    creditCost: 1,
    payload: { imagePrompt: "a bright rooftop" },
  });
  await store.insertArtefact(db, {
    videoId: opened.videoId,
    sceneId,
    kind: "image",
    state: "failed",
    creditCost: 8,
    payload: { provider: "mock", error: "old" },
  });
  try {
    // A missing OpenAI key stays on the mock image port. Point the live call
    // at a closed port so the failure is local and the row is labelled openai.
    process.env.OPENAI_API_KEY = "sk-test-openai";
    process.env.OPENAI_API_BASE = "http://127.0.0.1:9";
    delete process.env.ARK_API_KEY;
    delete process.env.IMAGE_PROVIDER;
    const live = createOrchestratorContext(db, false);
    const failed = await regenerateScene(live, {
      videoId: opened.videoId,
      userId: user.id,
      sceneId,
      target: "image",
    });
    assert.equal(failed.state, "failed");
    assert.equal(failed.payload.provider, "openai");
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
});
