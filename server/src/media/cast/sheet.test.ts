import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import type { CastMember } from "../../../../packages/shared/types.ts";
import type { FetchLike } from "../ark/client.js";
import { createStudioImageGen } from "../studio.js";
import { sceneCastReference } from "./sheet.js";

function member(id: string, identityText: string, role: CastMember["role"] = "hero"): CastMember {
  return {
    id,
    name: id,
    role,
    identityText,
    dnaChips: [],
    version: 1,
    status: "approved",
    isPreset: true,
  };
}

test("a scene image edits with every cast sheet and the next scene reuses them", async () => {
  const png = await sharp({
    create: { width: 1024, height: 1536, channels: 3, background: { r: 12, g: 24, b: 36 } },
  })
    .png()
    .toBuffer();
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const root = mkdtempSync(join(tmpdir(), "chotu-sheet-"));
  const env = {
    OPENAI_API_KEY: "sk-test-openai",
    MEDIA_ROOT: root,
    PUBLIC_BASE_URL: "http://studio.test",
  };
  const saved: Record<string, string> = {};
  const cast = [
    member("asha", "Asha wears a red cap"),
    member("bala", "Bala wears a blue scarf"),
    member("narrator", "a warm storyteller", "narrator"),
  ];
  const first = await sceneCastReference(env, cast, "rooftop at dusk", {
    fetch: fetchImpl,
    saveSheet: async (id, url) => {
      saved[id] = url;
    },
  });
  assert.deepEqual(Object.keys(saved).sort(), ["asha", "bala"]);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.url, "https://api.openai.com/v1/images/generations");
    assert.equal(new Headers(call.init?.headers).get("authorization"), "Bearer sk-test-openai");
    const body = JSON.parse(String(call.init?.body));
    assert.equal(body.model, "gpt-image-2");
    assert.equal(body.size, "1536x1024");
    assert.equal(body.n, 1);
    assert.match(body.prompt, /turnaround/);
    assert.match(body.prompt, /neutral, happy, surprised, and thinking/);
    assert.equal(JSON.stringify(body).includes("sk-test-openai"), false);
  }
  assert.match(first.prompt, /Asha wears a red cap/);
  assert.match(first.prompt, /Bala wears a blue scarf/);
  assert.equal(first.prompt.includes("a warm storyteller"), false);
  assert.equal(first.elementIds.length, 2);
  for (const id of first.elementIds) {
    assert.match(decodeURIComponent(id.slice("ref:".length)), /^http:\/\/studio\.test\/media\/images\/.+\.png$/);
  }
  const sheetName = decodeURIComponent(first.elementIds[0].slice("ref:".length)).split("/").pop() ?? "";
  const sheetMeta = await sharp(readFileSync(join(root, "images", sheetName))).metadata();
  assert.equal(sheetMeta.width, 1024);
  assert.equal(sheetMeta.height, 1536);

  const images = createStudioImageGen(env, { fetch: fetchImpl });
  const image = await images.generate({
    prompt: first.prompt,
    elementIds: first.elementIds,
    aspectRatio: "9:16",
    resolution: "720p",
  });
  assert.equal(image.provider, "openai");
  const edit = calls.find((call) => call.url.endsWith("/images/edits"));
  assert.ok(edit);
  assert.equal(new Headers(edit?.init?.headers).get("authorization"), "Bearer sk-test-openai");
  assert.ok(edit?.init?.body instanceof FormData);
  const form = edit?.init?.body as FormData;
  assert.equal(form.get("model"), "gpt-image-2");
  assert.equal(form.get("size"), "1024x1536");
  assert.equal(form.getAll("image").length, 2);
  assert.match(String(form.get("prompt")), /Asha wears a red cap/);
  assert.match(String(form.get("prompt")), /Bala wears a blue scarf/);
  assert.equal(calls.some((call) => call.url.includes("studio.test")), false);
  const still = image.url.split("/").pop() ?? "";
  const stillMeta = await sharp(readFileSync(join(root, "images", still))).metadata();
  assert.equal(stillMeta.width, 720);
  assert.equal(stillMeta.height, 1280);

  const before = calls.length;
  let savedAgain = false;
  const second = await sceneCastReference(env, cast, "the same kids in the kitchen", {
    fetch: fetchImpl,
    saveSheet: async () => {
      savedAgain = true;
    },
  });
  assert.equal(savedAgain, false);
  assert.equal(calls.length, before);
  assert.deepEqual(second.elementIds, first.elementIds);
});

test("mock sheets are distinct refs and do not call OpenAI", async () => {
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url) => {
    calls.push(String(url));
    throw new Error("openai should not be called");
  };
  const cast = [member("asha", "Asha wears a red cap"), member("bala", "Bala wears a blue scarf")];
  const referenced = await sceneCastReference(
    { MOCK: "1", PUBLIC_BASE_URL: "http://studio.test" },
    cast,
    "rooftop",
    { fetch: fetchImpl },
  );
  assert.equal(calls.length, 0);
  assert.equal(referenced.elementIds.length, 2);
  assert.match(decodeURIComponent(referenced.elementIds[0].slice(4)), /keyframe\.png\?cast=asha/);
  assert.match(decodeURIComponent(referenced.elementIds[1].slice(4)), /keyframe\.png\?cast=bala/);
  assert.match(referenced.prompt, /Asha wears a red cap/);
  const images = createStudioImageGen({ MOCK: "1" });
  const image = await images.generate({
    prompt: referenced.prompt,
    elementIds: referenced.elementIds,
    aspectRatio: "9:16",
    resolution: "720p",
  });
  assert.equal(image.provider, "mock");
  assert.equal(calls.length, 0);
});
