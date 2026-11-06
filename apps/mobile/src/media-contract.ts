import type { ArtefactState, PlannedScene, ScenePlan, SseEvent } from "@chotu/shared";

/**
 * TODO: delete the local types below when @chotu/shared adds them.
 * Scene prompts, duration and VO come from shared PlannedScene / ScenePlan (#41).
 *
 * Still missing from shared:
 * - id and index on PlannedScene (storyboard cards and sceneId links need both)
 * - per-scene artefacts: kind image|clip|voice plus provider, model, providerLabel
 * - providers "openai" and "ark" on the shared unions
 * - MediaProgressEvent, including sceneId
 * - POST /v1/artefacts/:id/regenerate body { sceneId, target, feedback? }
 * - final artefact downloadUrl
 */

/** TODO: shared provider union. Includes openai and ark. */
export type MediaProvider =
  | "higgsfield"
  | "elevenlabs"
  | "mock"
  | "kenburns"
  | "ffmpeg"
  | "render_workflow"
  | "openai"
  | "ark";
export type KnownMediaProvider = MediaProvider;

/** TODO: drop when PlannedScene gains id and index. */
export interface StoryboardScene extends PlannedScene {
  id: string;
  index: number;
}

/** ScenePlan plus the ids the storyboard uses to link media. */
export interface StoryboardArtefact extends ScenePlan {
  id: string;
  scenes: StoryboardScene[];
}

export type SceneMediaKind = "image" | "clip" | "voice";

/** Per-scene image, clip, or voice row. Linked to Scene by sceneId. */
export interface SceneMediaArtefact {
  id: string;
  sceneId: string;
  kind: SceneMediaKind;
  provider: MediaProvider;
  model: string;
  providerLabel: string;
  url?: string;
  state: ArtefactState;
}

/** Body for POST /v1/artefacts/:id/regenerate when a scene target is in scope. */
export interface RegenerateSceneRequest {
  sceneId: string;
  target: SceneMediaKind;
  feedback?: string;
}

/** TODO: final payload on the shared final artefact. */
export interface FinalArtefact {
  kind: "final";
  url: string;
  downloadUrl: string;
}

export type MediaProgressStatus = "queued" | "generating" | "done" | "failed";

export interface MediaProgressEvent {
  type: "media.progress";
  jobId: string;
  artefactId: string;
  /** Set for storyboard ticks. Cast voice samples omit it. */
  sceneId?: string;
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
  { modelIncludes: "seedance-2.0", label: "Seedance 2.0" },
  { modelEquals: "eleven_multilingual_v2", label: "ElevenLabs" },
  { modelEquals: "eleven_flash_v2_5", label: "ElevenLabs" },
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

const HIDDEN_PROVIDER = /higgsfield|qwen|seedream|openart/i;

function hiddenProviderText(value: string | undefined): boolean {
  return Boolean(value && HIDDEN_PROVIDER.test(value));
}

function labelFrom(fields: MediaFields): string | undefined {
  const hidden =
    hiddenProviderText(fields.provider) ||
    hiddenProviderText(fields.model) ||
    hiddenProviderText(fields.providerLabel);
  if (hidden) {
    if (fields.providerLabel && !hiddenProviderText(fields.providerLabel)) return fields.providerLabel;
    return undefined;
  }
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
  if (top.providerLabel && !hiddenProviderText(top.providerLabel)) return top.providerLabel;
  if (hiddenProviderText(top.providerLabel) && !top.provider && !top.model) return undefined;
  if (top.provider || top.model) return labelFrom({ provider: top.provider, model: top.model });
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
    typeof row.percent === "number" && row.percent >= 0 && row.percent <= 100 ? Math.round(row.percent) : undefined;
  const model = typeof row.model === "string" && row.model.trim() ? row.model.trim() : undefined;
  const url = typeof row.url === "string" && row.url.trim() ? row.url.trim() : undefined;
  const error = typeof row.error === "string" && row.error.trim() ? row.error.trim() : undefined;
  const sceneId = typeof row.sceneId === "string" && row.sceneId.trim() ? row.sceneId.trim() : undefined;
  return {
    type: "media.progress",
    jobId: row.jobId,
    artefactId: row.artefactId,
    sceneId,
    kind: row.kind,
    status: row.status as MediaProgressStatus,
    percent,
    url,
    error,
    provider: row.provider as KnownMediaProvider,
    model,
  };
}

const ARTEFACT_STATES = new Set<ArtefactState>([
  "pending",
  "generating",
  "awaiting_approval",
  "approved",
  "rejected",
  "failed",
]);

export function readScene(value: unknown): StoryboardScene | undefined {
  const row = record(value);
  if (!row) return undefined;
  const id = textField(row, "id");
  const imagePrompt = textField(row, "imagePrompt");
  const motionPrompt = textField(row, "motionPrompt");
  const vo = textField(row, "vo");
  const voiceId = textField(row, "voiceId");
  const index = row.index;
  const duration = row.durationSec;
  if (!id || !imagePrompt || !motionPrompt || !vo || !voiceId) return undefined;
  if (typeof index !== "number" || !Number.isInteger(index)) return undefined;
  if (duration !== 5 && duration !== 10) return undefined;
  return { id, index, imagePrompt, motionPrompt, durationSec: duration, vo, voiceId };
}

export interface StoryboardBoard {
  board: StoryboardArtefact;
  media: SceneMediaArtefact[];
}

interface StoryboardRow {
  id: string;
  kind: string;
  sceneId?: string;
  state: string;
  payload: Record<string, unknown>;
}

function sceneMediaKind(kind: string): SceneMediaKind | undefined {
  if (kind === "image" || kind === "clip") return kind;
  if (kind === "audio" || kind === "voice") return "voice";
  return undefined;
}

function readSceneMedia(item: StoryboardRow): SceneMediaArtefact | undefined {
  if (!item.sceneId) return undefined;
  const kind = sceneMediaKind(item.kind);
  if (!kind) return undefined;
  const provider = knownProvider(textField(item.payload, "provider"));
  const model = textField(item.payload, "model");
  if (!provider || !model) return undefined;
  const chip = providerChipLabel(item);
  const providerLabel = chip ?? (HIDDEN_PROVIDER.test(model) ? kind : model);
  if (!ARTEFACT_STATES.has(item.state as ArtefactState)) return undefined;
  return {
    id: item.id,
    sceneId: item.sceneId,
    kind,
    provider,
    model,
    providerLabel,
    url: textField(item.payload, "url"),
    state: item.state as ArtefactState,
  };
}

/** Board artefact payload.storyboard plus per-scene image, clip, and voice rows. */
export function readStoryboard(artefacts: readonly StoryboardRow[]): StoryboardBoard | undefined {
  const host = artefacts.find((item) => item.payload.storyboard === true);
  if (!host || !Array.isArray(host.payload.scenes)) return undefined;
  const scenes = host.payload.scenes.map((item) => readScene(item)).filter((item): item is StoryboardScene => Boolean(item));
  if (scenes.length === 0) return undefined;
  scenes.sort((left, right) => left.index - right.index);
  const media = artefacts.map((item) => readSceneMedia(item)).filter((item): item is SceneMediaArtefact => Boolean(item));
  return { board: { id: host.id, scenes }, media };
}

export function readFinal(source: unknown): FinalArtefact | undefined {
  const row = record(source);
  if (!row) return undefined;
  if (typeof row.kind === "string" && row.kind !== "final") return undefined;
  const payload = record(row.payload) ?? row;
  const url = textField(payload, "url");
  const downloadUrl = textField(payload, "downloadUrl");
  if (!url || !downloadUrl) return undefined;
  return { kind: "final", url, downloadUrl };
}
