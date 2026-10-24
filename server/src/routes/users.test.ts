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
const savedLogin = process.env.DEMO_EMAIL_LOGIN;
const savedAdmins = process.env.ADMIN_EMAILS;

before(async () => {
  delete process.env.DEMO_EMAIL_LOGIN;
  delete process.env.ADMIN_EMAILS;
  delete process.env.CREDITS_ENABLED;
  await resetDbForTests();
  const started = await startServer({ listen: false });
  app = started.app;
  db = started.db;
});

after(async () => {
  if (savedLogin === undefined) delete process.env.DEMO_EMAIL_LOGIN;
  else process.env.DEMO_EMAIL_LOGIN = savedLogin;
  if (savedAdmins === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = savedAdmins;
  await db.close();
  await resetDbForTests();
});

test("without DEMO_EMAIL_LOGIN an existing email stays 409 and does not sign in", async () => {
  delete process.env.DEMO_EMAIL_LOGIN;
  delete process.env.ADMIN_EMAILS;

  const created = await request(app)
    .post("/v1/users")
    .send({ displayName: "Asha", phoneOrEmail: "asha-closed@example.com" })
    .expect(201);
  assert.equal(created.body.displayName, "Asha");
  assert.equal(created.body.phoneOrEmail, "asha-closed@example.com");
  assert.match(created.body.createdAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(created.body.creditBalance, store.STARTER_CREDITS);
  assert.equal(created.body.creditsEnabled, false);
  const stored = await db.query<{ display_name: string; phone_or_email: string; created_at: Date | string }>(
    "SELECT display_name, phone_or_email, created_at FROM users WHERE id = $1",
    [created.body.id],
  );
  assert.equal(stored.rows[0]?.display_name, "Asha");
  assert.equal(stored.rows[0]?.phone_or_email, "asha-closed@example.com");
  assert.ok(stored.rows[0]?.created_at);

  const returning = request.agent(app);
  const blocked = await returning
    .post("/v1/users")
    .send({ displayName: "Someone else", phoneOrEmail: " asha-closed@example.com " })
    .expect(409);
  assert.equal(blocked.body.error, "This email is already used in the demo. Try a different email.");
  assert.equal(blocked.body.id, undefined);
  assert.equal(blocked.body.creditBalance, undefined);
  await returning.get("/v1/me").expect(401);

  const still = await store.getUser(db, created.body.id);
  assert.equal(still?.creditBalance, store.STARTER_CREDITS);
  assert.equal(await store.findUserByContact(db, "missing@example.com"), null);
});

test("DEMO_EMAIL_LOGIN=1 signs in an existing email and still refuses admin emails", async () => {
  process.env.DEMO_EMAIL_LOGIN = "1";
  process.env.ADMIN_EMAILS = "booth-admin@example.com, other-admin@example.com";

  const created = await request(app)
    .post("/v1/users")
    .send({ displayName: "Asha", phoneOrEmail: "asha-return@example.com" })
    .expect(201);
  assert.equal(created.body.creditsEnabled, false);

  const returning = request.agent(app);
  const signedIn = await returning
    .post("/v1/users")
    .send({ displayName: "Someone else", phoneOrEmail: " asha-return@example.com " })
    .expect(200);
  assert.equal(signedIn.body.id, created.body.id);
  assert.equal(signedIn.body.displayName, "Asha");
  assert.equal(signedIn.body.phoneOrEmail, "asha-return@example.com");
  assert.equal(signedIn.body.creditBalance, store.STARTER_CREDITS);
  assert.equal(signedIn.body.creditsEnabled, false);
  const me = await returning.get("/v1/me").expect(200);
  assert.equal(me.body.id, created.body.id);
  assert.equal(me.body.creditsEnabled, false);
  assert.match(me.body.lastActiveAt, /^\d{4}-\d{2}-\d{2}T/);

  const admin = await request(app)
    .post("/v1/users")
    .send({ displayName: "Booth", phoneOrEmail: "booth-admin@example.com" })
    .expect(201);
  const takeover = request.agent(app);
  const blocked = await takeover
    .post("/v1/users")
    .send({ displayName: "Stranger", phoneOrEmail: " booth-admin@example.com " })
    .expect(409);
  assert.equal(blocked.body.error, "This email is already used in the demo. Try a different email.");
  assert.equal(blocked.body.id, undefined);
  await takeover.get("/v1/me").expect(401);
  const adminRow = await store.getUser(db, admin.body.id);
  assert.ok(adminRow);
  assert.equal(adminRow.creditBalance, store.STARTER_CREDITS);
  assert.notEqual(adminRow.id, created.body.id);
});

test("GET /v1/me/videos lists only the signed-in user's videos", async () => {
  const asha = request.agent(app);
  const created = await asha
    .post("/v1/users")
    .send({ displayName: "Asha Films", phoneOrEmail: "asha-films@example.com" })
    .expect(201);
  assert.equal(created.body.displayName, "Asha Films");
  assert.equal(created.body.phoneOrEmail, "asha-films@example.com");
  const chat = await asha.post("/v1/chats").send({ title: "Bees" }).expect(201);

  const ravi = request.agent(app);
  await ravi.post("/v1/users").send({ displayName: "Ravi", phoneOrEmail: "ravi-secret@example.com" }).expect(201);
  const other = await ravi.post("/v1/chats").send({ title: "Secret film" }).expect(201);

  const mine = await asha.get("/v1/me/videos").expect(200);
  const videos = mine.body.videos as Array<{ id: string; title?: string; status: string; phoneOrEmail?: string }>;
  assert.ok(videos.some((video) => video.id === chat.body.videoId && video.status === "active" && video.title === "Bees"));
  assert.equal(videos.some((video) => video.id === other.body.videoId), false);
  assert.equal(JSON.stringify(mine.body).includes("ravi-secret@example.com"), false);
  assert.equal(JSON.stringify(mine.body).includes("Secret film"), false);
  assert.equal(videos.every((video) => video.phoneOrEmail === undefined), true);

  const anon = await request(app).get("/v1/me/videos");
  assert.equal(anon.status, 401);
});
