import assert from "node:assert/strict";
import test from "node:test";
import { buildSeedanceBody } from "./ark/request.js";
import { needsSeedanceNativeAudio, seedanceFallbackNote } from "./voice-fallback.js";

const clip = {
  imageUrl: "https://cdn.example/frame.png",
  videoPrompt: "gentle pan",
  elementIds: [] as string[],
  durationMs: 5000,
  aspectRatio: "9:16",
};

test("seedance native audio is only the elevenlabs failure path", () => {
  assert.equal(needsSeedanceNativeAudio("https://cdn.example/line.mp3"), false);
  assert.equal(needsSeedanceNativeAudio(""), true);
  assert.equal(needsSeedanceNativeAudio(undefined, new Error("voice_not_found")), true);
  assert.equal(seedanceFallbackNote(2), "voice fallback: seedance native audio (scene 2)");

  const quiet = buildSeedanceBody(clip, "gentle pan", {});
  assert.equal(quiet.generate_audio, false);
  const spoken = buildSeedanceBody({ ...clip, generateAudio: true }, "gentle pan", {});
  assert.equal(spoken.generate_audio, true);
  assert.equal(spoken.model, "dreamina-seedance-2-5-260628");
});
