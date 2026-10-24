import type { VoicePreset } from "../../../../packages/shared/types.ts";
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

/**
 * Provisional Hindi library voices. Confirm in the ElevenLabs account before
 * a live demo (library voices must be added). Replace the whole list with
 * VOICE_PRESETS_JSON.
 */
export const DEFAULT_VOICE_PRESETS: StudioVoicePreset[] = [
  {
    id: "kid_female",
    key: "kid_female",
    elevenlabsVoiceId: "T536A2SFCG4AEDVTRucQ",
    label: "Mini",
    languageHint: "hi",
    stability: 0.5,
    style: 0.3,
    similarityBoost: 0.75,
    useSpeakerBoost: true,
    defaultCastName: "Mini",
    isPreset: true,
  },
  {
    id: "kid_male",
    key: "kid_male",
    elevenlabsVoiceId: "srEfhy4AF67Mw9SpTVFd",
    label: "Chintu",
    languageHint: "hi",
    stability: 0.5,
    style: 0.3,
    similarityBoost: 0.75,
    useSpeakerBoost: true,
    defaultCastName: "Chintu",
    isPreset: true,
  },
  {
    id: "presenter_female",
    key: "presenter_female",
    elevenlabsVoiceId: "mActWQg9kibLro6Z2ouY",
    label: "Riya",
    languageHint: "hi",
    stability: 0.5,
    style: 0.15,
    similarityBoost: 0.75,
    useSpeakerBoost: true,
    defaultCastName: "Riya",
    isPreset: true,
  },
  {
    id: "narrator_male",
    key: "narrator_male",
    elevenlabsVoiceId: "qsz5tTEjPvsiIJZIpM8S",
    label: "Narrator",
    languageHint: "hi",
    stability: 0.5,
    style: 0.15,
    similarityBoost: 0.75,
    useSpeakerBoost: true,
    defaultCastName: "Narrator",
    isPreset: true,
  },
];

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
  return presets.find((preset) => preset.elevenlabsVoiceId === voiceId || preset.id === voiceId);
}

export { DEFAULT_SETTINGS };
