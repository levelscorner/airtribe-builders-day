/**
 * MOCK=1 kids path: signup → brief defaults → cast→…→final approve-all → done.
 * Also asserts per-browser session isolation between two agents.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";
import { resetDbForTests } from "../db/client.js";
import { startServer } from "../deploy/start.js";

process.env.MOCK = "1";
delete process.env.DATABASE_URL;

let app: Awaited<ReturnType<typeof startServer>>["app"];
let close: (() => Promise<void>) | undefined;

before(async () => {
  await resetDbForTests();
  const started = await startServer({ listen: false });
  app = started.app;
  close = async () => {
    await started.db.close();
    await resetDbForTests();
  };
});

after(async () => {
  if (close) await close();
});

async function pump(ms = 10): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

test("two browsers cannot see each other's profile or chats", async () => {
  const asha = request.agent(app);
  const ravi = request.agent(app);

  const ashaUser = await asha
    .post("/v1/users")
    .send({ displayName: "Asha", phoneOrEmail: "asha-iso@example.com" })
    .expect(201);
  const raviUser = await ravi
    .post("/v1/users")
    .send({ displayName: "Ravi", phoneOrEmail: "ravi-iso@example.com" })
    .expect(201);
  assert.notEqual(ashaUser.body.id, raviUser.body.id);

  const ashaMe = await asha.get("/v1/me").expect(200);
  const raviMe = await ravi.get("/v1/me").expect(200);
  assert.equal(ashaMe.body.displayName, "Asha");
  assert.equal(raviMe.body.displayName, "Ravi");
  assert.notEqual(ashaMe.body.id, raviMe.body.id);

  const ashaChat = await asha
    .post("/v1/chats")
    .send({ initialMessage: "Asha private bees" })
    .expect(201);
  const raviChat = await ravi
    .post("/v1/chats")
    .send({ initialMessage: "Ravi private bees" })
    .expect(201);

  await asha.get(`/v1/chats/${ashaChat.body.chatId}`).expect(200);
  await ravi.get(`/v1/chats/${raviChat.body.chatId}`).expect(200);
  await asha.get(`/v1/chats/${raviChat.body.chatId}`).expect(404);
  await ravi.get(`/v1/chats/${ashaChat.body.chatId}`).expect(404);
  await asha.get(`/v1/videos/${raviChat.body.videoId}`).expect(404);
  await ravi.get(`/v1/videos/${ashaChat.body.videoId}`).expect(404);
});

test("MOCK=1 kids video reaches done via chat HITL", async () => {
  const agent = request.agent(app);
  const signup = await agent
    .post("/v1/users")
    .send({ displayName: "Asha", phoneOrEmail: "asha@example.com" })
    .expect(201);
  assert.ok(signup.body.creditBalance >= 80);

  const opened = await agent
    .post("/v1/chats")
    .send({ initialMessage: "Why do bees make honey for kids" })
    .expect(201);
  assert.equal(opened.body.stage, "brief");
  const chatId = opened.body.chatId as string;
  const videoId = opened.body.videoId as string;

  const chat = await agent.get(`/v1/chats/${chatId}`).expect(200);
  assert.equal(chat.body.videoId, videoId);
  assert.ok(chat.body.messages.some((m: { kind: string }) => m.kind === "question"));

  for (let step = 0; step < 12; step += 1) {
    await pump();
    const snap = await agent.get(`/v1/videos/${videoId}`).expect(200);
    if (snap.body.video.stage !== "brief") break;
    const history = await agent.get(`/v1/chats/${chatId}/messages`).expect(200);
    const question = [...history.body.messages]
      .reverse()
      .find((m: { kind: string }) => m.kind === "question");
    assert.ok(question, "expected an open question");
    await agent
      .post(`/v1/chats/${chatId}/messages`)
      .send({ answer: { field: (question as { field: string }).field, useDefaults: true } })
      .expect(200);
  }

  let didRejectRegen = false;
  let safety = 0;
  while (safety < 40) {
    safety += 1;
    await pump(20);
    const snap = await agent.get(`/v1/videos/${videoId}`).expect(200);
    const stage = snap.body.video.stage as string;
    if (stage === "done") break;
    assert.notEqual(stage, "brief", "brief should be finished");
    const awaiting = (snap.body.artefacts as Array<{ id: string; state: string }>).filter(
      (a) => a.state === "awaiting_approval",
    );
    if (awaiting.length === 0) {
      continue;
    }
    if (stage === "cast" && !didRejectRegen) {
      const target = awaiting[0]!;
      const rejected = await agent
        .post(`/v1/artefacts/${target.id}/reject`)
        .send({ rejectNote: "Sheet thoda bright karo" })
        .expect(200);
      assert.equal(rejected.body.artefact.state, "rejected");
      const preview = await agent
        .post(`/v1/artefacts/${target.id}/regenerate?confirm=0`)
        .send({})
        .expect(200);
      assert.equal(preview.body.canAfford, true);
      const confirmed = await agent
        .post(`/v1/artefacts/${target.id}/regenerate?confirm=1`)
        .send({ feedback: "brighter" })
        .expect(200);
      const charging = ["1", "true", "yes", "on"].includes(
        (process.env.CREDITS_ENABLED ?? "").trim().toLowerCase(),
      );
      assert.equal(confirmed.body.charged > 0, charging);
      assert.ok(confirmed.body.artefact);
      didRejectRegen = true;
    }
    await agent.post(`/v1/videos/${videoId}/approve-all-remaining`).expect(200);
  }

  assert.equal(didRejectRegen, true, "reject+regenerate must run once on cast");

  const done = await agent.get(`/v1/videos/${videoId}`).expect(200);
  assert.equal(done.body.video.stage, "done");
  assert.ok(done.body.video.outputUrl);
  assert.equal(done.body.video.genre, "kids");
  assert.ok((done.body.video.brief.castIds as string[]).length >= 1);

  const hydrated = await agent.get(`/v1/chats/${chatId}`).expect(200);
  assert.equal(hydrated.body.stage, "done");
  assert.ok(hydrated.body.messages.some((m: { kind: string }) => m.kind === "video"));
  assert.ok(hydrated.body.messages.some((m: { kind: string }) => m.kind === "approval"));
  assert.ok(hydrated.body.artefacts.every((a: { state: string }) => a.state === "approved"));
});
