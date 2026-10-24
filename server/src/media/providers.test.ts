import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import { VOICE_PRESETS } from "../../../packages/shared/voicePresets.ts";
import { parseModelJson } from "../creative/llm.js";
import { SCRIPT_TASK } from "../creative/skills/rules.js";
import { savePng } from "./files.js";
import { createCastAdapter } from "./cast/reference.js";
import { createMediaPorts } from "./index.js";
import { createVoiceGen } from "./elevenlabs/voice-gen.js";
import { arkImageSize, SEEDREAM_PORTRAIT_SIZE } from "./ark/request.js";
import { createStudioClipGen, createStudioImageGen } from "./studio.js";
import type { FetchLike } from "./ark/client.js";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("IMAGE_PROVIDER=openai calls gpt-image-2 generations and stores the crop", async () => {
  const png = await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: { r: 20, g: 40, b: 60 } },
  })
    .png()
    .toBuffer();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init });
    return json(200, { data: [{ b64_json: png.toString("base64") }] });
  };
  const root = mkdtempSync(join(tmpdir(), "chotu-img-"));
  const images = createStudioImageGen(
    {
      IMAGE_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test-openai",
      PUBLIC_BASE_URL: "http://studio.test",
      MEDIA_ROOT: root,
    },
    { fetch },
  );
  const image = await images.generate({
    prompt: "rooftop at dusk",
    elementIds: [],
    aspectRatio: "9:16",
    resolution: "720p",
  });
  assert.equal(images.mode, "live");
  assert.equal(image.provider, "openai");
  assert.equal(image.model, "gpt-image-2");
  assert.equal(image.providerLabel, "GPT Image 2 · OpenAI");
  assert.match(image.url, /^http:\/\/studio\.test\/media\/images\/.+\.png$/);
  assert.equal(calls[0]?.url, "https://api.openai.com/v1/images/generations");
  assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), "Bearer sk-test-openai");
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.equal(body.model, "gpt-image-2");
  assert.equal(body.size, "1024x1536");
  assert.equal(body.n, 1);
  assert.equal(body.prompt, "rooftop at dusk");
  assert.equal("output_format" in body, false);
  const id = image.url.split("/").pop()?.replace(/\.png$/, "");
  const stored = sharp(readFileSync(join(root, "images", `${id}.png`)));
  const meta = await stored.metadata();
  assert.equal(meta.width, 720);
  assert.equal(meta.height, 1280);
});

test("a failed gpt-image-2 frame is retried once before Seedream", async () => {
  const png = await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: { r: 9, g: 9, b: 9 } },
  })
    .png()
    .toBuffer();
  let generations = 0;
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(String(url));
    if (String(url).includes("api.openai.com")) {
      generations += 1;
      if (generations === 1) return json(500, { error: { message: "overloaded sk-test-openai" } });
      return json(200, { data: [{ b64_json: png.toString("base64") }] });
    }
    return json(200, { data: [{ url: "https://cdn.example/seedream.png" }] });
  };
  const root = mkdtempSync(join(tmpdir(), "chotu-retry-"));
  const images = createStudioImageGen(
    {
      IMAGE_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test-openai",
      ARK_API_KEY: "ark-test-key",
      PUBLIC_BASE_URL: "http://studio.test",
      MEDIA_ROOT: root,
    },
    { fetch },
  );
  const image = await images.generate({
    prompt: "rooftop",
    elementIds: [],
    aspectRatio: "9:16",
    resolution: "720p",
  });
  assert.equal(image.provider, "openai");
  assert.equal(image.model, "gpt-image-2");
  assert.equal(generations, 2);
  assert.equal(calls.filter((url) => url.includes("api.openai.com")).length, 2);
  assert.equal(calls.some((url) => url.includes("bytepluses.com")), false);
  assert.equal(JSON.stringify(image).includes("sk-test-openai"), false);
  assert.equal(JSON.stringify(image).includes("ark-test-key"), false);
});

test("two failed gpt-image-2 frames fall back to a 1440x2560 Seedream still stored at 720x1280", async () => {
  assert.equal(arkImageSize("9:16", "720p"), SEEDREAM_PORTRAIT_SIZE);
  assert.equal(arkImageSize("9:16", "1080p"), SEEDREAM_PORTRAIT_SIZE);
  assert.equal(arkImageSize("", "720p"), SEEDREAM_PORTRAIT_SIZE);
  const [width, height] = SEEDREAM_PORTRAIT_SIZE.split("x").map(Number);
  assert.ok((width ?? 0) * (height ?? 0) >= 3_686_400);
  const portrait = await sharp({
    create: { width: width ?? 1440, height: height ?? 2560, channels: 3, background: { r: 20, g: 40, b: 60 } },
  })
    .png()
    .toBuffer();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/mini.png")) {
      return new Response(Buffer.from("anchor"), { status: 200, headers: { "Content-Type": "image/png" } });
    }
    if (String(url).endsWith("/images/edits")) return json(500, { error: { message: "overloaded sk-test-openai" } });
    if (String(url).endsWith("/seedream.png")) {
      return new Response(new Uint8Array(portrait), { status: 200, headers: { "Content-Type": "image/png" } });
    }
    return json(200, { data: [{ url: "https://cdn.example/seedream.png" }] });
  };
  const cast = createCastAdapter({ CAST_MOCK: "0" });
  const ref = await cast.createReference({
    castId: "mini",
    name: "Mini",
    identityText: "curious girl",
    anchorUrl: "https://cdn.example/mini.png",
  });
  const root = mkdtempSync(join(tmpdir(), "chotu-seedream-"));
  const images = createStudioImageGen(
    {
      IMAGE_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test-openai",
      ARK_API_KEY: "ark-test-key",
      PUBLIC_BASE_URL: "http://studio.test",
      MEDIA_ROOT: root,
    },
    { cast, fetch },
  );
  const image = await images.generate({
    prompt: "waves",
    elementIds: [ref.higgsfieldElementId],
    aspectRatio: "9:16",
    resolution: "720p",
  });
  assert.equal(image.provider, "ark");
  assert.equal(image.model, "seedream-5-0-260128");
  assert.equal(image.providerLabel, "Seedream 5.0 · BytePlus");
  assert.match(image.url, /^http:\/\/studio\.test\/media\/images\/.+\.png$/);
  const edits = calls.filter((call) => call.url.endsWith("/images/edits"));
  assert.equal(edits.length, 2);
  const form = edits[0]?.init?.body as FormData;
  assert.equal(form.get("model"), "gpt-image-2");
  assert.equal(form.get("size"), "1024x1536");
  const ark = calls.find((call) => call.url.includes("bytepluses.com"));
  assert.ok(ark);
  const body = JSON.parse(String(ark.init?.body));
  assert.equal(body.model, "seedream-5-0-260128");
  assert.equal(body.size, "1440x2560");
  assert.equal(body.watermark, false);
  assert.deepEqual(body.image, ["https://cdn.example/mini.png"]);
  const id = image.url.split("/").pop()?.replace(/\.png$/, "");
  const meta = await sharp(readFileSync(join(root, "images", `${id}.png`))).metadata();
  assert.equal(meta.width, 720);
  assert.equal(meta.height, 1280);
  assert.equal(JSON.stringify(image).includes("ark-test-key"), false);
  assert.equal(JSON.stringify(image).includes("sk-test-openai"), false);
});

test("an OpenAI error does not echo the key when Seedream is unavailable", async () => {
  let calls = 0;
  const fetch: FetchLike = async () => {
    calls += 1;
    return json(401, { error: { message: "rejected sk-test-openai" } });
  };
  const images = createStudioImageGen({ IMAGE_PROVIDER: "openai", OPENAI_API_KEY: "sk-test-openai" }, { fetch });
  const job = await images.submit({
    prompt: "rooftop",
    elementIds: [],
    aspectRatio: "9:16",
    resolution: "720p",
  });
  assert.equal(calls, 2);
  assert.equal(job.status, "failed");
  assert.equal(job.provider, "openai");
  assert.equal((job.error ?? "").includes("sk-test-openai"), false);
});

test("Seedance 2.5 sends the approved still as first_frame and reads video_url", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const sleeps: number[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init });
    if (init?.method === "POST") return json(200, { id: "task-1" });
    return json(200, {
      id: "task-1",
      status: "succeeded",
      content: { video_url: "https://cdn.example/clip.mp4" },
    });
  };
  const clips = createStudioClipGen(
    { ARK_API_KEY: "ark-test-key", CLIP_RESOLUTION: "720p" },
    {
      fetch,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
      random: () => 0,
    },
  );
  const clip = await clips.generate({
    imageUrl: "https://cdn.example/frame.png",
    videoPrompt: "gentle pan",
    elementIds: [],
    durationMs: 5000,
    aspectRatio: "9:16",
  });
  assert.equal(clip.provider, "ark");
  assert.equal(clip.model, "dreamina-seedance-2-5-260628");
  assert.equal(clip.providerLabel, "Seedance 2.5 · BytePlus");
  assert.equal(clip.url, "https://cdn.example/clip.mp4");
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.equal(body.model, "dreamina-seedance-2-5-260628");
  assert.equal("ratio" in body, false);
  assert.equal(body.duration, 5);
  assert.equal(body.resolution, "720p");
  assert.equal(body.generate_audio, false);
  assert.equal(body.content[0].text, "gentle pan");
  assert.equal(String(body.content[0].text).includes("--ratio"), false);
  assert.equal(body.content[1].role, "first_frame");
  assert.deepEqual(body.content[1].image_url, { url: "https://cdn.example/frame.png" });
  assert.match(calls[1]?.url ?? "", /\/contents\/generations\/tasks\/task-1$/);
  assert.ok((sleeps[0] ?? 0) >= 8000);
});

test("a stored first frame is inlined and ratio is omitted", async () => {
  const root = mkdtempSync(join(tmpdir(), "chotu-frame-"));
  const png = await sharp({
    create: { width: 8, height: 16, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer();
  const imageUrl = await savePng(
    { MEDIA_ROOT: root, PUBLIC_BASE_URL: "http://127.0.0.1:9" },
    "frame1",
    png,
  );
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init });
    if (init?.method === "POST") return json(200, { id: "task-2", status: "succeeded", content: { video_url: "https://cdn.example/v.mp4" } });
    return json(200, { id: "task-2", status: "succeeded", content: { video_url: "https://cdn.example/v.mp4" } });
  };
  const clips = createStudioClipGen(
    { ARK_API_KEY: "ark-test-key", MEDIA_ROOT: root, PUBLIC_BASE_URL: "http://127.0.0.1:9" },
    { fetch, sleep: async () => undefined, random: () => 0 },
  );
  await clips.generate({
    imageUrl,
    videoPrompt: "hold",
    elementIds: [],
    durationMs: 5000,
    aspectRatio: "9:16",
  });
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.equal("ratio" in body, false);
  assert.equal(body.generate_audio, false);
  assert.equal(String(body.content[0].text).includes("--ratio"), false);
  assert.match(body.content[1].image_url.url, /^data:image\/png;base64,/);
});

test("model JSON fences are stripped and a 5s line stays near 15 words", () => {
  assert.deepEqual(parseModelJson('```json\n{"title":"A","voiceover":"hi"}\n```'), {
    title: "A",
    voiceover: "hi",
  });
  assert.match(SCRIPT_TASK, /15 words/);
});

test("a blank IMAGE_PROVIDER calls gpt-image-2 even when an Ark key is set", async () => {
  const png = await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: { r: 20, g: 40, b: 60 } },
  })
    .png()
    .toBuffer();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init });
    return json(200, { data: [{ b64_json: png.toString("base64") }] });
  };
  const images = createStudioImageGen(
    { OPENAI_API_KEY: "sk-test-openai", ARK_API_KEY: "ark-test-key" },
    { fetch },
  );
  const image = await images.generate({
    prompt: "rooftop",
    elementIds: [],
    aspectRatio: "9:16",
    resolution: "720p",
  });
  assert.equal(image.provider, "openai");
  assert.equal(image.model, "gpt-image-2");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "https://api.openai.com/v1/images/generations");
  assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), "Bearer sk-test-openai");
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.equal(body.model, "gpt-image-2");
  assert.equal(body.size, "1024x1536");
  assert.equal(body.n, 1);
  assert.equal(calls.some((call) => call.url.includes("bytepluses.com")), false);
  assert.equal(JSON.stringify(body).includes("ark-test-key"), false);
});

test("explicit mock mode stays on sample ports; live mode requires credentials", () => {
  const mocked = createMediaPorts({ MOCK: "1", OPENAI_API_KEY: "sk-test-openai", ARK_API_KEY: "ark-test-key" });
  assert.equal(mocked.images.mode, "mock");
  assert.equal(mocked.clips.mode, "mock");
  assert.equal(mocked.voice.mode, "mock");
  assert.equal(createStudioImageGen({}).mode, "mock");
  assert.equal(createStudioImageGen({ ARK_API_KEY: "ark-test-key" }).mode, "mock");
  assert.equal(createStudioClipGen({ OPENAI_API_KEY: "sk-test-openai" }).mode, "mock");
  assert.equal(createStudioClipGen({ ARK_API_KEY: "ark-test-key" }).mode, "live");
  assert.equal(createVoiceGen({ ELEVENLABS_API_KEY: "el-test" }).mode, "live");
  assert.equal(VOICE_PRESETS.length, 11);
  assert.equal(VOICE_PRESETS.every((preset) => preset.model === "eleven_multilingual_v2"), true);
  assert.equal(VOICE_PRESETS[0]?.voiceId, "FZkK3TvQ0pjyDmT8fzIW");
  assert.equal(VOICE_PRESETS[2]?.gender, "neutral");
});
