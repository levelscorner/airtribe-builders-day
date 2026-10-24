import { createCastAdapter, type CastAdapterDeps, type CastReferenceAdapter } from "./cast/reference.js";
import { createClipGen } from "./higgsfield/clip-gen.js";
import { createImageGen } from "./higgsfield/image-gen.js";
import { createVoiceGen } from "./elevenlabs/voice-gen.js";
import type { EnvLike } from "./flags.js";
import type { ClipGenPort, ImageGenPort, VoiceGenPort } from "./ports.js";

export interface MediaPorts {
  cast: CastReferenceAdapter;
  images: ImageGenPort;
  clips: ClipGenPort;
  voice: VoiceGenPort;
}

/** One cast registry shared by keyframes and clips. */
export function createMediaPorts(env: EnvLike = process.env, deps: CastAdapterDeps = {}): MediaPorts {
  const cast = createCastAdapter(env, deps);
  return {
    cast,
    images: createImageGen(env, { cast }),
    clips: createClipGen(env, { cast }),
    voice: createVoiceGen(env),
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
