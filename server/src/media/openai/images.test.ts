import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import type { FetchLike } from "../ark/client.js";
import { generateOpenAiImage } from "./images.js";

test("image edits use image for one reference and image[] for more", async () => {
  const png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: { r: 8, g: 16, b: 24 } },
  })
    .png()
    .toBuffer();
  const anchor = `data:image/png;base64,${png.toString("base64")}`;
  const forms: FormData[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    assert.match(String(url), /\/images\/edits$/);
    if (init?.body instanceof FormData) forms.push(init.body);
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  const env = {
    OPENAI_API_KEY: "sk-test-openai",
    MEDIA_ROOT: mkdtempSync(join(tmpdir(), "chotu-image-fields-")),
    PUBLIC_BASE_URL: "http://studio.test",
  };
  const input = {
    prompt: "rooftop",
    elementIds: [] as string[],
    aspectRatio: "9:16",
    resolution: "720p" as const,
  };
  await generateOpenAiImage(
    env,
    input,
    { prompt: "one kid", anchorUrls: [anchor], elementIds: [], unresolvedIds: [] },
    fetchImpl,
  );
  await generateOpenAiImage(
    env,
    input,
    { prompt: "two kids", anchorUrls: [anchor, anchor], elementIds: [], unresolvedIds: [] },
    fetchImpl,
  );

  assert.equal(forms.length, 2);
  assert.deepEqual(fieldNames(forms[0], "image", "image[]"), ["image"]);
  assert.equal(forms[0].getAll("image").length, 1);
  assert.equal(forms[0].getAll("image[]").length, 0);
  assert.deepEqual(fieldNames(forms[1], "image", "image[]"), ["image[]", "image[]"]);
  assert.equal(forms[1].getAll("image").length, 0);
  assert.equal(forms[1].getAll("image[]").length, 2);
});

function fieldNames(form: FormData, ...wanted: string[]): string[] {
  return [...form.keys()].filter((name) => wanted.includes(name));
}
