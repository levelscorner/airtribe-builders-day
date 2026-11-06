import assert from "node:assert/strict";
import { test } from "node:test";
import { providerAfterFailure } from "./failure-provider.js";

test("failed rows keep the provider that was called", () => {
  assert.equal(providerAfterFailure("image", { MOCK: "1" }), "mock");
  assert.equal(providerAfterFailure("image", { MOCK: "0", IMAGE_PROVIDER: "openai" }), "openai");
  assert.equal(providerAfterFailure("image", { MOCK: "0", IMAGE_PROVIDER: "ark" }), "ark");
  assert.equal(providerAfterFailure("image", { MOCK: "0", IMAGE_PROVIDER: "mock" }), "mock");
  assert.equal(providerAfterFailure("clip", { MOCK: "1" }), "mock");
  assert.equal(providerAfterFailure("clip", { MOCK: "0", CLIP_MOCK: "1" }), "mock");
  assert.equal(providerAfterFailure("clip", { MOCK: "0" }), "ark");
  assert.equal(providerAfterFailure("clip", { MOCK: "0", CLIP_MOCK: "0" }), "ark");
  assert.equal(providerAfterFailure("clip", { MOCK: "1", CLIP_MOCK: "0" }), "ark");
  assert.equal(providerAfterFailure("voice", { MOCK: "0" }), "elevenlabs");
  assert.equal(providerAfterFailure("voice", { MOCK: "1" }), "mock");
});
