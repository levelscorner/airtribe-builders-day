import { createCastAdapter, type CastAdapterDeps, type CastReferenceAdapter } from "./cast/reference.js";
import type { HiggsfieldClient, HiggsfieldClientDeps } from "./higgsfield/client.js";
import { createVoiceGen, type VoiceGenDeps } from "./elevenlabs/voice-gen.js";
import type { EnvLike } from "./flags.js";
import { moduleMock } from "./flags.js";
import type { ClipGenPort, ImageGenPort, VoiceGenPort } from "./ports.js";
import { createStudioClipGen, createStudioImageGen, type StudioDeps } from "./studio.js";

export interface MediaPorts {
  cast: CastReferenceAdapter;
  images: ImageGenPort;
  clips: ClipGenPort;
  voice: VoiceGenPort;
}

export interface MediaPortDeps extends CastAdapterDeps, StudioDeps {
  higgsfield?: HiggsfieldClient;
  higgsfieldDeps?: HiggsfieldClientDeps;
  voice?: VoiceGenDeps;
}

/**
 * Images: OpenAI gpt-image-2, retried once, then Seedream when that call fails and ARK_API_KEY is set.
 * Clips: Seedance 2.5 when ARK_API_KEY is set. Mock when MOCK=1 or the key is missing.
 * A Higgsfield client is used only when the caller passes one (cast byte upload).
 */
export function createMediaPorts(env: EnvLike = process.env, deps: MediaPortDeps = {}): MediaPorts {
  const uploadAnchor =
    deps.uploadAnchor ??
    (deps.higgsfield && !moduleMock(env, "CAST_MOCK")
      ? (bytes: Uint8Array, contentType: string) => deps.higgsfield!.upload(bytes, contentType)
      : undefined);
  const cast = createCastAdapter(env, { uploadAnchor });
  let images: ImageGenPort | undefined;
  let clips: ClipGenPort | undefined;
  let voice: VoiceGenPort | undefined;
  return {
    cast,
    get images() { return images ??= createStudioImageGen(env, { ...deps, cast }); },
    get clips() { return clips ??= createStudioClipGen(env, { ...deps, cast }); },
    get voice() { return voice ??= createVoiceGen(env, deps.voice); },
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
