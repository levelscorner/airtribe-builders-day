import type { SseEvent } from "@chotu/shared";

/**
 * TODO: delete MediaProgressEvent when @chotu/shared adds this SSE frame.
 *
 * Real shared fields this file does not redeclare:
 * - payload.provider on image / clip / voice / render outputs
 *   (higgsfield | mock | kenburns | elevenlabs | ffmpeg | render_workflow)
 * - payload.model on ImageGenOutput and ClipGenOutput (optional string)
 * - VoicePreset: id, elevenlabsVoiceId, label, languageHint (not voiceId / lang / gender / age / role)
 *
 * Not in shared, so the chip cannot read them:
 * - artefact.provider, artefact.model, artefact.providerLabel
 * - provider "ark"
 * - VOICE_PRESETS (11 voices with gender, age, role, sampleUrl)
 */
export type KnownMediaProvider =
  | "higgsfield"
  | "elevenlabs"
  | "mock"
  | "kenburns"
  | "ffmpeg"
  | "render_workflow";

export type MediaProgressStatus = "queued" | "generating" | "done" | "failed";

export interface MediaProgressEvent {
  type: "media.progress";
  jobId: string;
  artefactId: string;
  kind: "image" | "clip" | "voice";
  status: MediaProgressStatus;
  percent?: number;
  url?: string;
  error?: string;
  provider: KnownMediaProvider;
  model?: string;
}

export type StudioEvent = SseEvent | MediaProgressEvent;

const PROVIDERS = new Set<KnownMediaProvider>([
  "higgsfield",
  "elevenlabs",
  "mock",
  "kenburns",
  "ffmpeg",
  "render_workflow",
]);

const STATUSES = new Set<MediaProgressStatus>(["queued", "generating", "done", "failed"]);

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

function payloadOf(source: unknown): Record<string, unknown> | undefined {
  const row = record(source);
  if (!row) return undefined;
  const payload = record(row.payload);
  return payload ?? row;
}

export function readProvider(source: unknown): KnownMediaProvider | undefined {
  const value = payloadOf(source)?.provider;
  return typeof value === "string" && PROVIDERS.has(value as KnownMediaProvider)
    ? (value as KnownMediaProvider)
    : undefined;
}

export function readModel(source: unknown): string | undefined {
  const value = payloadOf(source)?.model;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Chip text from the real model id, then the real provider. providerLabel is not in shared. */
export function providerChipLabel(source: unknown): string | undefined {
  const model = readModel(source);
  if (model) {
    if (model.includes("qwen-image")) return "Qwen Image";
    if (model.includes("seedance-2.0")) return "Seedance 2.0";
    if (model === "eleven_multilingual_v2" || model === "eleven_flash_v2_5") return "ElevenLabs";
    return model;
  }
  const provider = readProvider(source);
  if (provider === "higgsfield") return "Higgsfield";
  if (provider === "elevenlabs") return "ElevenLabs";
  if (provider === "mock") return "Mock";
  if (provider === "kenburns") return "Ken Burns";
  if (provider === "ffmpeg") return "ffmpeg";
  if (provider === "render_workflow") return "Render";
  return undefined;
}

export function progressCopy(event: MediaProgressEvent): string {
  if (event.status === "queued") return "Queued";
  if (event.status === "generating") {
    return typeof event.percent === "number" ? `Generating ${Math.round(event.percent)}%` : "Generating";
  }
  if (event.status === "done") return "Done";
  return event.error?.trim() || "Failed";
}

export function parseMediaProgress(value: unknown): MediaProgressEvent | undefined {
  const row = record(value);
  if (!row || row.type !== "media.progress") return undefined;
  if (typeof row.jobId !== "string" || !row.jobId.trim()) return undefined;
  if (typeof row.artefactId !== "string" || !row.artefactId.trim()) return undefined;
  if (row.kind !== "image" && row.kind !== "clip" && row.kind !== "voice") return undefined;
  if (typeof row.status !== "string" || !STATUSES.has(row.status as MediaProgressStatus)) return undefined;
  if (typeof row.provider !== "string" || !PROVIDERS.has(row.provider as KnownMediaProvider)) return undefined;
  const percent =
    typeof row.percent === "number" && row.percent >= 0 && row.percent <= 100 ? Math.round(row.percent) : undefined;
  const model = typeof row.model === "string" && row.model.trim() ? row.model.trim() : undefined;
  const url = typeof row.url === "string" && row.url.trim() ? row.url.trim() : undefined;
  const error = typeof row.error === "string" && row.error.trim() ? row.error.trim() : undefined;
  return {
    type: "media.progress",
    jobId: row.jobId,
    artefactId: row.artefactId,
    kind: row.kind,
    status: row.status as MediaProgressStatus,
    percent,
    url,
    error,
    provider: row.provider as KnownMediaProvider,
    model,
  };
}
