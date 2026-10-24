import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { ImageGenInput } from "../../../../packages/shared/types.ts";
import type { ResolvedCastPrompt } from "../cast/reference.js";
import type { EnvLike } from "../flags.js";
import { mediaRoot, savePng } from "../files.js";
import type { FetchLike } from "../ark/client.js";

export const OPENAI_API_BASE = "https://api.openai.com/v1";
export const OPENAI_IMAGE_MODEL = "gpt-image-2";
/** gpt-image-2 portrait size (2:3). Cropped to 9:16 before image-to-video. */
export const OPENAI_IMAGE_SIZE = "1024x1536";
/** Landscape turnaround. Character sheets are stored as returned, not cropped to 9:16. */
export const OPENAI_SHEET_SIZE = "1536x1024";

export function openaiImageModel(env: EnvLike): string {
  return env.OPENAI_IMAGE_MODEL?.trim() || OPENAI_IMAGE_MODEL;
}

/** Portrait frame Seedance follows. 720x1280 is 9:16 at 720p. */
export const PORTRAIT_WIDTH = 720;
export const PORTRAIT_HEIGHT = 1280;

/**
 * Center-crop a 1024x1536 still onto 9:16, then scale to 720x1280.
 * A 2:3 first frame makes Seedance emit a non-9:16 clip.
 */
export async function cropToNineSixteen(bytes: Buffer): Promise<Buffer> {
  const meta = await sharp(bytes).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (!width || !height) throw new Error("openai image has no dimensions");
  const target = 9 / 16;
  const current = width / height;
  let cropW = width;
  let cropH = height;
  let left = 0;
  let top = 0;
  if (current > target + 0.001) {
    cropH = height;
    cropW = Math.round((height * 9) / 16);
    cropW -= cropW % 2;
    left = Math.max(0, Math.floor((width - cropW) / 2));
  } else if (current < target - 0.001) {
    cropW = width;
    cropH = Math.round((width * 16) / 9);
    cropH -= cropH % 2;
    top = Math.max(0, Math.floor((height - cropH) / 2));
  }
  if (left + cropW > width) cropW = width - left;
  if (top + cropH > height) cropH = height - top;
  return sharp(bytes)
    .extract({ left, top, width: cropW, height: cropH })
    .resize(PORTRAIT_WIDTH, PORTRAIT_HEIGHT, { fit: "fill" })
    .png()
    .toBuffer();
}

function scrub(message: string, secret: string): string {
  return secret ? message.split(secret).join("[redacted]") : message;
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function failText(payload: Record<string, unknown>, status: number): string {
  const error = payload.error;
  if (typeof error === "object" && error !== null) {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === "string" && message.trim()) return message.trim().slice(0, 300);
  }
  return `request failed (${status})`;
}

function localMediaImage(env: EnvLike, imageUrl: string): string | undefined {
  let pathname = imageUrl;
  if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
    try {
      pathname = new URL(imageUrl).pathname;
    } catch {
      return undefined;
    }
  }
  const match = pathname.match(/\/media\/images\/([A-Za-z0-9_-]+)\.png$/);
  if (!match?.[1]) return undefined;
  const file = join(mediaRoot(env), "images", `${match[1]}.png`);
  return existsSync(file) ? file : undefined;
}

/** Bytes for an edits reference: data URL, a PNG this server stored, or an HTTP fetch. */
export async function readImageBytes(
  env: EnvLike,
  url: string,
  fetchImpl: FetchLike,
): Promise<{ bytes: Buffer; type: string }> {
  const trimmed = url.trim();
  const data = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(trimmed);
  if (data) {
    const type = data[1] || "image/png";
    const bytes = data[2]
      ? Buffer.from(data[3].replace(/\s/g, ""), "base64")
      : Buffer.from(decodeURIComponent(data[3]));
    return { bytes, type };
  }
  const file = localMediaImage(env, trimmed);
  if (file) return { bytes: await readFile(file), type: "image/png" };
  if (trimmed.startsWith("/") && existsSync(trimmed)) {
    return { bytes: await readFile(trimmed), type: "image/png" };
  }
  const response = await fetchImpl(trimmed);
  if (!response.ok) throw new Error(`openai could not read cast anchor (${response.status})`);
  return {
    bytes: Buffer.from(await response.arrayBuffer()),
    type: response.headers.get("content-type") || "image/png",
  };
}

/** http(s), data, or a local still. Preset element ids are not images. */
export function usableAnchorUrl(env: EnvLike, url: string | undefined): string | undefined {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return undefined;
  if (trimmed.startsWith("data:image/")) return trimmed;
  if (localMediaImage(env, trimmed)) return trimmed;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.startsWith("/") && existsSync(trimmed)) return trimmed;
  return undefined;
}

async function postImage(
  env: EnvLike,
  fetchImpl: FetchLike,
  prompt: string,
  size: string,
  anchorUrls: readonly string[] = [],
): Promise<Buffer> {
  const key = env.OPENAI_API_KEY?.trim() ?? "";
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const base = (env.OPENAI_API_BASE?.trim() || OPENAI_API_BASE).replace(/\/$/, "");
  const model = openaiImageModel(env);
  let response: Response;
  if (anchorUrls.length > 0) {
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", prompt);
    form.set("size", size);
    // One reference stays `image`. Two or more must be `image[]` or OpenAI
    // rejects the multipart body as a duplicate `image` parameter.
    const imageField = anchorUrls.length > 1 ? "image[]" : "image";
    for (const [index, url] of anchorUrls.entries()) {
      const image = await readImageBytes(env, url, fetchImpl);
      form.append(imageField, new Blob([new Uint8Array(image.bytes)], { type: image.type }), `anchor-${index}.png`);
    }
    response = await fetchImpl(`${base}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } else {
    response = await fetchImpl(`${base}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, prompt, size, n: 1 }),
    });
  }
  const payload = await readJson(response);
  if (!response.ok) throw new Error(scrub(`openai ${response.status}: ${failText(payload, response.status)}`, key));
  const data = Array.isArray(payload.data) ? payload.data[0] : undefined;
  const row = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  if (typeof row.b64_json === "string" && row.b64_json) return Buffer.from(row.b64_json, "base64");
  if (typeof row.url === "string" && row.url) {
    const fetched = await readImageBytes(env, row.url, fetchImpl);
    return fetched.bytes;
  }
  throw new Error("openai image result missing image");
}

/** Turnaround sheet. Same model as scene stills, landscape size, no 9:16 crop. */
export async function generateCharacterSheet(
  env: EnvLike,
  input: { prompt: string; anchorUrl?: string },
  fetchImpl: FetchLike,
): Promise<string> {
  const anchor = input.anchorUrl?.trim();
  const bytes = await postImage(env, fetchImpl, input.prompt.trim(), OPENAI_SHEET_SIZE, anchor ? [anchor] : []);
  return savePng(env, randomUUID(), bytes);
}

export async function generateOpenAiImage(
  env: EnvLike,
  input: ImageGenInput,
  resolved: ResolvedCastPrompt,
  fetchImpl: FetchLike,
): Promise<string> {
  const prompt = resolved.prompt.trim() || input.prompt.trim();
  const bytes = await postImage(env, fetchImpl, prompt, OPENAI_IMAGE_SIZE, resolved.anchorUrls);
  return savePng(env, randomUUID(), await cropToNineSixteen(bytes));
}
