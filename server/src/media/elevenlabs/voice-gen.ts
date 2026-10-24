import { randomUUID } from "node:crypto";
import type { VoiceGenInput, VoicePreset } from "../../../../packages/shared/types.ts";
import { PROVISIONAL_CREDITS } from "../credits.js";
import type { EnvLike } from "../flags.js";
import { moduleMock } from "../flags.js";
import { completedJob, failedJob, JobStore, newJobId, type MediaJob } from "../job.js";
import { mockAssets, publicUrl } from "../placeholders.js";
import type { VoiceGenPort, VoiceLineOutput, VoiceSubmitOpts } from "../ports.js";
import { alignmentDurationMs, mockAlignment } from "./alignment.js";
import { loadVoicePresets } from "./presets.js";
import { LiveVoiceGen, type ElevenLabsDeps } from "./live.js";
import { buildVoiceRequest } from "./request.js";

class MockVoiceGen implements VoiceGenPort {
  readonly mode = "mock" as const;
  private readonly store = new JobStore<VoiceLineOutput>();
  private readonly presets: ReturnType<typeof loadVoicePresets>;

  constructor(private readonly env: EnvLike) {
    this.presets = loadVoicePresets(env);
  }

  listPresets(): VoicePreset[] {
    return this.presets.map((preset) => ({ ...preset }));
  }

  async submit(input: VoiceGenInput, opts?: VoiceSubmitOpts): Promise<MediaJob<VoiceLineOutput>> {
    const idempotencyKey = opts?.idempotencyKey?.trim() || randomUUID();
    const existing = this.store.getByKey(idempotencyKey);
    if (existing) return existing;
    const preview = opts?.preview === true;

    try {
      const request = buildVoiceRequest(input, this.presets, preview);
      const alignment = mockAlignment(request.body.text);
      const jobId = newJobId();
      return this.store.insert(completedJob<VoiceLineOutput>({
        jobId,
        provider: "mock",
        costCredits: preview ? PROVISIONAL_CREDITS.voicePreview : PROVISIONAL_CREDITS.voice,
        idempotencyKey,
        result: {
          url: publicUrl(this.env, `${mockAssets.voice}?job=${jobId}`),
          durationMs: alignmentDurationMs(alignment),
          provider: "mock",
          model: request.modelId,
          alignment,
        },
      }));
    } catch (error) {
      return this.store.insert(failedJob(idempotencyKey, error));
    }
  }

  async getJob(jobId: string): Promise<MediaJob<VoiceLineOutput>> {
    const job = this.store.get(jobId);
    if (!job) throw new Error(`unknown media job ${jobId}`);
    return job;
  }

  async generate(input: VoiceGenInput): Promise<VoiceLineOutput> {
    const job = await this.submit(input);
    if (job.status !== "completed" || !job.result) {
      throw new Error(job.error || `voice job ${job.status}`);
    }
    return job.result;
  }

  async sample(input: VoiceGenInput): Promise<VoiceLineOutput> {
    const job = await this.submit(input, { preview: true });
    if (job.status !== "completed" || !job.result) {
      throw new Error(job.error || `voice sample ${job.status}`);
    }
    return job.result;
  }
}

export type VoiceGenDeps = ElevenLabsDeps;

function voiceForcedLive(env: EnvLike): boolean {
  const value = env.VOICE_MOCK?.trim().toLowerCase();
  return value === "0" || value === "false" || value === "no" || value === "off";
}

export function createVoiceGen(env: EnvLike = process.env, deps: VoiceGenDeps = {}): VoiceGenPort {
  if (moduleMock(env, "VOICE_MOCK")) return new MockVoiceGen(env);
  if (!env.ELEVENLABS_API_KEY?.trim() && !voiceForcedLive(env)) return new MockVoiceGen(env);
  return new LiveVoiceGen(env, deps);
}
