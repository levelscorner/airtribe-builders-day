import type { SseEvent } from "@chotu/shared";

/**
 * TODO: delete MediaProgressEvent and KnownMediaProvider when @chotu/shared adds them.
 * The chip reads provider, model, and providerLabel off the artefact or its payload
 * without waiting for those fields to be declared on ArtefactSummary.
 *
 * Real shared fields this file does not redeclare:
 * - payload.provider on image / clip / voice / render outputs
 *   (higgsfield | mock | kenburns | elevenlabs | ffmpeg | render_workflow)
 * - payload.model on ImageGenOutput and ClipGenOutput (optional string)
 * - VoicePreset: id, elevenlabsVoiceId, label, languageHint (not voiceId / lang / gender / age / role)
 *
 * Still missing from shared:
 * - artefact.provider, artefact.model, artefact.providerLabel
 * - providers "ark" and "openai"
 * - VOICE_PRESETS (11 voices with gender, age, role, sampleUrl)
 */
export type KnownMediaProvider =
  | "higgsfield"
  | "elevenlabs"
  | "mock"
  | "kenburns"
  | "ffmpeg"
  | "render_workflow"
  | "openai"
  | "ark";

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
  "openai",
  "ark",
]);

/**
 * One map for the chip. Model rules run before provider-only rules.
 * An unknown model falls through to providerLabel, then the raw model string.
 */
const LABEL_RULES: ReadonlyArray<{
  label: string;
  provider?: string;
  modelIncludes?: string;
  modelEquals?: string;
  providerOnly?: boolean;
}> = [
  { provider: "openai", modelIncludes: "gpt-image-2", label: "GPT Image 2" },
  { provider: "ark", modelIncludes: "seedance-2-5", label: "Seedance 2.5" },
  { modelIncludes: "qwen-image", label: "Qwen Image" },
  { modelIncludes: "seedance-2.0", label: "Seedance 2.0" },
  { modelEquals: "eleven_multilingual_v2", label: "ElevenLabs" },
  { modelEquals: "eleven_flash_v2_5", label: "ElevenLabs" },
  { provider: "higgsfield", providerOnly: true, label: "Higgsfield" },
  { provider: "elevenlabs", providerOnly: true, label: "ElevenLabs" },
  { provider: "mock", providerOnly: true, label: "Mock" },
  { provider: "kenburns", providerOnly: true, label: "Ken Burns" },
  { provider: "ffmpeg", providerOnly: true, label: "ffmpeg" },
  { provider: "render_workflow", providerOnly: true, label: "Render" },
];

const STATUSES = new Set<MediaProgressStatus>([
  "queued",
  "generating",
  "done",
  "failed",
]);

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as Record<string, unknown>;
}

function textField(
  row: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = row?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

interface MediaFields {
  providerLabel?: string;
  provider?: string;
  model?: string;
}

function fieldsAt(row: Record<string, unknown> | undefined): MediaFields {
  return {
    providerLabel: textField(row, "providerLabel"),
    provider: textField(row, "provider"),
    model: textField(row, "model"),
  };
}

function knownProvider(
  value: string | undefined,
): KnownMediaProvider | undefined {
  return value && PROVIDERS.has(value as KnownMediaProvider)
    ? (value as KnownMediaProvider)
    : undefined;
}

/** Artefact field wins, then the same key on payload. */
function preferField(
  top: string | undefined,
  nested: string | undefined,
): string | undefined {
  return top ?? nested;
}

export function readProvider(source: unknown): KnownMediaProvider | undefined {
  const row = record(source);
  const top = fieldsAt(row);
  const nested = fieldsAt(record(row?.payload));
  return knownProvider(preferField(top.provider, nested.provider));
}

export function readModel(source: unknown): string | undefined {
  const row = record(source);
  const top = fieldsAt(row);
  const nested = fieldsAt(record(row?.payload));
  return preferField(top.model, nested.model);
}

function matchLabel(
  provider: string | undefined,
  model: string | undefined,
): string | undefined {
  for (const rule of LABEL_RULES) {
    if (rule.provider && rule.provider !== provider) continue;
    if (rule.providerOnly) {
      if (model) continue;
      return rule.label;
    }
    if (rule.modelEquals) {
      if (model !== rule.modelEquals) continue;
      return rule.label;
    }
    if (rule.modelIncludes) {
      if (!model?.includes(rule.modelIncludes)) continue;
      return rule.label;
    }
  }
  return undefined;
}

function labelFrom(fields: MediaFields): string | undefined {
  const mapped = matchLabel(fields.provider, fields.model);
  if (mapped) return mapped;
  if (fields.providerLabel) return fields.providerLabel;
  if (fields.model) return fields.model;
  return matchLabel(fields.provider, undefined);
}

/**
 * Artefact-level providerLabel wins. Otherwise artefact provider/model,
 * then payload.provider / payload.model / payload.providerLabel.
 */
export function providerChipLabel(source: unknown): string | undefined {
  const row = record(source);
  if (!row) return undefined;
  const top = fieldsAt(row);
  if (top.providerLabel) return top.providerLabel;
  if (top.provider || top.model)
    return labelFrom({ provider: top.provider, model: top.model });
  return labelFrom(fieldsAt(record(row.payload)));
}

export function progressCopy(event: MediaProgressEvent): string {
  if (event.status === "queued") return "Queued";
  if (event.status === "generating") {
    return typeof event.percent === "number"
      ? `Generating ${Math.round(event.percent)}%`
      : "Generating";
  }
  if (event.status === "done") return "Done";
  return event.error?.trim() || "Failed";
}

export function parseMediaProgress(
  value: unknown,
): MediaProgressEvent | undefined {
  const row = record(value);
  if (!row || row.type !== "media.progress") return undefined;
  if (typeof row.jobId !== "string" || !row.jobId.trim()) return undefined;
  if (typeof row.artefactId !== "string" || !row.artefactId.trim())
    return undefined;
  if (row.kind !== "image" && row.kind !== "clip" && row.kind !== "voice")
    return undefined;
  if (
    typeof row.status !== "string" ||
    !STATUSES.has(row.status as MediaProgressStatus)
  )
    return undefined;
  if (
    typeof row.provider !== "string" ||
    !PROVIDERS.has(row.provider as KnownMediaProvider)
  )
    return undefined;
  const percent =
    typeof row.percent === "number" && row.percent >= 0 && row.percent <= 100
      ? Math.round(row.percent)
      : undefined;
  const model =
    typeof row.model === "string" && row.model.trim()
      ? row.model.trim()
      : undefined;
  const url =
    typeof row.url === "string" && row.url.trim() ? row.url.trim() : undefined;
  const error =
    typeof row.error === "string" && row.error.trim()
      ? row.error.trim()
      : undefined;
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
