import type { ImageGen, Resolution } from "../../../../packages/shared/types.ts";
import { MediaInputError } from "../errors.js";
import type { CastReference, CastReferenceAdapter, CreateCastReferenceInput } from "./reference.js";

export interface LockFaceAnchorInput extends CreateCastReferenceInput {
  /** Used when no anchor image was uploaded yet. Text-to-image, then register. */
  anchorPrompt?: string;
  aspectRatio?: string;
  resolution?: Resolution;
}

/**
 * Face-anchor path: an uploaded portrait, or one generated still, becomes the
 * reference stored on higgsfieldElementId. Later keyframes edit that image.
 */
export async function lockFaceAnchor(
  cast: CastReferenceAdapter,
  images: ImageGen,
  input: LockFaceAnchorInput,
): Promise<CastReference> {
  let anchorUrl = input.anchorUrl?.trim() ?? "";
  const hasBytes = Boolean(input.anchorBytes && input.anchorBytes.byteLength > 0);
  if (!anchorUrl && !hasBytes) {
    if (!input.anchorPrompt?.trim()) {
      throw new MediaInputError("face anchor image or anchor prompt required");
    }
    const image = await images.generate({
      prompt: [input.identityText.trim(), input.anchorPrompt.trim()].filter(Boolean).join("\n"),
      elementIds: [],
      aspectRatio: input.aspectRatio ?? "9:16",
      resolution: input.resolution ?? "720p",
    });
    anchorUrl = image.url;
  }

  return cast.createReference({
    castId: input.castId,
    name: input.name,
    identityText: input.identityText,
    anchorUrl: anchorUrl || undefined,
    anchorBytes: anchorUrl ? undefined : input.anchorBytes,
    contentType: input.contentType,
  });
}
