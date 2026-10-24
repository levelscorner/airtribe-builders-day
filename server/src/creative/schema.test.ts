import assert from "node:assert/strict";
import { test } from "node:test";
import type { Brief, PromptGenOutput, ScriptGenOutput } from "@chotu/shared";
import {
  parseBrief,
  parsePromptGenOutput,
  parseScriptGenOutput,
} from "./schema.js";

test("parseBrief returns the shared Brief shape", () => {
  const brief: Brief = parseBrief({
    genre: "kids",
    language: "hi",
    aspectRatio: "9:16",
    resolution: "720p",
    targetSeconds: 45,
    audience: "children",
    artStyle: "bright-2d-cartoon",
    artStyleTraits: ["bright flat colours"],
    castIds: ["preset_chintu"],
    notes: "topic: why bees make honey",
  });
  assert.equal(brief.genre, "kids");
  assert.equal(brief.resolution, "720p");
  assert.deepEqual(brief.castIds, ["preset_chintu"]);
});

test("parseBrief rejects a language outside the contract", () => {
  assert.throws(() => parseBrief({ language: "fr" }));
});

test("parseScriptGenOutput requires a cast id list and doubts on every scene", () => {
  const script: ScriptGenOutput = parseScriptGenOutput({
    scenes: [
      {
        idx: 0,
        title: "hook",
        narration: "Hello.",
        durationMs: 9000,
        doubts: [],
        castIds: ["preset_mini"],
      },
    ],
  });
  assert.equal(script.scenes[0]?.castIds[0], "preset_mini");
  assert.throws(() =>
    parseScriptGenOutput({
      scenes: [
        {
          idx: 0,
          title: "hook",
          narration: "Hello.",
          durationMs: 9000,
          doubts: [],
        },
      ],
    }),
  );
});

test("parsePromptGenOutput keeps image prompt, video prompt, and element ids", () => {
  const prompts: PromptGenOutput = parsePromptGenOutput({
    imagePrompt: "A bright frame. AI-generated scene.",
    videoPrompt: "Slow push-in. AI-generated scene.",
    elementIds: ["el_chintu"],
  });
  assert.deepEqual(prompts.elementIds, ["el_chintu"]);
});
