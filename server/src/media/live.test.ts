import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createCastAdapter, elementIdForAnchor } from "./cast/reference.js";
import { higgsfieldAuthorization } from "./higgsfield/credentials.js";
import type { FetchLike } from "./higgsfield/client.js";
import { createHiggsfieldClient } from "./higgsfield/client.js";
import { createClipGen } from "./higgsfield/clip-gen.js";
import { createImageGen } from "./higgsfield/image-gen.js";
import { createVoiceGen } from "./elevenlabs/voice-gen.js";
import { createMediaPorts } from "./index.js";

interface Call {
  url: string;
  init?: RequestInit;
}

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function header(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

const liveEnv = {
  IMAGE_MOCK: "0",
  CLIP_MOCK: "0",
  VOICE_MOCK: "0",
  CAST_MOCK: "0",
  HIGGSFIELD_API_KEY: "test-id:test-secret",
  ELEVENLABS_API_KEY: "test-eleven",
  PUBLIC_BASE_URL: "http://studio.test",
  MEDIA_CONCURRENCY: "4",
};

test("higgsfield credentials accept the combined key and the split pair", () => {
  assert.equal(higgsfieldAuthorization({ HIGGSFIELD_API_KEY: "id:secret" }), "Key id:secret");
  assert.equal(higgsfieldAuthorization({ HF_API_KEY: "id:secret" }), "Key id:secret");
  assert.equal(
    higgsfieldAuthorization({ HF_API_KEY_ID: "split-id", HF_API_KEY_SECRET: "split-secret" }),
    "Key split-id:split-secret",
  );
  assert.throws(() => higgsfieldAuthorization({ HIGGSFIELD_API_KEY: "not-a-pair" }), /KEY_ID:KEY_SECRET/);
  assert.throws(() => higgsfieldAuthorization({}), /credentials missing/);
});

test("live image gen submits qwen edit and polls to a higgsfield url", async () => {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (init?.method === "POST") {
      return json(200, {
        status: "queued",
        request_id: "req-image",
        status_url: "https://api.higgsfield.ai/requests/req-image/status",
      });
    }
    if (calls.filter((call) => call.init?.method !== "POST").length === 1) {
      return json(500, { detail: "temporary" });
    }
    return json(200, {
      status: "completed",
      request_id: "req-image",
      images: [{ url: "https://cdn.example/out.png" }],
    });
  };
  const cast = createCastAdapter({ CAST_MOCK: "0" });
  const ref = await cast.createReference({
    castId: "mini",
    name: "Mini",
    identityText: "curious 8-year-old girl",
    anchorUrl: "https://cdn.example/mini.png",
  });
  const client = createHiggsfieldClient(
    { ...liveEnv, HF_POLL_TIMEOUT_MS: "10000" },
    { fetch, sleep: async (ms) => { sleeps.push(ms); }, random: () => 0 },
  );
  const images = createImageGen({ ...liveEnv, CLIP_RESOLUTION: "720p" }, { cast, higgsfield: client });
  assert.equal(images.mode, "live");
  const job = await images.submit(
    {
      prompt: `<<<${ref.higgsfieldElementId}>>> waves`,
      elementIds: [ref.higgsfieldElementId],
      aspectRatio: "9:16",
      resolution: "720p",
    },
    { idempotencyKey: "image-key-1" },
  );

  assert.equal(job.status, "completed");
  assert.equal(job.provider, "higgsfield");
  assert.equal(job.jobId, "req-image");
  assert.equal(job.costCredits, 8);
  assert.equal(job.result?.url, "https://cdn.example/out.png");
  assert.equal(job.result?.provider, "higgsfield");
  assert.equal(job.result?.model, "alibaba/qwen-image-3/edit");
  assert.equal(header(calls[0]?.init, "authorization"), "Key test-id:test-secret");
  assert.equal(header(calls[0]?.init, "idempotency-key"), "image-key-1");
  assert.equal(calls[0]?.url, "https://api.higgsfield.ai/alibaba/qwen-image-3/edit");
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.deepEqual(body.image_urls, ["https://cdn.example/mini.png"]);
  assert.equal(body.prompt_extend, false);
  assert.equal(body.generate_audio, undefined);
  assert.equal(String(body.prompt).includes("curious 8-year-old girl"), true);
  assert.equal(String(body.prompt).includes("<<<"), false);
  assert.equal(calls[1]?.url, "https://api.higgsfield.ai/requests/req-image/status");
  assert.equal(header(calls[1]?.init, "authorization"), "Key test-id:test-secret");
  assert.deepEqual(sleeps, [2000, 500]);

  const again = await images.submit(
    {
      prompt: "other",
      elementIds: [],
      aspectRatio: "9:16",
      resolution: "720p",
    },
    { idempotencyKey: "image-key-1" },
  );
  assert.equal(again.jobId, job.jobId);
  assert.equal(calls.length, 3);
  assert.equal((await images.getJob("req-image")).result?.url, "https://cdn.example/out.png");
});

test("a bad higgsfield credential fails once and the error omits the secret", async () => {
  let posts = 0;
  const fetch: FetchLike = async () => {
    posts += 1;
    return json(401, { detail: "Invalid credentials" });
  };
  const images = createImageGen(
    { IMAGE_MOCK: "0", HIGGSFIELD_API_KEY: "test-id:test-secret" },
    { higgsfield: createHiggsfieldClient({ HIGGSFIELD_API_KEY: "test-id:test-secret" }, { fetch, sleep: async () => undefined }) },
  );
  const job = await images.submit({
    prompt: "rooftop",
    elementIds: [],
    aspectRatio: "9:16",
    resolution: "720p",
  });
  assert.equal(job.status, "failed");
  assert.equal(job.provider, "higgsfield");
  assert.equal(posts, 1);
  assert.match(job.error ?? "", /401/);
  assert.equal((job.error ?? "").includes("test-secret"), false);
  await assert.rejects(() =>
    images.generate({ prompt: "rooftop", elementIds: [], aspectRatio: "9:16", resolution: "720p" }),
  );
});

test("submit retries a dropped connection with the same idempotency key", async () => {
  const keys: string[] = [];
  let posts = 0;
  const fetch: FetchLike = async (_url, init) => {
    if (init?.method === "POST") {
      posts += 1;
      keys.push(header(init, "idempotency-key") ?? "");
      if (posts === 1) throw new Error("socket hang up");
      return json(200, {
        status: "completed",
        request_id: "req-retry",
        images: [{ url: "https://cdn.example/retry.png" }],
      });
    }
    throw new Error("unexpected poll");
  };
  const images = createImageGen(
    { IMAGE_MOCK: "0", HIGGSFIELD_API_KEY: "test-id:test-secret" },
    { higgsfield: createHiggsfieldClient({ HIGGSFIELD_API_KEY: "test-id:test-secret" }, { fetch, sleep: async () => undefined }) },
  );
  const job = await images.submit(
    { prompt: "rooftop", elementIds: [], aspectRatio: "9:16", resolution: "1080p" },
    { idempotencyKey: "same-key" },
  );
  assert.equal(job.status, "completed");
  assert.equal(job.result?.model, "alibaba/qwen-image-3/text-to-image");
  assert.deepEqual(keys, ["same-key", "same-key"]);
});

test("queue full waits for Retry-After and an nsfw result stays nsfw", async () => {
  const sleeps: number[] = [];
  let posts = 0;
  const fetch: FetchLike = async () => {
    posts += 1;
    if (posts === 1) return json(429, { detail: "account_queue_full" }, { "Retry-After": "0" });
    return json(200, { status: "nsfw", request_id: "req-nsfw", error: "nsfw" });
  };
  const images = createImageGen(
    { IMAGE_MOCK: "0", HIGGSFIELD_API_KEY: "test-id:test-secret" },
    {
      higgsfield: createHiggsfieldClient(
        { HIGGSFIELD_API_KEY: "test-id:test-secret" },
        { fetch, sleep: async (ms) => { sleeps.push(ms); }, random: () => 0 },
      ),
    },
  );
  const job = await images.submit({
    prompt: "rooftop",
    elementIds: [],
    aspectRatio: "9:16",
    resolution: "720p",
  });
  assert.equal(job.status, "nsfw");
  assert.equal(job.costCredits, 0);
  assert.deepEqual(sleeps, [0]);
  assert.equal(posts, 2);
});

test("multi-character clips post reference-to-video without generated audio", async () => {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return json(200, {
      status: "completed",
      request_id: "req-clip",
      video: { url: "https://cdn.example/clip.mp4" },
    });
  };
  const cast = createCastAdapter({ CAST_MOCK: "0" });
  const mini = await cast.createReference({
    castId: "mini",
    name: "Mini",
    identityText: "curious girl",
    anchorUrl: "https://cdn.example/mini.png",
  });
  const chintu = await cast.createReference({
    castId: "chintu",
    name: "Chintu",
    identityText: "playful boy",
    anchorUrl: "https://cdn.example/chintu.png",
  });
  const clips = createClipGen(
    { ...liveEnv, CLIP_RESOLUTION: "720p" },
    { cast, higgsfield: createHiggsfieldClient(liveEnv, { fetch, sleep: async () => undefined, random: () => 0 }) },
  );
  const clip = await clips.generate({
    imageUrl: "https://cdn.example/frame.png",
    videoPrompt: "they share a mango",
    elementIds: [mini.higgsfieldElementId, chintu.higgsfieldElementId],
    durationMs: 5000,
    aspectRatio: "9:16",
  });
  assert.equal(clip.provider, "higgsfield");
  assert.equal(clip.model, "bytedance/seedance-2.0/reference-to-video");
  assert.equal(clip.url, "https://cdn.example/clip.mp4");
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.equal(body.generate_audio, false);
  assert.equal(body.duration, 5);
  assert.deepEqual(body.image_urls, [
    "https://cdn.example/frame.png",
    "https://cdn.example/mini.png",
    "https://cdn.example/chintu.png",
  ]);
  assert.equal("image_url" in body, false);
  assert.equal(elementIdForAnchor("https://cdn.example/mini.png"), mini.higgsfieldElementId);
});

test("a local mock path is not sent to Higgsfield", async () => {
  let calls = 0;
  const fetch: FetchLike = async () => {
    calls += 1;
    return json(200, {});
  };
  const clips = createClipGen(
    { CLIP_MOCK: "0", HIGGSFIELD_API_KEY: "test-id:test-secret" },
    { higgsfield: createHiggsfieldClient({ HIGGSFIELD_API_KEY: "test-id:test-secret" }, { fetch }) },
  );
  const job = await clips.submit({
    imageUrl: "/mock/keyframe.png",
    videoPrompt: "pan",
    elementIds: [],
    durationMs: 5000,
    aspectRatio: "9:16",
  });
  assert.equal(job.status, "failed");
  assert.match(job.error ?? "", /http\(s\) url/);
  assert.equal(calls, 0);
});

test("face anchor bytes upload with the presigned headers and no api credential", async () => {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (String(url).endsWith("/files/generate-upload-url")) {
      return json(200, {
        upload_url: "https://storage.example/put",
        public_url: "https://cdn.example/anchor.png",
        upload_headers: { "Content-Type": "image/png", "x-amz-tagging": "retention=temporary" },
      });
    }
    return new Response(null, { status: 200 });
  };
  const ports = createMediaPorts(
    { MOCK: "1", CAST_MOCK: "0", HIGGSFIELD_API_KEY: "test-id:test-secret" },
    { higgsfield: createHiggsfieldClient({ HIGGSFIELD_API_KEY: "test-id:test-secret" }, { fetch }) },
  );
  const ref = await ports.cast.createReference({
    castId: "mini",
    name: "Mini",
    identityText: "curious 8-year-old girl",
    anchorBytes: new Uint8Array([1, 2, 3]),
    contentType: "image/png",
  });
  assert.equal(ref.status, "completed");
  assert.equal(ref.anchorUrl, "https://cdn.example/anchor.png");
  assert.equal(ref.higgsfieldElementId, elementIdForAnchor(ref.anchorUrl));
  assert.equal(header(calls[0]?.init, "authorization"), "Key test-id:test-secret");
  assert.equal(header(calls[1]?.init, "authorization"), null);
  assert.equal(header(calls[1]?.init, "x-amz-tagging"), "retention=temporary");
  assert.equal(calls[1]?.url, "https://storage.example/put");
});

test("submit slots stay at the concurrency limit", async () => {
  let posts = 0;
  let releaseFirst: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  const fetch: FetchLike = async (_url, init) => {
    if (init?.method === "POST") {
      posts += 1;
      if (posts === 1) await held;
      return json(200, {
        status: "completed",
        request_id: `req-${posts}`,
        images: [{ url: `https://cdn.example/${posts}.png` }],
      });
    }
    throw new Error("unexpected");
  };
  const images = createImageGen(
    { IMAGE_MOCK: "0", HIGGSFIELD_API_KEY: "test-id:test-secret", MEDIA_CONCURRENCY: "1" },
    {
      higgsfield: createHiggsfieldClient(
        { HIGGSFIELD_API_KEY: "test-id:test-secret", MEDIA_CONCURRENCY: "1" },
        { fetch, sleep: async () => undefined },
      ),
    },
  );
  const input = { prompt: "rooftop", elementIds: [], aspectRatio: "9:16" as const, resolution: "720p" as const };
  const first = images.submit(input, { idempotencyKey: "a" });
  const second = images.submit(input, { idempotencyKey: "b" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(posts, 1);
  releaseFirst();
  const jobs = await Promise.all([first, second]);
  assert.equal(posts, 2);
  assert.deepEqual(jobs.map((job) => job.status), ["completed", "completed"]);
});

test("voice gen posts with-timestamps and writes the mp3", async () => {
  const dir = mkdtempSync(join(tmpdir(), "chotu-voice-"));
  const calls: Call[] = [];
  const audio = Buffer.from("hello-audio");
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return json(200, {
      audio_base64: audio.toString("base64"),
      alignment: {
        characters: ["H", "i"],
        character_start_times_seconds: [0, 0.1],
        character_end_times_seconds: [0.1, 0.25],
      },
    });
  };
  const voice = createVoiceGen(
    { VOICE_MOCK: "0", ELEVENLABS_API_KEY: "test-eleven", PUBLIC_BASE_URL: "http://studio.test", MEDIA_DIR: dir },
    { fetch },
  );
  const finalJob = await voice.submit({ text: "Hi", voiceId: "T536A2SFCG4AEDVTRucQ", language: "hi" });
  assert.equal(finalJob.costCredits, 5);
  const line = finalJob.result;
  if (!line) throw new Error("missing voice result");
  assert.equal(line.provider, "elevenlabs");
  assert.equal(line.model, "eleven_multilingual_v2");
  assert.equal(line.durationMs, 250);
  assert.deepEqual(line.alignment, { chars: ["H", "i"], startMs: [0, 100], endMs: [100, 250] });
  assert.match(line.url, /^http:\/\/studio\.test\/media\/voice\/.+\.mp3$/);
  const filename = line.url.split("/").pop() ?? "";
  assert.deepEqual(readFileSync(join(dir, filename)), audio);
  assert.equal(header(calls[0]?.init, "xi-api-key"), "test-eleven");
  assert.equal(header(calls[0]?.init, "authorization"), null);
  assert.match(calls[0]?.url ?? "", /\/v1\/text-to-speech\/T536A2SFCG4AEDVTRucQ\/with-timestamps\?output_format=mp3_44100_128$/);
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.equal(body.model_id, "eleven_multilingual_v2");
  assert.equal("language_code" in body, false);

  const previewJob = await voice.submit(
    { text: "Hi", voiceId: "kid_female", language: "hinglish" },
    { preview: true },
  );
  assert.equal(previewJob.status, "completed");
  assert.equal(previewJob.costCredits, 2);
  assert.equal(previewJob.result?.model, "eleven_flash_v2_5");
  const sampleBody = JSON.parse(String(calls[1]?.init?.body));
  assert.equal(sampleBody.model_id, "eleven_flash_v2_5");
  assert.equal(sampleBody.language_code, "hi");
});

test("a voice response without alignment fails the job", async () => {
  const fetch: FetchLike = async () => json(200, { audio_base64: Buffer.from("x").toString("base64") });
  const voice = createVoiceGen(
    { VOICE_MOCK: "0", ELEVENLABS_API_KEY: "test-eleven", MEDIA_DIR: mkdtempSync(join(tmpdir(), "chotu-voice-")) },
    { fetch },
  );
  const job = await voice.submit({ text: "Hi", voiceId: "kid_female", language: "hi" });
  assert.equal(job.status, "failed");
  assert.equal(job.provider, "elevenlabs");
  assert.match(job.error ?? "", /alignment/);
  assert.equal((job.error ?? "").includes("test-eleven"), false);
});

test("polling gives up when the request never finishes", async () => {
  let ticks = 0;
  const fetch: FetchLike = async (_url, init) => {
    if (init?.method === "POST") {
      return json(200, { status: "queued", request_id: "req-slow", status_url: "https://api.higgsfield.ai/requests/req-slow/status" });
    }
    return json(200, { status: "queued", request_id: "req-slow" });
  };
  const images = createImageGen(
    { IMAGE_MOCK: "0", HIGGSFIELD_API_KEY: "test-id:test-secret", HF_POLL_TIMEOUT_MS: "1000" },
    {
      higgsfield: createHiggsfieldClient(
        { HIGGSFIELD_API_KEY: "test-id:test-secret", HF_POLL_TIMEOUT_MS: "1000" },
        { fetch, sleep: async () => undefined, now: () => (ticks++ === 0 ? 0 : 5_000), random: () => 0 },
      ),
    },
  );
  const job = await images.submit({
    prompt: "rooftop",
    elementIds: [],
    aspectRatio: "9:16",
    resolution: "720p",
  });
  assert.equal(job.status, "failed");
  assert.match(job.error ?? "", /timed out/);
});

test("creating image ports does not require an unrelated voice credential", () => {
  const ports = createMediaPorts({ MOCK: "0", HIGGSFIELD_API_KEY: "id:secret" });
  assert.equal(ports.images.mode, "live");
  assert.throws(() => ports.voice, /ELEVENLABS_API_KEY/);
});
