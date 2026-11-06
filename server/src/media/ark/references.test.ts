import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import type { FetchLike } from "./client.js";
import { prepareArkImages, referenceKind } from "./references.js";
import { savePng } from "../files.js";

test("reference bytes identify png, jpeg, webp, and html", async () => {
  const png = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } } }).png().toBuffer();
  const jpeg = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } } }).jpeg().toBuffer();
  const webp = await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 1, g: 2, b: 3 } } }).webp().toBuffer();
  assert.equal(referenceKind(png), "png");
  assert.equal(referenceKind(jpeg), "jpeg");
  assert.equal(referenceKind(webp), "webp");
  assert.equal(referenceKind(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), "html");
  assert.equal(referenceKind(Buffer.from("<!doctype html><html></html>")), "html");
});

test("studio stills and webp become png data urls; a remote png stays https", async () => {
  const png = await sharp({ create: { width: 6, height: 8, channels: 3, background: { r: 9, g: 8, b: 7 } } }).png().toBuffer();
  const webp = await sharp({ create: { width: 6, height: 8, channels: 3, background: { r: 4, g: 5, b: 6 } } }).webp().toBuffer();
  const root = mkdtempSync(join(tmpdir(), "chotu-ark-ref-"));
  const env = { MEDIA_ROOT: root, PUBLIC_BASE_URL: "https://studio.test" };
  const stored = await savePng(env, "sheet1", png);
  const fetchImpl: FetchLike = async (url) => {
    const target = String(url);
    if (target.endsWith(".webp") || target.startsWith("data:image/webp")) {
      return new Response(new Uint8Array(webp), { status: 200, headers: { "Content-Type": "image/webp" } });
    }
    if (target.endsWith("/remote.png")) {
      return new Response(new Uint8Array(png), { status: 200, headers: { "Content-Type": "image/png" } });
    }
    if (target.endsWith("/gone.png")) return new Response("missing", { status: 404 });
    return new Response("<!doctype html>", { status: 200, headers: { "Content-Type": "text/html" } });
  };
  const images = await prepareArkImages(
    env,
    [
      stored,
      "https://cdn.example/remote.png",
      `data:image/webp;base64,${webp.toString("base64")}`,
      "https://cdn.example/page",
      "https://cdn.example/gone.png",
    ],
    fetchImpl,
  );
  assert.equal(images.length, 3);
  assert.match(images[0] ?? "", /^data:image\/png;base64,/);
  assert.equal(images[1], "https://cdn.example/remote.png");
  assert.match(images[2] ?? "", /^data:image\/png;base64,/);
  for (const image of images) {
    if (!image.startsWith("data:")) continue;
    const decoded = Buffer.from(image.slice("data:image/png;base64,".length), "base64");
    assert.equal(referenceKind(decoded), "png");
  }
});
