import type { ClipGenInput, ImageGenInput } from "../../../../packages/shared/types.ts";
import type { ResolvedCastPrompt } from "../cast/reference.js";
import { MediaInputError } from "../errors.js";

/**
 * Endpoint ids checked against docs.higgsfield.ai on 24 Oct 2026.
 * Qwen edit: https://docs.higgsfield.ai/docs/models/qwen-image-3/edit
 * Qwen text: https://docs.higgsfield.ai/docs/models/qwen-image-3/text-to-image
 * Seedance i2v: https://docs.higgsfield.ai/docs/models/seedance-2/image-to-video
 * Seedance r2v: https://docs.higgsfield.ai/docs/models/seedance-2/reference-to-video
 */
export const HF_API_BASE = "https://api.higgsfield.ai";

export const HfEndpoints = {
  qwenEdit: "alibaba/qwen-image-3/edit",
  qwenText: "alibaba/qwen-image-3/text-to-image",
  seedanceI2v: "bytedance/seedance-2.0/image-to-video",
  seedanceR2v: "bytedance/seedance-2.0/reference-to-video",
} as const;

const QWEN_ASPECTS = new Set([
  "1:1",
  "2:3",
  "3:2",
  "3:4",
  "4:3",
  "7:9",
  "9:7",
  "9:16",
  "16:9",
  "21:9",
]);

const SEEDANCE_ASPECTS = new Set(["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"]);

const CLIP_RESOLUTIONS = new Set(["480p", "720p", "1080p", "4k"]);

export const QWEN_MAX_REFERENCES = 3;
export const SEEDANCE_MAX_REFERENCES = 9;

export interface HiggsfieldSubmission {
  endpoint: string;
  body: Record<string, unknown>;
}

export function qwenResolution(resolution: string): "1k" | "2k" {
  return resolution === "1080p" ? "2k" : "1k";
}

export function qwenAspect(aspect: string): string {
  const value = aspect.trim();
  return QWEN_ASPECTS.has(value) ? value : "9:16";
}

export function seedanceAspect(aspect: string): string {
  const value = aspect.trim();
  return SEEDANCE_ASPECTS.has(value) ? value : "9:16";
}

/** Seedance duration is integer seconds, 4–15, default 5. */
export function clipSeconds(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 5;
  return Math.min(15, Math.max(4, Math.round(durationMs / 1000)));
}

export function clipResolution(value: string | undefined): string {
  const tier = value?.trim() ?? "";
  return CLIP_RESOLUTIONS.has(tier) ? tier : "720p";
}

function requireResolved(resolved: ResolvedCastPrompt): void {
  if (resolved.unresolvedIds.length > 0) {
    throw new MediaInputError(`unknown cast reference: ${resolved.unresolvedIds.join(", ")}`);
  }
}

export function buildImageSubmission(input: ImageGenInput, resolved: ResolvedCastPrompt): HiggsfieldSubmission {
  if (!input.prompt?.trim()) throw new MediaInputError("prompt is required");
  requireResolved(resolved);
  if (!resolved.prompt.trim()) throw new MediaInputError("prompt is required");
  if (resolved.anchorUrls.length > QWEN_MAX_REFERENCES) {
    throw new MediaInputError(
      `qwen image edit accepts at most ${QWEN_MAX_REFERENCES} reference images`,
    );
  }

  // Thinking mode rewrites the prompt. Keep the identity paragraph as written.
  const body: Record<string, unknown> = {
    prompt: resolved.prompt,
    resolution: qwenResolution(input.resolution),
    aspect_ratio: qwenAspect(input.aspectRatio),
    prompt_extend: false,
    enable_thinking: false,
  };

  if (resolved.anchorUrls.length > 0) {
    body.image_urls = resolved.anchorUrls;
    return { endpoint: HfEndpoints.qwenEdit, body };
  }
  return { endpoint: HfEndpoints.qwenText, body };
}

export interface ClipBuildOptions {
  resolution?: string;
}

export function buildClipSubmission(
  input: ClipGenInput,
  resolved: ResolvedCastPrompt,
  options: ClipBuildOptions = {},
): HiggsfieldSubmission {
  const imageUrl = input.imageUrl?.trim() ?? "";
  if (!imageUrl) throw new MediaInputError("clip image url is required");
  requireResolved(resolved);

  const duration = clipSeconds(input.durationMs);
  const resolution = clipResolution(options.resolution);
  const prompt = resolved.prompt.trim();
  const multi = resolved.elementIds.length > 1;

  if (!multi) {
    const body: Record<string, unknown> = {
      image_url: imageUrl,
      duration,
      resolution,
      generate_audio: false,
    };
    if (prompt) body.prompt = prompt;
    return { endpoint: HfEndpoints.seedanceI2v, body };
  }

  const imageUrls: string[] = [];
  for (const url of [imageUrl, ...resolved.anchorUrls]) {
    if (!url || imageUrls.includes(url)) continue;
    imageUrls.push(url);
  }
  if (imageUrls.length > SEEDANCE_MAX_REFERENCES) {
    throw new MediaInputError(
      `seedance reference-to-video accepts at most ${SEEDANCE_MAX_REFERENCES} images`,
    );
  }

  const body: Record<string, unknown> = {
    image_urls: imageUrls,
    duration,
    resolution,
    aspect_ratio: seedanceAspect(input.aspectRatio),
    generate_audio: false,
  };
  if (prompt) body.prompt = prompt;
  return { endpoint: HfEndpoints.seedanceR2v, body };
}
