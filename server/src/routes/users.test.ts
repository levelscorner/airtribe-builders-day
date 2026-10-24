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

test("a new email creates a profile and an existing email signs that user in", async () => {
  const created = await request
    .agent(app)
    .post("/v1/users")
    .send({ displayName: "Asha", phoneOrEmail: "asha-return@example.com" })
    .expect(201);
  assert.equal(created.body.displayName, "Asha");
  assert.equal(created.body.phoneOrEmail, "asha-return@example.com");
  assert.equal(created.body.creditBalance, store.STARTER_CREDITS);
  assert.equal(created.body.creditsEnabled, false);
  assert.equal(typeof created.body.id, "string");

  const first = request.agent(app);
  const createdAgain = await first
    .post("/v1/users")
    .send({ displayName: "Asha", phoneOrEmail: "asha-fresh@example.com" })
    .expect(201);
  const me = await first.get("/v1/me").expect(200);
  assert.equal(me.body.id, createdAgain.body.id);

  const returning = request.agent(app);
  const signedIn = await returning
    .post("/v1/users")
    .send({ displayName: "Someone else", phoneOrEmail: " asha-return@example.com " })
    .expect(200);
  assert.equal(signedIn.body.id, created.body.id);
  assert.equal(signedIn.body.displayName, "Asha");
  assert.equal(signedIn.body.phoneOrEmail, "asha-return@example.com");
  assert.equal(signedIn.body.creditBalance, store.STARTER_CREDITS);
  assert.deepEqual(Object.keys(signedIn.body).sort(), Object.keys(created.body).sort());

  const meAgain = await returning.get("/v1/me").expect(200);
  assert.equal(meAgain.body.id, created.body.id);
  assert.equal(meAgain.body.creditBalance, store.STARTER_CREDITS);

  const lookedUp = await store.findUserByContact(db, "asha-return@example.com");
  assert.equal(lookedUp?.id, created.body.id);
  assert.equal(await store.findUserByContact(db, "missing@example.com"), null);
});
