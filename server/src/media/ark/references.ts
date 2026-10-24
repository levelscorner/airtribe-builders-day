import sharp from "sharp";
import type { EnvLike } from "../flags.js";
import { localMediaImage, readImageBytes } from "../openai/images.js";
import type { FetchLike } from "./client.js";

/** Bytes Ark/Seedream will accept as a reference image. */
export function referenceKind(bytes: Buffer): "png" | "jpeg" | "webp" | "html" | "other" {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  const head = bytes.subarray(0, 120).toString("utf8").trimStart().toLowerCase();
  if (
    head.startsWith("<!doctype") ||
    head.startsWith("<html") ||
    head.startsWith("<svg") ||
    head.startsWith("<?xml") ||
    head.startsWith("<head")
  ) {
    return "html";
  }
  return "other";
}

/**
 * References Seedream can use. A remote https PNG or JPEG is left as a URL.
 * WebP, SVG, and every other decodable image become `data:image/png;base64`.
 * Studio files are inlined the same way, because BytePlus cannot fetch this host.
 * HTML, redirects to HTML, and undecodable bytes are omitted.
 */
export async function prepareArkImages(
  env: EnvLike,
  urls: readonly string[],
  fetchImpl: FetchLike,
): Promise<string[]> {
  const images: string[] = [];
  for (const url of urls) {
    const prepared = await prepareOne(env, url, fetchImpl);
    if (prepared && !images.includes(prepared)) images.push(prepared);
  }
  return images;
}

async function prepareOne(env: EnvLike, url: string, fetchImpl: FetchLike): Promise<string | undefined> {
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  let bytes: Buffer;
  let type = "";
  try {
    const read = await readImageBytes(env, trimmed, fetchImpl);
    bytes = read.bytes;
    type = read.type.toLowerCase();
  } catch {
    return undefined;
  }
  if (!bytes.length || type.includes("text/html")) return undefined;
  const kind = referenceKind(bytes);
  if (kind === "html") return undefined;
  const remoteHttps = trimmed.startsWith("https://") && !localMediaImage(env, trimmed);
  if (remoteHttps && (kind === "png" || kind === "jpeg")) return trimmed;
  const png = kind === "png" ? bytes : await toPng(bytes);
  if (!png || referenceKind(png) !== "png") return undefined;
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function toPng(bytes: Buffer): Promise<Buffer | undefined> {
  try {
    return await sharp(bytes, { failOn: "none" }).png().toBuffer();
  } catch {
    return undefined;
  }
}
