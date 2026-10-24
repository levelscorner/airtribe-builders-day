import assert from "node:assert/strict";
import { test } from "node:test";
import type { ScriptGenInput } from "@chotu/shared";
import { getPresets } from "../genres/load.js";
import { loadRoutedSkills, routeSkillFiles } from "../skills/router.js";
import { createScenePlan, planDurations, wordsFor } from "./create.js";

function input(genre: ScriptGenInput["genre"] = "kids"): ScriptGenInput {
  const ids = genre === "ad" ? ["preset_riya"] : genre === "faceless" ? ["preset_narrator"] : ["preset_chintu", "preset_mini"];
  return {
    videoId: "video_plan",
    genre,
    language: "hinglish",
    targetSeconds: genre === "faceless" ? 50 : 45,
    brief: { topic: "why bees make honey", genre, language: "hinglish" },
    cast: getPresets(ids),
  };
}

test("router picks genre and stage skill files", () => {
  assert.deepEqual(routeSkillFiles("kids", "script"), ["script/SKILL.md", "script/kids.md"]);
  assert.deepEqual(routeSkillFiles("ad", "image prompt"), ["image-prompt/SKILL.md", "image-prompt/ads.md"]);
  assert.deepEqual(routeSkillFiles("faceless", "motion prompt"), [
    "motion-prompt/SKILL.md",
    "motion-prompt/faceless.md",
  ]);
  assert.deepEqual(routeSkillFiles("kids", "voiceover"), ["voiceover/SKILL.md", "voiceover/kids.md"]);
  const kids = loadRoutedSkills("kids", ["script", "image prompt", "motion prompt", "voiceover"]);
  assert.match(kids, /KIDS_EDU_FUN/);
  assert.doesNotMatch(kids, /ADS_OFFER/);
  assert.match(loadRoutedSkills("ad", ["script"]), /ADS_OFFER/);
  assert.match(loadRoutedSkills("faceless", ["image prompt"]), /FACELESS_NO_FACE/);
});

test("mock scene plan is 4-6 clips with cast locked into every image prompt", async () => {
  const plan = await createScenePlan({ mock: true }).generate(input());
  assert.ok(plan.scenes.length >= 4 && plan.scenes.length <= 6);
  assert.deepEqual(
    plan.scenes.map((scene) => scene.durationSec),
    planDurations(45),
  );
  for (const scene of plan.scenes) {
    assert.ok(scene.durationSec === 5 || scene.durationSec === 10);
    assert.equal(scene.vo.trim().split(/\s+/).length, wordsFor(scene.durationSec));
    assert.equal(scene.voiceId, "playful_young_male");
    assert.match(scene.imagePrompt, /yellow kurta/);
    assert.match(scene.imagePrompt, /two black braids/);
    assert.match(scene.motionPrompt, /Seedance|push-in|ratio/i);
    assert.match(scene.imagePrompt, /AI-generated scene/);
  }
});

test("faceless mock plan keeps people out of the still", async () => {
  const plan = await createScenePlan({ mock: true }).generate(input("faceless"));
  assert.ok(plan.scenes.every((scene) => /No person/i.test(scene.imagePrompt)));
  assert.ok(plan.scenes.every((scene) => scene.voiceId === "deep_storyteller_male"));
});
