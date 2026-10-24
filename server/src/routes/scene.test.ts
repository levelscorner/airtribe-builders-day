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

test("regenerating one scene image rebuilds only that clip and leaves the other scene cached", async () => {
  const agent = request.agent(app);
  await agent.post("/v1/users").send({ displayName: "Ravi" }).expect(201);
  const opened = await agent.post("/v1/chats").send({ title: "monsoon" }).expect(201);
  const videoId = opened.body.videoId as string;
  const scenes = await store.replaceScenes(db, videoId, [
    { idx: 0, title: "a", narration: "Wind from the sea.", durationMs: 5000, doubts: [], castIds: [] },
    { idx: 1, title: "b", narration: "Rain on the coast.", durationMs: 10000, doubts: [], castIds: [] },
  ]);
  const sceneA = scenes[0]!.id;
  const sceneB = scenes[1]!.id;
  const row = async (sceneId: string, kind: string, payload: Record<string, unknown>) =>
    store.insertArtefact(db, {
      videoId,
      sceneId,
      kind: kind as "image",
      state: "approved",
      creditCost: kind === "clip" ? 40 : kind === "voice" ? 5 : 8,
      payload,
    });
  await row(sceneA, "image", { url: "/mock/a.png", provider: "mock", model: "mock", providerLabel: "Mock" });
  const clipA = await row(sceneA, "clip", { url: "/mock/a.mp4", provider: "mock", model: "seedance", providerLabel: "Seedance 2.5 · BytePlus" });
  const voiceA = await row(sceneA, "voice", {
    url: "/mock/a.mp3",
    voiceId: "FZkK3TvQ0pjyDmT8fzIW",
    narration: "Wind from the sea.",
    provider: "elevenlabs",
    model: "eleven_multilingual_v2",
    providerLabel: "ElevenLabs",
  });
  const imageB = await row(sceneB, "image", { url: "/mock/b.png", provider: "mock", model: "mock", providerLabel: "Mock" });
  const clipB = await row(sceneB, "clip", { url: "/mock/b.mp4", provider: "mock", model: "seedance", providerLabel: "Seedance 2.5 · BytePlus" });
  const voiceB = await row(sceneB, "voice", {
    url: "/mock/b.mp3",
    voiceId: "RABOvaPec1ymXz02oDQi",
    narration: "Rain on the coast.",
    provider: "elevenlabs",
    model: "eleven_multilingual_v2",
    providerLabel: "ElevenLabs",
  });
  await store.insertArtefact(db, {
    videoId,
    kind: "final",
    state: "awaiting_approval",
    creditCost: 5,
    payload: { url: `mock://videos/${videoId}.mp4`, downloadUrl: `/v1/videos/${videoId}/download` },
  });

  const regenerated = await agent
    .post(`/v1/videos/${videoId}/regenerate`)
    .send({ sceneId: sceneA, target: "image", feedback: "darker clouds" })
    .expect(200);
  assert.equal(regenerated.body.artefact.kind, "image");
  assert.equal(regenerated.body.artefact.sceneId, sceneA);
  assert.equal(regenerated.body.artefact.provider, "mock");

  const after = await agent.get(`/v1/videos/${videoId}`).expect(200);
  const items = after.body.artefacts as Array<{ id: string; sceneId?: string; kind: string; version: number; payload: Record<string, unknown> }>;
  const clip = items.find((item) => item.id === clipA.id);
  assert.equal(clip?.version, clipA.version + 1);
  assert.equal(clip?.payload.regeneratedFrom, "image");
  assert.equal(clip?.payload.provider, "mock");
  assert.ok(clip?.payload.providerLabel);
  assert.equal(items.find((item) => item.id === voiceA.id)?.version, voiceA.version);
  assert.equal(items.find((item) => item.id === imageB.id)?.version, imageB.version);
  assert.equal(items.find((item) => item.id === clipB.id)?.version, clipB.version);
  assert.equal(items.find((item) => item.id === voiceB.id)?.version, voiceB.version);
  assert.equal(items.find((item) => item.kind === "final")?.payload.reconcat, true);
});
