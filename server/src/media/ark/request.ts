import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ClipGenInput, ImageGenInput } from "../../../../packages/shared/types.ts";
import type { ResolvedCastPrompt } from "../cast/reference.js";
import { MediaInputError } from "../errors.js";
import type { EnvLike } from "../flags.js";
import { mediaRoot } from "../files.js";
import { clipResolution, clipSeconds } from "../higgsfield/request.js";
import { assertHttpUrl } from "../higgsfield/urls.js";

/** BytePlus ModelArk. International base checked against the create-task API. */
export const ARK_API_BASE = "https://ark.ap-southeast.bytepluses.com/api/v3";

export const ArkModels = {
  seedance25: "dreamina-seedance-2-5-260628",
  seedream: "seedream-5-0-260128",
} as const;

/**
 * Seedance 2.5 with a first_frame image must not send ratio or --ratio.
 * The output ratio follows the image (400 TaskTypeConstraint otherwise).
 * generate_audio stays false so ElevenLabs owns the voiceover.
 */
export function seedanceModel(env: EnvLike): string {
  return env.SEEDANCE_MODEL?.trim() || ArkModels.seedance25;
}

export function seedreamModel(env: EnvLike): string {
  return env.SEEDREAM_MODEL?.trim() || ArkModels.seedream;
}

/**
 * Smallest 9:16 size Seedream accepts. 720x1280 is 921_600 pixels and the API
 * rejects anything under 3_686_400. The studio downscales the result to 720x1280.
 */
export const SEEDREAM_PORTRAIT_SIZE = "1440x2560";

export function arkImageSize(aspect: string, resolution: string): string {
  const landscape = resolution === "1080p" ? "1920x1080" : "1280x720";
  switch (aspect.trim()) {
    case "16:9":
    case "4:3":
    case "3:2":
      return landscape;
    case "1:1":
      return "1024x1024";
    case "3:4":
      return resolution === "1080p" ? "1080x1440" : "768x1024";
    default:
      return SEEDREAM_PORTRAIT_SIZE;
  }
}

export function requirePrompt(resolved: ResolvedCastPrompt): string {
  if (resolved.unresolvedIds.length > 0) {
    throw new MediaInputError(`unknown cast reference: ${resolved.unresolvedIds.join(", ")}`);
  }
  const prompt = resolved.prompt.trim();
  if (!prompt) throw new MediaInputError("prompt is required");
  return prompt;
}

export function buildSeedreamBody(input: ImageGenInput, resolved: ResolvedCastPrompt, env: EnvLike): Record<string, unknown> {
  const prompt = requirePrompt(resolved);
  for (const url of resolved.anchorUrls) assertHttpUrl(url, "anchor url");
  const body: Record<string, unknown> = {
    model: seedreamModel(env),
    prompt,
    size: arkImageSize(input.aspectRatio, input.resolution),
    response_format: "url",
    watermark: false,
  };
  if (resolved.anchorUrls.length > 0) body.image = resolved.anchorUrls;
  return body;
}

const DATA_IMAGE = /^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=\s]+$/;

function localStill(env: EnvLike, imageUrl: string): string | undefined {
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

/**
 * BytePlus cannot fetch the studio host. A still we stored under /media/images
 * is sent as a data URL. Public http(s) URLs pass through.
 */
export async function seedanceFirstFrame(env: EnvLike, imageUrl: string): Promise<string> {
  const trimmed = imageUrl.trim();
  if (!trimmed) throw new MediaInputError("clip image url is required");
  if (trimmed.startsWith("data:")) {
    if (!DATA_IMAGE.test(trimmed)) throw new MediaInputError("clip image data url must be a png or jpeg");
    return trimmed;
  }
  const file = localStill(env, trimmed);
  if (file) {
    const bytes = await readFile(file);
    return `data:image/png;base64,${bytes.toString("base64")}`;
  }
  assertHttpUrl(trimmed, "clip image url");
  return trimmed;
}

export function buildSeedanceBody(input: ClipGenInput, prompt: string, env: EnvLike): Record<string, unknown> {
  const imageUrl = input.imageUrl?.trim() ?? "";
  if (!imageUrl) throw new MediaInputError("clip image url is required");
  if (imageUrl.startsWith("data:")) {
    if (!DATA_IMAGE.test(imageUrl)) throw new MediaInputError("clip image data url must be a png or jpeg");
  } else {
    assertHttpUrl(imageUrl, "clip image url");
  }
  const text = prompt.trim();
  if (text.includes("--ratio") || text.includes("--duration") || text.includes("--resolution")) {
    throw new MediaInputError("clip prompt must not include Seedance flag suffixes");
  }
  const content: Array<Record<string, unknown>> = [];
  if (text) content.push({ type: "text", text });
  content.push({
    type: "image_url",
    image_url: { url: imageUrl },
    role: "first_frame",
  });
  return {
    model: seedanceModel(env),
    content,
    duration: clipSeconds(input.durationMs),
    resolution: clipResolution(env.CLIP_RESOLUTION),
    generate_audio: false,
  };
}
