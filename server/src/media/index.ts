import { createCastAdapter, type CastAdapterDeps, type CastReferenceAdapter } from "./cast/reference.js";
import { createClipGen } from "./higgsfield/clip-gen.js";
import { createImageGen } from "./higgsfield/image-gen.js";
import { createHiggsfieldClient, type HiggsfieldClient, type HiggsfieldClientDeps } from "./higgsfield/client.js";
import { createVoiceGen, type VoiceGenDeps } from "./elevenlabs/voice-gen.js";
import type { EnvLike } from "./flags.js";
import { moduleMock } from "./flags.js";
import type { ClipGenPort, ImageGenPort, VoiceGenPort } from "./ports.js";

export interface MediaPorts {
  cast: CastReferenceAdapter;
  images: ImageGenPort;
  clips: ClipGenPort;
  voice: VoiceGenPort;
}

export interface MediaPortDeps extends CastAdapterDeps {
  higgsfield?: HiggsfieldClient;
  higgsfieldDeps?: HiggsfieldClientDeps;
  voice?: VoiceGenDeps;
}

/** One cast registry shared by keyframes and clips. */
export function createMediaPorts(env: EnvLike = process.env, deps: MediaPortDeps = {}): MediaPorts {
  const needsHiggsfield =
    !moduleMock(env, "IMAGE_MOCK") || !moduleMock(env, "CLIP_MOCK") || !moduleMock(env, "CAST_MOCK");
  const higgsfield = needsHiggsfield
    ? (deps.higgsfield ?? createHiggsfieldClient(env, deps.higgsfieldDeps))
    : undefined;
  const uploadAnchor =
    deps.uploadAnchor ??
    (higgsfield && !moduleMock(env, "CAST_MOCK")
      ? (bytes: Uint8Array, contentType: string) => higgsfield.upload(bytes, contentType)
      : undefined);
  const cast = createCastAdapter(env, { uploadAnchor });
  return {
    cast,
    images: createImageGen(env, { cast, higgsfield }),
    clips: createClipGen(env, { cast, higgsfield }),
    get voice() { return createVoiceGen(env, deps.voice); },
  };
}

export { createCastAdapter, elementIdForAnchor, anchorUrlFromElementId } from "./cast/reference.js";
export { lockFaceAnchor } from "./cast/lock.js";
export { createImageGen } from "./higgsfield/image-gen.js";
export { createClipGen } from "./higgsfield/clip-gen.js";
export { createVoiceGen } from "./elevenlabs/voice-gen.js";
export { HfEndpoints, buildImageSubmission, buildClipSubmission } from "./higgsfield/request.js";
export { VoiceModels, buildVoiceRequest } from "./elevenlabs/request.js";
export { PROVISIONAL_CREDITS } from "./credits.js";
export { mockAssetDir, mockAssets } from "./placeholders.js";
export type { CastReference, CastReferenceAdapter, ResolvedCastPrompt } from "./cast/reference.js";
export type { MediaJob, MediaJobStatus } from "./job.js";
export type { ImageGenPort, ClipGenPort, VoiceGenPort, VoiceLineOutput } from "./ports.js";
export type { StudioVoicePreset } from "./elevenlabs/presets.js";
