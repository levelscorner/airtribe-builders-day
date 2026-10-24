import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { VoiceGenInput, VoicePreset } from "../../../../packages/shared/types.ts";
import { PROVISIONAL_CREDITS } from "../credits.js";
import { MediaInputError } from "../errors.js";
import type { EnvLike } from "../flags.js";
import { failedJob, JobStore, newJobId, type MediaJob, type MediaJobStatus } from "../job.js";
import { publicUrl } from "../placeholders.js";
import type { VoiceGenPort, VoiceLineOutput, VoiceSubmitOpts } from "../ports.js";
import { alignmentDurationMs, alignmentFromSeconds, type CaptionAlignment } from "./alignment.js";
import { loadVoicePresets, type StudioVoicePreset } from "./presets.js";
import { buildVoiceRequest, EL_API_BASE, type VoiceRequest } from "./request.js";

const TERMINAL = new Set<MediaJobStatus>(["completed", "failed", "nsfw", "canceled"]);

export interface ElevenLabsDeps {
  fetch?: (url: string, init?: RequestInit) => Promise<Response>;
}

interface SpeechResponse {
  audio_base64?: string;
  alignment?: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  } | null;
}

const defaultVoiceDir = join(dirname(fileURLToPath(import.meta.url)), "../../../data/media/voice");

function voiceDir(env: EnvLike): string {
  return env.MEDIA_DIR?.trim() || defaultVoiceDir;
}

export class LiveVoiceGen implements VoiceGenPort {
  readonly mode = "live" as const;
  private readonly store = new JobStore<VoiceLineOutput>();
  private readonly inflight = new Map<string, Promise<MediaJob<VoiceLineOutput>>>();
  private readonly presets: StudioVoicePreset[];
  private readonly fetch: (url: string, init?: RequestInit) => Promise<Response>;
  private readonly apiKey: string;
  private readonly base: string;
  private readonly dir: string;

  constructor(private readonly env: EnvLike, deps: ElevenLabsDeps = {}) {
    const apiKey = env.ELEVENLABS_API_KEY?.trim() ?? "";
    if (!apiKey) throw new MediaInputError("ELEVENLABS_API_KEY is required");
    this.apiKey = apiKey;
    this.presets = loadVoicePresets(env);
    this.fetch = deps.fetch ?? fetch;
    this.base = (env.ELEVENLABS_API_BASE?.trim() || EL_API_BASE).replace(/\/$/, "");
    this.dir = voiceDir(env);
  }

  listPresets(): VoicePreset[] {
    return this.presets.map((preset) => ({ ...preset }));
  }

  submit(input: VoiceGenInput, opts?: VoiceSubmitOpts): Promise<MediaJob<VoiceLineOutput>> {
    const idempotencyKey = opts?.idempotencyKey?.trim() || randomUUID();
    const existing = this.store.getByKey(idempotencyKey);
    if (existing && TERMINAL.has(existing.status)) return Promise.resolve(existing);
    const pending = this.inflight.get(idempotencyKey);
    if (pending) return pending;
    const preview = opts?.preview === true;
    const promise = this.execute(input, idempotencyKey, preview).finally(() => {
      this.inflight.delete(idempotencyKey);
    });
    this.inflight.set(idempotencyKey, promise);
    return promise;
  }

  async getJob(jobId: string): Promise<MediaJob<VoiceLineOutput>> {
    const job = this.store.get(jobId);
    if (!job) throw new Error(`unknown media job ${jobId}`);
    return job;
  }

  async generate(input: VoiceGenInput): Promise<VoiceLineOutput> {
    const job = await this.submit(input);
    if (job.status !== "completed" || !job.result) throw new Error(job.error || `voice job ${job.status}`);
    return job.result;
  }

  async sample(input: VoiceGenInput): Promise<VoiceLineOutput> {
    const job = await this.submit(input, { preview: true });
    if (job.status !== "completed" || !job.result) throw new Error(job.error || `voice sample ${job.status}`);
    return job.result;
  }

  private async execute(
    input: VoiceGenInput,
    idempotencyKey: string,
    preview: boolean,
  ): Promise<MediaJob<VoiceLineOutput>> {
    try {
      const request = buildVoiceRequest(input, this.presets, preview);
      const speech = await this.speak(request);
      const alignment = requireAlignment(speech.alignment);
      const jobId = newJobId();
      const filename = `${jobId}.mp3`;
      await mkdir(this.dir, { recursive: true });
      await writeFile(join(this.dir, filename), Buffer.from(speech.audio_base64 ?? "", "base64"));
      const result: VoiceLineOutput = {
        url: publicUrl(this.env, `/media/voice/${filename}`),
        durationMs: alignmentDurationMs(alignment),
        provider: "elevenlabs",
        model: request.modelId,
        alignment,
      };
      return this.store.insert({
        jobId,
        provider: "elevenlabs",
        status: "completed",
        result,
        costCredits: preview ? PROVISIONAL_CREDITS.voicePreview : PROVISIONAL_CREDITS.voice,
        idempotencyKey,
      });
    } catch (error) {
      return this.store.insert(failedJob(idempotencyKey, error, "elevenlabs"));
    }
  }

  private async speak(request: VoiceRequest): Promise<SpeechResponse> {
    const params = new URLSearchParams({ output_format: request.query.output_format });
    const response = await this.fetch(`${this.base}${request.path}?${params.toString()}`, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(request.body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`elevenlabs ${response.status}: ${errorDetail(text)}`);
    }
    const speech = JSON.parse(text) as SpeechResponse;
    if (!speech.audio_base64) throw new Error("elevenlabs response is missing audio");
    return speech;
  }
}

function errorDetail(text: string): string {
  try {
    const parsed = JSON.parse(text) as { detail?: { message?: string } | string };
    if (typeof parsed.detail === "string") return parsed.detail.slice(0, 180);
    if (parsed.detail && typeof parsed.detail.message === "string") return parsed.detail.message.slice(0, 180);
  } catch {
    return "request failed";
  }
  return "request failed";
}

function requireAlignment(alignment: SpeechResponse["alignment"]): CaptionAlignment {
  const mapped = alignmentFromSeconds(alignment);
  if (mapped.chars.length === 0 || mapped.chars.length !== mapped.startMs.length || mapped.chars.length !== mapped.endMs.length) {
    throw new Error("elevenlabs response is missing caption alignment");
  }
  return mapped;
}
