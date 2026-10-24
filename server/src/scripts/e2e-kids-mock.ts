/**
 * MOCK=1 kids path: signup → brief defaults → cast→…→final approve-all → done.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import request from "supertest";
import { resetDbForTests } from "../db/client.js";
import { startServer } from "../deploy/start.js";

process.env.MOCK = "1";
delete process.env.DATABASE_URL;

let agent: ReturnType<typeof request>;
let close: (() => Promise<void>) | undefined;

before(async () => {
  await resetDbForTests();
  const started = await startServer({ listen: false });
  agent = request(started.app);
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

test("MOCK=1 kids video reaches done via chat HITL", async () => {
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

  // Answer every brief question with defaults until cast stage.
  for (let step = 0; step < 12; step += 1) {
    await pump();
    const snap = await agent.get(`/v1/videos/${videoId}`).expect(200);
    if (snap.body.video.stage !== "brief") break;
    const history = await agent.get(`/v1/chats/${chatId}/messages`).expect(200);
    const question = [...history.body.messages].reverse().find((m: { kind: string }) => m.kind === "question");
    assert.ok(question, "expected an open question");
    await agent
      .post(`/v1/chats/${chatId}/messages`)
      .send({ answer: { field: question.field, useDefaults: true } })
      .expect(200);
  }

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
      // generation in flight
      continue;
    }
    // Once: reject + regenerate cost preview on first cast card.
    if (stage === "cast" && safety === 1) {
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
      assert.ok(confirmed.body.charged > 0);
      assert.ok(confirmed.body.artefact);
    }
    await agent.post(`/v1/videos/${videoId}/approve-all-remaining`).expect(200);
  }

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
