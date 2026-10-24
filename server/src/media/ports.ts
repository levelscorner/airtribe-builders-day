import type {
  ClipGen,
  ClipGenInput,
  ClipGenOutput,
  ImageGen,
  ImageGenInput,
  ImageGenOutput,
  VoiceGen,
  VoiceGenInput,
  VoicePreset,
} from "../../../packages/shared/types.ts";
import type { MediaJob } from "./job.js";
import type { CaptionAlignment } from "./elevenlabs/alignment.js";

export interface SubmitOpts {
  idempotencyKey?: string;
}

export interface VoiceSubmitOpts extends SubmitOpts {
  /** Cast-gate sample. Uses eleven_flash_v2_5. Final lines use eleven_multilingual_v2. */
  preview?: boolean;
}

export interface VoiceLineOutput {
  url: string;
  durationMs: number;
  provider: "elevenlabs" | "mock";
  model: string;
  alignment: CaptionAlignment;
}

export interface ImageGenPort extends ImageGen {
  readonly mode: "mock" | "live";
  submit(input: ImageGenInput, opts?: SubmitOpts): Promise<MediaJob<ImageGenOutput>>;
  getJob(jobId: string): Promise<MediaJob<ImageGenOutput>>;
}

export interface ClipGenPort extends ClipGen {
  readonly mode: "mock" | "live";
  submit(input: ClipGenInput, opts?: SubmitOpts): Promise<MediaJob<ClipGenOutput>>;
  getJob(jobId: string): Promise<MediaJob<ClipGenOutput>>;
}

export interface VoiceGenPort extends VoiceGen {
  readonly mode: "mock" | "live";
  listPresets(): VoicePreset[];
  sample(input: VoiceGenInput): Promise<VoiceLineOutput>;
  submit(input: VoiceGenInput, opts?: VoiceSubmitOpts): Promise<MediaJob<VoiceLineOutput>>;
  getJob(jobId: string): Promise<MediaJob<VoiceLineOutput>>;
  generate(input: VoiceGenInput): Promise<VoiceLineOutput>;
}

export type { VoiceGenInput };
