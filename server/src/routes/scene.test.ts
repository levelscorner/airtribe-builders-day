import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";
import { resetDbForTests } from "../db/client.js";
import { startServer } from "../deploy/start.js";
import * as store from "../orchestrator/store.js";

process.env.MOCK = "1";
delete process.env.DATABASE_URL;

let app: Awaited<ReturnType<typeof startServer>>["app"];
let db: Awaited<ReturnType<typeof startServer>>["db"];

before(async () => {
  await resetDbForTests();
  const started = await startServer({ listen: false });
  app = started.app;
  db = started.db;
});

after(async () => {
  await db.close();
  await resetDbForTests();
});

test("storyboard, scene regenerate, and final download use the shared contract", async () => {
  const agent = request.agent(app);
  await agent.post("/v1/users").send({ displayName: "Asha" }).expect(201);
  const opened = await agent.post("/v1/chats").send({ title: "bees" }).expect(201);
  const videoId = opened.body.videoId as string;
  const scenes = await store.replaceScenes(db, videoId, [
    {
      idx: 0,
      title: "hook",
      narration: "Bees visit flowers and carry sweet nectar home.",
      durationMs: 5000,
      doubts: [],
      castIds: ["preset_chintu"],
    },
  ]);
  const sceneId = scenes[0]!.id;
  await store.insertArtefact(db, {
    videoId,
    kind: "script",
    state: "approved",
    creditCost: 3,
    payload: { sceneIds: [sceneId] },
  });
  await store.insertArtefact(db, {
    videoId,
    sceneId,
    kind: "prompt",
    state: "approved",
    creditCost: 1,
    payload: {
      imagePrompt: "rooftop at dusk",
      videoPrompt: "gentle pan",
    },
  });
  await store.insertArtefact(db, {
    videoId,
    sceneId,
    kind: "image",
    state: "approved",
    creditCost: 8,
    payload: { url: "/mock/keyframe.png", provider: "mock", model: "mock", providerLabel: "Mock" },
  });
  await store.insertArtefact(db, {
    videoId,
    sceneId,
    kind: "voice",
    state: "approved",
    creditCost: 5,
    payload: {
      url: "/mock/line.mp3",
      voiceId: "FZkK3TvQ0pjyDmT8fzIW",
      narration: "Bees visit flowers and carry sweet nectar home.",
      provider: "elevenlabs",
      model: "eleven_multilingual_v2",
      providerLabel: "ElevenLabs",
    },
  });
  const final = await store.insertArtefact(db, {
    videoId,
    kind: "final",
    state: "awaiting_approval",
    creditCost: 5,
    payload: {
      url: `mock://videos/${videoId}.mp4`,
      downloadUrl: `/v1/videos/${videoId}/download`,
    },
  });

  const video = await agent.get(`/v1/videos/${videoId}`).expect(200);
  const row = video.body.scenePlan.scenes[0];
  assert.equal(row.imagePrompt, "rooftop at dusk");
  assert.equal(row.motionPrompt, "gentle pan");
  assert.equal(row.durationSec, 5);
  assert.equal(row.vo, "Bees visit flowers and carry sweet nectar home.");
  assert.equal(row.voiceId, "FZkK3TvQ0pjyDmT8fzIW");
  const finalRow = video.body.artefacts.find((item: { id: string }) => item.id === final.id);
  assert.equal(finalRow.kind, "final");
  assert.equal(finalRow.url, `mock://videos/${videoId}.mp4`);
  assert.equal(finalRow.downloadUrl, `/v1/videos/${videoId}/download`);
  const voice = video.body.artefacts.find((item: { kind: string }) => item.kind === "voice");
  assert.equal(voice.sceneId, sceneId);
  assert.equal(voice.provider, "elevenlabs");
  assert.equal(voice.model, "eleven_multilingual_v2");
  assert.equal(voice.providerLabel, "ElevenLabs");

  const regenerated = await agent
    .post(`/v1/videos/${videoId}/regenerate`)
    .send({ sceneId, target: "image", feedback: "brighter sky" })
    .expect(200);
  assert.equal(regenerated.body.artefact.kind, "image");
  assert.equal(regenerated.body.artefact.sceneId, sceneId);
  assert.equal(regenerated.body.artefact.provider, "mock");
  assert.match(String(regenerated.body.artefact.payload.feedback), /brighter sky/);

  const download = await agent.get(`/v1/videos/${videoId}/download`).expect(200);
  assert.match(String(download.headers["content-disposition"]), /attachment/);
  assert.match(String(download.headers["content-disposition"]), new RegExp(videoId));
});
