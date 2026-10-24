import assert from "node:assert/strict";
import { test } from "node:test";
import type { PromptGenInput, Scene } from "@chotu/shared";
import { getPresets } from "../genres/load.js";
import type { CompleteRequest } from "../llm.js";
import { createScriptGen } from "../script/create.js";
import { createPromptGen } from "./create.js";
import { mockPrompts } from "./mock.js";

function scene(partial: Partial<Scene> & Pick<Scene, "idx" | "castIds">): Scene {
  return {
    id: `scene_${partial.idx}`,
    videoId: "video_kids",
    title: partial.title ?? "hook",
    narration: partial.narration ?? "Hello.",
    durationMs: partial.durationMs ?? 9000,
    doubts: partial.doubts ?? [],
    ...partial,
  };
}

test("image and video prompts repeat identity text and embed element ids", async () => {
  const cast = getPresets(["preset_chintu", "preset_mini"]);
  const script = await createScriptGen({ mock: true }).generate({
    videoId: "video_kids",
    genre: "kids",
    language: "en",
    targetSeconds: 45,
    brief: { topic: "why bees make honey", genre: "kids", language: "en", artStyle: "bright-2d-cartoon", artStyleTraits: ["bright flat colours", "bold clean outlines"] },
    cast,
  });
  const hook = script.scenes[0];
  assert.ok(hook);
  const prompts = await createPromptGen({ mock: true }).generate({
    videoId: "video_kids",
    brief: {
      topic: "why bees make honey",
      genre: "kids",
      aspectRatio: "9:16",
      artStyle: "bright-2d-cartoon",
      artStyleTraits: ["bright flat colours", "bold clean outlines"],
    },
    artStyle: "bright-2d-cartoon",
    cast,
    scene: scene({
      idx: hook.idx,
      title: hook.title,
      narration: hook.narration,
      durationMs: hook.durationMs,
      castIds: hook.castIds,
    }),
  });
  for (const member of cast) {
    assert.ok(prompts.imagePrompt.includes(member.identityText));
    assert.ok(prompts.videoPrompt.includes(member.identityText));
    assert.ok(prompts.imagePrompt.includes(`<<<${member.higgsfieldElementId}>>>`));
  }
  assert.deepEqual(prompts.elementIds, ["el_chintu", "el_mini"]);
  assert.match(prompts.videoPrompt, /Duration 9000 milliseconds/);
  assert.match(prompts.imagePrompt, /AI-generated scene/);
  assert.doesNotMatch(prompts.imagePrompt, /pixar|disney/i);
});

test("faceless prompts keep the narrator off screen", async () => {
  const [narrator] = getPresets(["preset_narrator"]);
  assert.ok(narrator);
  const prompts = await createPromptGen({ mock: true }).generate({
    videoId: "video_faceless",
    brief: { topic: "how the Indian monsoon starts", genre: "faceless", aspectRatio: "9:16", artStyle: "cinematic-realistic" },
    cast: [narrator],
    scene: scene({
      idx: 0,
      videoId: "video_faceless",
      title: "hook",
      castIds: [narrator.id],
      durationMs: 10000,
    }),
  });
  assert.deepEqual(prompts.elementIds, []);
  assert.equal(prompts.imagePrompt.includes("<<<"), false);
  assert.ok(prompts.imagePrompt.includes(narrator.identityText));
  assert.match(prompts.imagePrompt, /No face/);
});

test("live PromptGen does not copy skill text into the prompt", async () => {
  const [riya] = getPresets(["preset_riya"]);
  assert.ok(riya);
  const request: PromptGenInput = {
    videoId: "video_ad",
    brief: {
      topic: "a weekend offer",
      genre: "ad",
      aspectRatio: "9:16",
      notes: "product: a small glass jar of mango pickle",
    },
    cast: [riya],
    scene: scene({ idx: 2, title: "product", videoId: "video_ad", castIds: [riya.id], durationMs: 5000 }),
  };
  let system = "";
  const prompts = await createPromptGen({
    mock: false,
    llmApiKey: "",
    complete: async (call: CompleteRequest) => {
      system = `${call.system}\nSENTINEL_SKILL_PHRASE`;
      return mockPrompts(request);
    },
  }).generate(request);
  assert.match(system, /SENTINEL_SKILL_PHRASE/);
  assert.equal(prompts.imagePrompt.includes("SENTINEL_SKILL_PHRASE"), false);
  assert.ok(prompts.imagePrompt.includes(riya.identityText));
  assert.ok(prompts.imagePrompt.includes("<<<el_riya>>>"));
});

test("prompt regenerate feedback reaches the mock and the model request", async () => {
  const cast = getPresets(["preset_chintu"]);
  const member = cast[0];
  assert.ok(member);
  const input: PromptGenInput = {
    videoId: "video_kids",
    brief: { topic: "rain", genre: "kids", aspectRatio: "9:16" },
    cast,
    scene: scene({ idx: 0, castIds: [member.id], narration: "Rain falls." }),
    feedback: "use a wider camera angle",
  };
  const mock = await createPromptGen({ mock: true }).generate(input);
  assert.match(mock.imagePrompt, /wider camera angle/);
  assert.match(mock.videoPrompt, /wider camera angle/);
  let prompt = "";
  await createPromptGen({
    mock: false,
    llmApiKey: "",
    complete: async (call: CompleteRequest) => {
      prompt = call.prompt;
      return mockPrompts({ ...input, feedback: undefined });
    },
  }).generate(input);
  assert.match(prompt, /wider camera angle/);
  assert.match(prompt, /Apply this change|feedback/);
});
