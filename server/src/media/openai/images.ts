import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { ImageGenInput } from "../../../../packages/shared/types.ts";
import type { ResolvedCastPrompt } from "../cast/reference.js";
import type { EnvLike } from "../flags.js";
import { savePng } from "../files.js";
import type { FetchLike } from "../ark/client.js";

export const OPENAI_API_BASE = "https://api.openai.com/v1";
export const OPENAI_IMAGE_MODEL = "gpt-image-2";
/** gpt-image-2 portrait size (2:3). Cropped to 9:16 before image-to-video. */
export const OPENAI_IMAGE_SIZE = "1024x1536";

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

export async function generateOpenAiImage(
  env: EnvLike,
  input: ImageGenInput,
  resolved: ResolvedCastPrompt,
  fetchImpl: FetchLike,
): Promise<string> {
  const key = env.OPENAI_API_KEY?.trim() ?? "";
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const base = (env.OPENAI_API_BASE?.trim() || OPENAI_API_BASE).replace(/\/$/, "");
  const model = openaiImageModel(env);
  const prompt = resolved.prompt.trim() || input.prompt.trim();
  let response: Response;
  if (resolved.anchorUrls.length > 0) {
    const form = new FormData();
    form.set("model", model);
    form.set("prompt", prompt);
    form.set("size", OPENAI_IMAGE_SIZE);
    for (const [index, url] of resolved.anchorUrls.entries()) {
      const anchor = await fetchImpl(url);
      if (!anchor.ok) throw new Error(`openai could not read cast anchor (${anchor.status})`);
      const type = anchor.headers.get("content-type") || "image/png";
      const bytes = Buffer.from(await anchor.arrayBuffer());
      form.append("image", new Blob([bytes], { type }), `anchor-${index}.png`);
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
      body: JSON.stringify({ model, prompt, size: OPENAI_IMAGE_SIZE, n: 1 }),
    });
  }
  const payload = await readJson(response);
  if (!response.ok) throw new Error(scrub(`openai ${response.status}: ${failText(payload, response.status)}`, key));
  const data = Array.isArray(payload.data) ? payload.data[0] : undefined;
  const row = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
  if (typeof row.b64_json === "string" && row.b64_json) {
    const cropped = await cropToNineSixteen(Buffer.from(row.b64_json, "base64"));
    return savePng(env, randomUUID(), cropped);
  }
  if (typeof row.url === "string" && row.url) {
    const fetched = await fetchImpl(row.url);
    if (!fetched.ok) throw new Error(`openai image url failed (${fetched.status})`);
    const cropped = await cropToNineSixteen(Buffer.from(await fetched.arrayBuffer()));
    return savePng(env, randomUUID(), cropped);
  }
  throw new Error("openai image result missing image");
}
