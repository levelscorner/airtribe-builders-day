import assert from "node:assert/strict";
import { test } from "node:test";
import { createMockStudio, StudioMockError } from "./mock-studio";

test("__defaults answers the open question instead of stale_question", async () => {
  const client = createMockStudio({ delayMs: 0 });
  await client.createUser({ displayName: "Ada", phoneOrEmail: "ada@example.com" });
  const chat = await client.createChat({ initialMessage: "bees" });
  await assert.rejects(
    () => client.postMessage(chat.chatId, { answer: { field: "aspect_ratio", optionId: "16:9" } }),
    (error: unknown) => {
      assert.ok(error instanceof StudioMockError);
      assert.equal(error.code, "stale_question");
      return true;
    },
  );
  await client.postMessage(chat.chatId, {
    text: "Choose the remaining details for me",
    answer: { field: "__defaults", useDefaults: true },
  });
  let stage = "brief";
  for (let i = 0; i < 20 && stage === "brief"; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    stage = (await client.getChat(chat.chatId)).stage;
  }
  assert.notEqual(stage, "brief");
});
