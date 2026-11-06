import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import sharp from "sharp";
import type { CastMember } from "../../../../packages/shared/types.ts";
import type { FetchLike } from "../ark/client.js";
import { generateCharacterSheet } from "../openai/images.js";
import { createStudioImageGen } from "../studio.js";
import {
  characterSheetPrompt,
  includeCastReferences,
  MAX_SCENE_SHEETS,
  preferredCastImage,
  sceneCastReference,
} from "./sheet.js";

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
    visualStyle: "soft watercolor",
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
    assert.match(body.prompt, /CHARACTER SHEET — professional model\/reference sheet/);
    assert.match(body.prompt, /front view, 3\/4 view, side profile, back view/);
    assert.match(body.prompt, /VISUAL STYLE: soft watercolor/);
    assert.match(body.prompt, /SUBJECT: (asha|bala), hero\. Look: (Asha wears a red cap|Bala wears a blue scarf)\. DNA:/);
    assert.match(body.prompt, /No text, no captions, no labels\./);
    assert.equal(/happy|surprised|thinking|use this face/.test(body.prompt), false);
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
  assert.equal(form.getAll("image[]").length, 2);
  assert.equal(form.getAll("image").length, 0);
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

test("an approved sheet is sent even when the prompt only has the anchor", () => {
  const asha = member("asha", "Asha wears a red cap");
  asha.sheetUrl = "http://studio.test/old-sheet.png";
  asha.anchorUrl = "http://studio.test/old-anchor.png";
  const prepared = preferredCastImage(asha, [
    { kind: "sheet", castId: "asha", url: "http://studio.test/draft-sheet.png", state: "awaiting_approval" },
    { kind: "sheet", castId: "asha", url: "http://studio.test/approved-sheet.png", state: "approved" },
    { kind: "anchor", castId: "asha", url: "http://studio.test/approved-anchor.png", state: "approved" },
  ]);
  assert.equal(prepared.sheetUrl, "http://studio.test/approved-sheet.png");
  assert.equal(prepared.anchorUrl, "http://studio.test/approved-anchor.png");
  const applied = includeCastReferences(
    ["ref:" + encodeURIComponent("http://studio.test/approved-anchor.png")],
    [prepared, member("narrator", "a warm storyteller", "narrator")],
  );
  assert.deepEqual(applied.references, ["sheet", "anchor"]);
  assert.deepEqual(
    applied.elementIds.map((id) => decodeURIComponent(id.slice("ref:".length))),
    ["http://studio.test/approved-sheet.png", "http://studio.test/approved-anchor.png"],
  );
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

test("characterSheetPrompt uses four blocks and at most six dna chips", () => {
  const prompt = characterSheetPrompt(
    {
      name: "Asha",
      role: "hero",
      identityText: "Asha wears a red cap",
      dnaChips: ["one", "two", "three", "four", "five", "six", "seven"],
      artStyle: "flat colour",
    },
    "Bright 2D cartoon · bold outlines",
  );
  assert.match(prompt, /^CHARACTER SHEET — professional model\/reference sheet/);
  assert.match(prompt, /close-up detail panels \(face\/key features, materials\/textures, signature props\)/);
  assert.match(prompt, /Neutral background, even lighting, no scene\./);
  assert.match(prompt, /VISUAL STYLE: Bright 2D cartoon · bold outlines/);
  assert.match(
    prompt,
    /SUBJECT: Asha, hero\. Look: Asha wears a red cap\. DNA: one · two · three · four · five · six/,
  );
  assert.equal(prompt.includes("seven"), false);
  assert.match(prompt, /No text, no captions, no labels\./);
  assert.equal(/expression|happy|surprised/.test(prompt), false);
  const anchored = characterSheetPrompt(
    { name: "Asha", role: "hero", identityText: "Asha wears a red cap", dnaChips: ["red cap"] },
    undefined,
    true,
  );
  assert.match(anchored, /use this face; draw a new multi-view sheet/);
  assert.match(anchored, /VISUAL STYLE: the video's look/);
});

test("a stored face anchor still generates the sheet from text", async () => {
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 12, g: 24, b: 36 } },
  })
    .png()
    .toBuffer();
  const calls: string[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push(String(url));
    assert.equal(init?.body instanceof FormData, false);
    const body = JSON.parse(String(init?.body));
    assert.equal(body.size, "1536x1024");
    assert.match(body.prompt, /SUBJECT: Asha, hero/);
    assert.equal(String(body.prompt).includes("use this face"), false);
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const referenced = await sceneCastReference(
    {
      OPENAI_API_KEY: "sk-test-openai",
      MEDIA_ROOT: mkdtempSync(join(tmpdir(), "chotu-sheet-anchor-")),
      PUBLIC_BASE_URL: "http://studio.test",
    },
    [{ ...member("Asha", "Asha wears a red cap"), anchorUrl: "https://cdn.example/face.png" }],
    "rooftop",
    { fetch: fetchImpl, visualStyle: "clean product studio" },
  );
  assert.deepEqual(calls, ["https://api.openai.com/v1/images/generations"]);
  assert.equal(referenced.elementIds.length, 1);
});

test("an edits sheet says to use the face and draw a new multi-view sheet", async () => {
  const png = await sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: 1, g: 2, b: 3 } },
  })
    .png()
    .toBuffer();
  const anchor = `data:image/png;base64,${png.toString("base64")}`;
  let prompt = "";
  const fetchImpl: FetchLike = async (url, init) => {
    assert.match(String(url), /\/images\/edits$/);
    assert.ok(init?.body instanceof FormData);
    prompt = String((init.body as FormData).get("prompt"));
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  await generateCharacterSheet(
    {
      OPENAI_API_KEY: "sk-test-openai",
      MEDIA_ROOT: mkdtempSync(join(tmpdir(), "chotu-sheet-edit-")),
      PUBLIC_BASE_URL: "http://studio.test",
    },
    {
      prompt: characterSheetPrompt(member("Asha", "Asha wears a red cap"), "ink line"),
      anchorUrl: anchor,
    },
    fetchImpl,
  );
  assert.match(prompt, /use this face; draw a new multi-view sheet/);
  assert.match(prompt, /VISUAL STYLE: ink line/);
});

test("scene refs put at most four sheets first and still keep a later anchor", async () => {
  const cast = ["a", "b", "c", "d", "e"].map((id) => {
    const person = member(id, `${id} wears a hat`);
    person.anchorUrl = `http://studio.test/${id}-anchor.png`;
    return person;
  });
  const referenced = await sceneCastReference(
    { MOCK: "1", PUBLIC_BASE_URL: "http://studio.test" },
    cast,
    "kitchen",
    {},
    ["https://cdn.example/extra.png"],
  );
  assert.equal(MAX_SCENE_SHEETS, 4);
  const sheets = referenced.elementIds.slice(0, 4).map((id) => decodeURIComponent(id.slice("ref:".length)));
  assert.match(sheets[0] ?? "", /cast=a$/);
  assert.match(sheets[3] ?? "", /cast=d$/);
  assert.equal(sheets.some((id) => id.includes("cast=e")), false);
  assert.equal(referenced.elementIds[4], "https://cdn.example/extra.png");
  assert.match(referenced.prompt, /e wears a hat/);
  const applied = includeCastReferences(referenced.elementIds, cast);
  assert.deepEqual(applied.references, ["sheet", "anchor"]);
  const urls = applied.elementIds.map((id) => decodeURIComponent(id.slice("ref:".length)));
  assert.equal(urls.filter((url) => url.includes("keyframe.png")).length, 4);
  assert.equal(urls.filter((url) => url.endsWith("-anchor.png")).length, 5);
  assert.ok(urls.indexOf(urls.find((url) => url.includes("keyframe.png"))!) < urls.indexOf(urls.find((url) => url.endsWith("-anchor.png"))!));
});
