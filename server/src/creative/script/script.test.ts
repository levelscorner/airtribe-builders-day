import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import type { CastMember, ScriptGenInput } from "@chotu/shared";
import { getPresetCast } from "../genres/load.js";
import type { CompleteRequest } from "../llm.js";
import { createScriptGen } from "./create.js";
import { mockScript } from "./mock.js";

function input(overrides: Partial<ScriptGenInput> = {}): ScriptGenInput {
  const cast = getPresetCast().filter((member) => member.id === "preset_chintu" || member.id === "preset_mini");
  return {
    videoId: "video_kids",
    brief: {
      topic: "why bees make honey",
      genre: "kids",
      language: "hi",
      aspectRatio: "9:16",
      resolution: "1080p",
      targetSeconds: 45,
      audience: "children",
      artStyle: "bright-2d-cartoon",
      castIds: cast.map((member) => member.id),
    },
    cast,
    genre: "kids",
    language: "hi",
    targetSeconds: 45,
    ...overrides,
  };
}

test("mock script returns one cast list per scene and durations that add up", async () => {
  const script = await createScriptGen({ mock: true }).generate(input());
  assert.equal(script.scenes.length, 5);
  assert.equal(
    script.scenes.reduce((total, scene) => total + scene.durationMs, 0),
    45_000,
  );
  assert.deepEqual(script.scenes[0]?.castIds, ["preset_chintu", "preset_mini"]);
  assert.equal(script.scenes[1]?.castIds.length, 1);
  assert.match(script.scenes[0]?.narration ?? "", /शहद|Chintu/);
  assert.match(script.scenes[4]?.doubts[0] ?? "", /quiz/i);
  assert.equal(script.rawMarkdown, undefined);
});

test("regenerate feedback is applied to the hook", async () => {
  const script = await createScriptGen({ mock: true }).generate(input({ feedback: "ZARQON" }));
  assert.doesNotMatch(script.scenes[0]?.narration ?? "", /ZARQON/);
  const original = await createScriptGen({ mock: true }).generate(input());
  assert.notEqual(script.scenes[0]?.narration, original.scenes[0]?.narration);
  assert.doesNotMatch(script.scenes[1]?.narration ?? "", /ZARQON/);
});

test("live ScriptGen puts skills in the system prompt and keeps them out of the script", async () => {
  const root = mkdtempSync(join(tmpdir(), "chotu-craft-"));
  const skill = join(root, "skills/script-per-genre/SKILL.md");
  mkdirSync(dirname(skill), { recursive: true });
  writeFileSync(skill, "SENTINEL_SKILL_PHRASE private");
  const sample = input();
  let system = "";
  const script = await createScriptGen({
    mock: false,
    llmApiKey: "",
    skillsRoot: root,
    complete: async (request: CompleteRequest) => {
      system = request.system;
      return mockScript(sample);
    },
  }).generate(sample);
  assert.match(system, /SENTINEL_SKILL_PHRASE/);
  assert.equal(JSON.stringify(script).includes("SENTINEL_SKILL_PHRASE"), false);
});

test("live ScriptGen refuses to call the network without a key", async () => {
  await assert.rejects(
    () => createScriptGen({ mock: false, llmApiKey: "" }).generate(input()),
    /LLM_API_KEY/,
  );
});

test("faceless scenes keep the narrator and nobody else", async () => {
  const narrator = getPresetCast().find((member) => member.id === "preset_narrator") as CastMember;
  const script = await createScriptGen({ mock: true }).generate({
    videoId: "video_faceless",
    genre: "faceless",
    language: "en",
    targetSeconds: 50,
    brief: {
      topic: "how the Indian monsoon starts",
      genre: "faceless",
      language: "en",
      targetSeconds: 50,
    },
    cast: [narrator],
  });
  assert.equal(script.scenes.length, 5);
  assert.ok(script.scenes.every((scene) => scene.castIds.join() === "preset_narrator"));
  assert.match(script.scenes[0]?.narration ?? "", /monsoon/i);
});
