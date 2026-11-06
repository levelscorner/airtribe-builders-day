import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { getDb, migrate, resetDbForTests, type SqlClient } from "../db/client.js";
import { createOrchestratorContext, regenerateArtefact, startChat } from "../orchestrator/machine.js";
import * as store from "../orchestrator/store.js";
import { creditsEnabled } from "./flag.js";
import { debitRegenerate } from "./stub.js";

process.env.MOCK = "1";
delete process.env.DATABASE_URL;
delete process.env.CREDITS_ENABLED;

let db: SqlClient;

before(async () => {
  await resetDbForTests();
  db = await getDb();
  await migrate(db);
});

after(async () => {
  await resetDbForTests();
});

test("generation works with credits off and does not charge", async () => {
  assert.equal(creditsEnabled(), false);
  const owner = await store.insertUser(db, {
    displayName: "Zero",
    phoneOrEmail: "zero-credits@example.com",
  });
  assert.equal((await store.getUser(db, owner.id))!.creditBalance, 0);
  const ctx = createOrchestratorContext(db, true);
  const chat = await startChat(ctx, {
    userId: owner.id,
    experience: "chat_canvas",
    initialMessage:
      "45 second English cartoon video about honey for kids in vertical format, 1080p, with Chintu and Mini",
  });
  assert.equal(chat.stage, "script");
  const script = (await store.listArtefacts(db, chat.videoId)).find((item) => item.kind === "script");
  assert.ok(script);

  const quote = await regenerateArtefact(ctx, {
    userId: owner.id,
    artefactId: script.id,
    confirm: false,
  });
  assert.equal("canAfford" in quote && quote.canAfford, true);

  const revised = await regenerateArtefact(ctx, {
    userId: owner.id,
    artefactId: script.id,
    confirm: true,
    feedback: "Make the opening simpler",
  });
  assert.equal("charged" in revised, true);
  if (!("charged" in revised)) return;
  assert.equal(revised.charged, 0);
  assert.notEqual(revised.state, "failed");
  assert.equal(String(revised.artefact.payload.error ?? "").includes("Insufficient credits"), false);
  assert.equal((await store.getUser(db, owner.id))!.creditBalance, 0);

  const skipped = await debitRegenerate(db, {
    userId: owner.id,
    videoId: chat.videoId,
    amount: 50,
    ref: `off:${owner.id}`,
  });
  assert.equal(skipped, 0);
  const ledger = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM credit_ledger WHERE user_id = $1 AND reason = 'regenerate'",
    [owner.id],
  );
  assert.equal(Number(ledger.rows[0]?.n), 0);
});
