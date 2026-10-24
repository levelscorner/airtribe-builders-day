import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { lockFaceAnchor } from "./cast/lock.js";
import { createCastAdapter, elementIdForAnchor } from "./cast/reference.js";
import { buildVoiceRequest, VoiceModels } from "./elevenlabs/request.js";
import { createVoiceGen } from "./elevenlabs/voice-gen.js";
import { HfEndpoints, buildClipSubmission, buildImageSubmission } from "./higgsfield/request.js";
import { createClipGen } from "./higgsfield/clip-gen.js";
import { createImageGen } from "./higgsfield/image-gen.js";
import { createMediaPorts } from "./index.js";
import type { MediaJob } from "./job.js";
import { mockAssetDir, mockAssets } from "./placeholders.js";
import { loadVoicePresets } from "./elevenlabs/presets.js";

const JOB_STATUSES = ["queued", "in_progress", "completed", "failed", "nsfw", "canceled"];

function assertJobShape(job: MediaJob<unknown>): void {
  assert.equal(typeof job.jobId, "string");
  assert.ok(job.jobId.length > 0);
  assert.equal(job.provider, "mock");
  assert.ok(JOB_STATUSES.includes(job.status));
  assert.equal(typeof job.costCredits, "number");
  assert.equal(typeof job.idempotencyKey, "string");
  assert.ok(job.idempotencyKey.length > 0);
}

test("placeholder assets exist for mock urls", () => {
  assert.equal(existsSync(join(mockAssetDir, "anchor.png")), true);
  assert.equal(existsSync(join(mockAssetDir, "keyframe.png")), true);
  assert.equal(existsSync(join(mockAssetDir, "clip.mp4")), true);
  assert.equal(existsSync(join(mockAssetDir, "line.mp3")), true);
});

test("MOCK=1 image job uses the qwen edit endpoint and a placeholder still", async () => {
  const env = { MOCK: "1", PUBLIC_BASE_URL: "http://studio.test" };
  const ports = createMediaPorts(env);
  const ref = await ports.cast.createReference({
    castId: "mini",
    name: "Mini",
    identityText: "curious 8-year-old girl",
    anchorUrl: "https://cdn.example/mini.png",
  });
  const job = await ports.images.submit({
    prompt: `<<<${ref.higgsfieldElementId}>>> waves from a rooftop`,
    elementIds: [ref.higgsfieldElementId],
    aspectRatio: "9:16",
    resolution: "720p",
  });

  assertJobShape(job);
  assert.equal(job.status, "completed");
  assert.equal(job.costCredits, 8);
  assert.ok(job.result);
  assert.equal(job.result.provider, "mock");
  assert.equal(job.result.model, HfEndpoints.qwenEdit);
  assert.ok(job.result.url.startsWith(`http://studio.test${mockAssets.keyframe}?job=`));

  const again = await ports.images.getJob(job.jobId);
  assert.equal(again.jobId, job.jobId);
  const same = await ports.images.submit(
    {
      prompt: "ignored",
      elementIds: [],
      aspectRatio: "9:16",
      resolution: "720p",
    },
    { idempotencyKey: job.idempotencyKey },
  );
  assert.equal(same.jobId, job.jobId);
});

test("image request sends the anchor and identity text to qwen edit", async () => {
  const cast = createCastAdapter({ MOCK: "0" });
  const ref = await cast.createReference({
    castId: "mini",
    name: "Mini",
    identityText: "curious 8-year-old girl",
    anchorUrl: "https://cdn.example/mini.png",
  });
  assert.equal(ref.status, "completed");
  assert.equal(ref.higgsfieldElementId, elementIdForAnchor("https://cdn.example/mini.png"));

  const resolved = cast.resolvePrompt(`<<<${ref.higgsfieldElementId}>>> waves`, [ref.higgsfieldElementId]);
  assert.deepEqual(resolved.anchorUrls, ["https://cdn.example/mini.png"]);
  assert.equal(resolved.prompt.includes("<<<"), false);
  assert.equal(resolved.prompt.includes("curious 8-year-old girl"), true);

  const again = cast.resolvePrompt(
    `curious 8-year-old girl\n<<<${ref.higgsfieldElementId}>>> waves`,
    [ref.higgsfieldElementId],
  );
  assert.equal(again.prompt.split("curious 8-year-old girl").length - 1, 1);

  const submission = buildImageSubmission(
    {
      prompt: `<<<${ref.higgsfieldElementId}>>> waves`,
      elementIds: [ref.higgsfieldElementId],
      aspectRatio: "9:16",
      resolution: "1080p",
    },
    resolved,
  );
  assert.equal(submission.endpoint, "alibaba/qwen-image-3/edit");
  assert.equal(submission.body.resolution, "2k");
  assert.equal(submission.body.aspect_ratio, "9:16");
  assert.equal(submission.body.prompt_extend, false);
  assert.equal(submission.body.enable_thinking, false);
  assert.deepEqual(submission.body.image_urls, ["https://cdn.example/mini.png"]);
});

test("a keyframe with no cast uses qwen text-to-image", () => {
  const submission = buildImageSubmission(
    { prompt: "empty rooftop at dusk", elementIds: [], aspectRatio: "2:1", resolution: "720p" },
    { prompt: "empty rooftop at dusk", anchorUrls: [], elementIds: [], unresolvedIds: [] },
  );
  assert.equal(submission.endpoint, "alibaba/qwen-image-3/text-to-image");
  assert.equal(submission.body.resolution, "1k");
  assert.equal(submission.body.aspect_ratio, "9:16");
  assert.equal("image_urls" in submission.body, false);
});

test("unknown element ids and more than three anchors fail the image job", async () => {
  const images = createImageGen({ MOCK: "1" });
  const unknown = await images.submit({
    prompt: "hello",
    elementIds: ["550e8400-e29b-41d4-a716-446655440000"],
    aspectRatio: "9:16",
    resolution: "720p",
  });
  assert.equal(unknown.status, "failed");
  assert.equal(unknown.costCredits, 0);
  assert.match(unknown.error ?? "", /unknown cast reference/);
  await assert.rejects(() =>
    images.generate({
      prompt: "hello",
      elementIds: ["550e8400-e29b-41d4-a716-446655440000"],
      aspectRatio: "9:16",
      resolution: "720p",
    }),
  );

  const ids = [1, 2, 3, 4].map((n) => elementIdForAnchor(`https://cdn.example/${n}.png`));
  const tooMany = await images.submit({
    prompt: "group shot",
    elementIds: ids,
    aspectRatio: "9:16",
    resolution: "720p",
  });
  assert.equal(tooMany.status, "failed");
  assert.match(tooMany.error ?? "", /at most 3/);
});

test("lockFaceAnchor registers a generated still as the higgsfield element id", async () => {
  const env = { MOCK: "1" };
  const ports = createMediaPorts(env);
  const ref = await lockFaceAnchor(ports.cast, ports.images, {
    castId: "mini",
    name: "Mini",
    identityText: "curious 8-year-old girl",
    anchorPrompt: "front portrait, plain background",
  });
  assert.equal(ref.status, "completed");
  assert.ok(ref.anchorUrl.includes("/mock/keyframe.png"));
  assert.equal(ref.higgsfieldElementId, elementIdForAnchor(ref.anchorUrl));

  const images = {
    async generate(): Promise<never> {
      throw new Error("anchor url should skip generation");
    },
  };
  const uploaded = await lockFaceAnchor(ports.cast, images, {
    castId: "riya",
    name: "Riya",
    identityText: "confident presenter",
    anchorUrl: "https://cdn.example/riya.png",
  });
  assert.equal(uploaded.anchorUrl, "https://cdn.example/riya.png");
});

test("rest adapter does not upload bytes until the Higgsfield client is attached", async () => {
  const cast = createCastAdapter({ CAST_MOCK: "0" });
  const failed = await cast.createReference({
    castId: "mini",
    name: "Mini",
    identityText: "curious 8-year-old girl",
    anchorBytes: new Uint8Array([1, 2, 3]),
    contentType: "image/png",
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.higgsfieldElementId, "");
  assert.match(failed.error ?? "", /upload/);
});

test("one character clip is image-to-video and two characters are reference-to-video", async () => {
  const cast = createCastAdapter({ MOCK: "1" });
  const mini = await cast.createReference({
    castId: "mini",
    name: "Mini",
    identityText: "curious 8-year-old girl",
    anchorUrl: "https://cdn.example/mini.png",
  });
  const chintu = await cast.createReference({
    castId: "chintu",
    name: "Chintu",
    identityText: "playful 8-year-old boy",
    anchorUrl: "https://cdn.example/chintu.png",
  });
  const clips = createClipGen({ MOCK: "1", CLIP_RESOLUTION: "1080p" }, { cast });
  const single = await clips.submit({
    imageUrl: "https://cdn.example/frame.png",
    videoPrompt: `<<<${mini.higgsfieldElementId}>>> turns and smiles`,
    elementIds: [mini.higgsfieldElementId],
    durationMs: 5000,
    aspectRatio: "9:16",
  });
  assertJobShape(single);
  assert.equal(single.status, "completed");
  assert.equal(single.costCredits, 40);
  assert.equal(single.result?.provider, "mock");
  assert.equal(single.result?.model, HfEndpoints.seedanceI2v);
  assert.ok(single.result?.url.includes("/mock/clip.mp4"));

  const singleBody = buildClipSubmission(
    {
      imageUrl: "https://cdn.example/frame.png",
      videoPrompt: "turns and smiles",
      elementIds: [mini.higgsfieldElementId],
      durationMs: 5000,
      aspectRatio: "9:16",
    },
    cast.resolvePrompt("turns and smiles", [mini.higgsfieldElementId]),
    { resolution: "1080p" },
  );
  assert.equal(singleBody.endpoint, "bytedance/seedance-2.0/image-to-video");
  assert.equal(singleBody.body.image_url, "https://cdn.example/frame.png");
  assert.equal(singleBody.body.duration, 5);
  assert.equal(singleBody.body.resolution, "1080p");
  assert.equal(singleBody.body.generate_audio, false);
  assert.equal("image_urls" in singleBody.body, false);
  assert.equal("aspect_ratio" in singleBody.body, false);

  const multiResolved = cast.resolvePrompt("they share a mango", [
    mini.higgsfieldElementId,
    chintu.higgsfieldElementId,
  ]);
  const multiBody = buildClipSubmission(
    {
      imageUrl: "https://cdn.example/frame.png",
      videoPrompt: "they share a mango",
      elementIds: [mini.higgsfieldElementId, chintu.higgsfieldElementId],
      durationMs: 20_000,
      aspectRatio: "9:16",
    },
    multiResolved,
  );
  assert.equal(multiBody.endpoint, "bytedance/seedance-2.0/reference-to-video");
  assert.deepEqual(multiBody.body.image_urls, [
    "https://cdn.example/frame.png",
    "https://cdn.example/mini.png",
    "https://cdn.example/chintu.png",
  ]);
  assert.equal(multiBody.body.duration, 15);
  assert.equal(multiBody.body.aspect_ratio, "9:16");
  assert.equal(multiBody.body.generate_audio, false);
  assert.equal("image_url" in multiBody.body, false);

  const multi = await clips.generate({
    imageUrl: "https://cdn.example/frame.png",
    videoPrompt: "they share a mango",
    elementIds: [mini.higgsfieldElementId, chintu.higgsfieldElementId],
    durationMs: 3000,
    aspectRatio: "9:16",
  });
  assert.equal(multi.model, HfEndpoints.seedanceR2v);
  const clamped = buildClipSubmission(
    {
      imageUrl: "https://cdn.example/frame.png",
      videoPrompt: "x",
      elementIds: [],
      durationMs: 0,
      aspectRatio: "9:16",
    },
    { prompt: "x", anchorUrls: [], elementIds: [], unresolvedIds: [] },
  );
  assert.equal(clamped.body.duration, 5);
  const short = buildClipSubmission(
    {
      imageUrl: "https://cdn.example/frame.png",
      videoPrompt: "x",
      elementIds: [],
      durationMs: 3000,
      aspectRatio: "9:16",
    },
    { prompt: "x", anchorUrls: [], elementIds: [], unresolvedIds: [] },
  );
  assert.equal(short.body.duration, 4);
});

test("voice presets are config and lines return caption alignment", async () => {
  const voice = createVoiceGen({ MOCK: "1", PUBLIC_BASE_URL: "http://studio.test" });
  assert.deepEqual(
    voice.listPresets().map((preset) => preset.elevenlabsVoiceId),
    [
      "T536A2SFCG4AEDVTRucQ",
      "srEfhy4AF67Mw9SpTVFd",
      "mActWQg9kibLro6Z2ouY",
      "qsz5tTEjPvsiIJZIpM8S",
    ],
  );
  assert.equal(voice.listPresets()[0]?.style, 0.3);
  assert.equal(voice.listPresets()[3]?.style, 0.15);

  const line = await voice.generate({
    text: "Hi",
    voiceId: "T536A2SFCG4AEDVTRucQ",
    language: "hi",
  });
  assert.equal(line.provider, "mock");
  assert.equal(line.model, VoiceModels.final);
  assert.equal(line.durationMs, 160);
  assert.deepEqual(line.alignment.chars, ["H", "i"]);
  assert.deepEqual(line.alignment.startMs, [0, 80]);
  assert.deepEqual(line.alignment.endMs, [80, 160]);
  assert.ok(line.url.includes("/mock/line.mp3"));

  const sample = await voice.sample({
    text: "Hi",
    voiceId: "kid_female",
    language: "hinglish",
  });
  assert.equal(sample.model, VoiceModels.preview);

  const previewRequest = buildVoiceRequest(
    { text: "Hi", voiceId: "kid_female", language: "hinglish" },
    loadVoicePresets({}),
    true,
  );
  assert.equal(previewRequest.modelId, "eleven_flash_v2_5");
  assert.equal(previewRequest.body.language_code, "hi");
  assert.equal(previewRequest.body.voice_settings.style, 0.3);
  assert.equal(previewRequest.body.voice_settings.similarity_boost, 0.75);
  assert.equal(previewRequest.body.voice_settings.use_speaker_boost, true);
  assert.equal(previewRequest.query.output_format, "mp3_44100_128");
  assert.equal(
    previewRequest.path,
    "/v1/text-to-speech/T536A2SFCG4AEDVTRucQ/with-timestamps",
  );

  const finalRequest = buildVoiceRequest(
    { text: "Hi", voiceId: "T536A2SFCG4AEDVTRucQ", language: "hi" },
    loadVoicePresets({}),
    false,
  );
  assert.equal(finalRequest.modelId, "eleven_multilingual_v2");
  assert.equal("language_code" in finalRequest.body, false);

  const english = buildVoiceRequest(
    { text: "Hi", voiceId: "qsz5tTEjPvsiIJZIpM8S", language: "en" },
    loadVoicePresets({}),
    true,
  );
  assert.equal(english.body.language_code, "en");
  assert.equal(english.body.voice_settings.style, 0.15);
});

test("VOICE_PRESETS_JSON replaces the provisional catalogue", async () => {
  const voice = createVoiceGen({
    MOCK: "1",
    VOICE_PRESETS_JSON: JSON.stringify([
      {
        id: "custom",
        elevenlabsVoiceId: "voice_custom",
        label: "Custom",
        languageHint: "hi",
        stability: 0.4,
        style: 0.2,
      },
    ]),
  });
  assert.deepEqual(
    voice.listPresets().map((preset) => preset.elevenlabsVoiceId),
    ["voice_custom"],
  );
  const line = await voice.generate({ text: "Hi", voiceId: "voice_custom", language: "hi" });
  assert.equal(line.model, "eleven_multilingual_v2");
  assert.throws(() => createVoiceGen({ MOCK: "1", VOICE_PRESETS_JSON: "{" }), /not valid JSON/);
});

test("per-module mock flags override MOCK", () => {
  assert.equal(createImageGen({ IMAGE_MOCK: "1" }).mode, "mock");
  assert.throws(() => createImageGen({ MOCK: "1", IMAGE_MOCK: "0" }), /IMAGE_MOCK=1/);
  assert.equal(createClipGen({ CLIP_MOCK: "1" }).mode, "mock");
  assert.throws(() => createVoiceGen({ MOCK: "1", VOICE_MOCK: "0" }), /VOICE_MOCK=1/);
  assert.equal(createCastAdapter({ MOCK: "1", CAST_MOCK: "0" }).kind, "rest");

  const previous = process.env.MOCK;
  process.env.MOCK = "1";
  try {
    assert.equal(createImageGen().mode, "mock");
  } finally {
    if (previous === undefined) delete process.env.MOCK;
    else process.env.MOCK = previous;
  }
});
