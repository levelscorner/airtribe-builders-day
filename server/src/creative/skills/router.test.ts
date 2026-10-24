import assert from "node:assert/strict";
import { test } from "node:test";
import { createScriptGen } from "../script/create.js";
import { getPresets } from "../genres/load.js";
import type { CompleteRequest } from "../llm.js";
import { mockScript } from "../script/mock.js";

test("ScriptGen system prompt includes the routed kids skills", async () => {
  let system = "";
  const sample = {
    videoId: "video_kids",
    genre: "kids" as const,
    language: "en" as const,
    targetSeconds: 45,
    brief: { topic: "bees", genre: "kids" as const },
    cast: getPresets(["preset_chintu"]),
  };
  await createScriptGen({
    mock: false,
    llmApiKey: "",
    complete: async (request: CompleteRequest) => {
      system = request.system;
      return mockScript(sample);
    },
  }).generate(sample);
  assert.match(system, /KIDS_EDU_FUN/);
  assert.match(system, /routed skills/);
  assert.doesNotMatch(system, /ADS_OFFER/);
});
