import type { VoicePreset } from "../../../../packages/shared/types.ts";
import { VOICE_PRESETS, type VoiceBankPreset } from "../../../../packages/shared/voicePresets.ts";
import { MediaInputError } from "../errors.js";
import type { EnvLike } from "../flags.js";

export interface StudioVoicePreset extends VoicePreset {
  key?: string;
  similarityBoost: number;
  useSpeakerBoost: boolean;
}

const DEFAULT_SETTINGS = {
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.15,
  useSpeakerBoost: true,
} as const;

/** Fixture cast voiceIds from before the shared bank. */
const LEGACY_VOICE_IDS: Record<string, string> = {
  playful_young_male: "hi-male-young",
  warm_kid_female: "hi-female-young",
  confident_presenter_female: "hi-female-young",
  deep_storyteller_male: "narrator-male",
  kid_female: "hi-female-young",
  kid_male: "hi-male-young",
  presenter_female: "hi-female-young",
  narrator_male: "narrator-male",
};

function fromBank(preset: VoiceBankPreset): StudioVoicePreset {
  const expressive = preset.age === "kid" || preset.age === "young" || preset.role === "cartoon";
  return {
    id: preset.id,
    key: preset.id,
    elevenlabsVoiceId: preset.voiceId,
    voiceId: preset.voiceId,
    label: preset.label,
    languageHint: preset.lang,
    lang: preset.lang,
    gender: preset.gender,
    age: preset.age,
    role: preset.role,
    model: preset.model,
    sampleUrl: preset.sampleUrl,
    stability: 0.5,
    style: expressive ? 0.3 : 0.15,
    similarityBoost: 0.75,
    useSpeakerBoost: true,
    isPreset: true,
  };
}

/** ElevenLabs catalogue. Replace the whole list with VOICE_PRESETS_JSON. */
export const DEFAULT_VOICE_PRESETS: StudioVoicePreset[] = VOICE_PRESETS.map(fromBank);

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function parsePreset(value: unknown, index: number): StudioVoicePreset {
  if (typeof value !== "object" || value === null) {
    throw new MediaInputError(`VOICE_PRESETS_JSON[${index}] must be an object`);
  }
  const row = value as Record<string, unknown>;
  const id = typeof row.id === "string" ? row.id.trim() : "";
  const elevenlabsVoiceId = typeof row.elevenlabsVoiceId === "string" ? row.elevenlabsVoiceId.trim() : "";
  if (!id || !elevenlabsVoiceId) {
    throw new MediaInputError(`VOICE_PRESETS_JSON[${index}] needs id and elevenlabsVoiceId`);
  }
  const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : id;
  return {
    id,
    key: typeof row.key === "string" ? row.key : id,
    elevenlabsVoiceId,
    label,
    languageHint: typeof row.languageHint === "string" ? row.languageHint : "hi",
    stability: num(row.stability, DEFAULT_SETTINGS.stability),
    style: num(row.style, DEFAULT_SETTINGS.style),
    similarityBoost: num(row.similarityBoost, DEFAULT_SETTINGS.similarityBoost),
    useSpeakerBoost: typeof row.useSpeakerBoost === "boolean" ? row.useSpeakerBoost : DEFAULT_SETTINGS.useSpeakerBoost,
    defaultCastName: typeof row.defaultCastName === "string" ? row.defaultCastName : undefined,
    isPreset: true,
  };
}

export function loadVoicePresets(env: EnvLike): StudioVoicePreset[] {
  const raw = env.VOICE_PRESETS_JSON?.trim();
  if (!raw) return DEFAULT_VOICE_PRESETS.map((preset) => ({ ...preset }));
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new MediaInputError("VOICE_PRESETS_JSON is not valid JSON");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new MediaInputError("VOICE_PRESETS_JSON must be a non-empty array");
  }
  return parsed.map((row, index) => parsePreset(row, index));
}

export function findPreset(presets: readonly StudioVoicePreset[], voiceId: string): StudioVoicePreset | undefined {
  const key = LEGACY_VOICE_IDS[voiceId] ?? voiceId;
  return presets.find((preset) => preset.elevenlabsVoiceId === key || preset.id === key || preset.elevenlabsVoiceId === voiceId || preset.id === voiceId);
}

export { DEFAULT_SETTINGS };
