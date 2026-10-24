import { DEFAULT_VOICE_ID } from "../../../../packages/shared/voicePresets.ts";
import type { Language, VoiceGenInput } from "../../../../packages/shared/types.ts";
import { MediaInputError } from "../errors.js";
import { DEFAULT_SETTINGS, findPreset, type StudioVoicePreset } from "./presets.js";

/** Checked against the ElevenLabs timestamps API on 24 Oct 2026. */
export const VoiceModels = {
  final: "eleven_multilingual_v2",
  preview: "eleven_flash_v2_5",
} as const;

export const EL_API_BASE = "https://api.elevenlabs.io";

export interface VoiceRequest {
  voiceId: string;
  modelId: (typeof VoiceModels)[keyof typeof VoiceModels];
  path: string;
  query: { output_format: "mp3_44100_128" };
  body: {
    text: string;
    model_id: string;
    voice_settings: {
      stability: number;
      similarity_boost: number;
      style: number;
      use_speaker_boost: boolean;
    };
    language_code?: "hi" | "en";
  };
}

function languageCode(language: Language): "hi" | "en" {
  return language === "en" ? "en" : "hi";
}

export function buildVoiceRequest(
  input: VoiceGenInput,
  presets: readonly StudioVoicePreset[],
  preview: boolean,
): VoiceRequest {
  const text = input.text ?? "";
  if (!text.trim()) throw new MediaInputError("voice text is required");
  const voiceId = input.voiceId?.trim() ?? "";
  if (!voiceId) throw new MediaInputError("voice id is required");

  const preset = findPreset(presets, voiceId);
  const resolvedVoiceId = preset?.elevenlabsVoiceId ?? DEFAULT_VOICE_ID;
  const modelId = preview ? VoiceModels.preview : VoiceModels.final;
  const body: VoiceRequest["body"] = {
    text,
    model_id: modelId,
    voice_settings: {
      stability: preset?.stability ?? DEFAULT_SETTINGS.stability,
      similarity_boost: preset?.similarityBoost ?? DEFAULT_SETTINGS.similarityBoost,
      style: preset?.style ?? DEFAULT_SETTINGS.style,
      use_speaker_boost: preset?.useSpeakerBoost ?? DEFAULT_SETTINGS.useSpeakerBoost,
    },
  };
  // multilingual v2 rejects language_code. Flash accepts it and Hindi needs it.
  if (preview) body.language_code = languageCode(input.language);

  return {
    voiceId: resolvedVoiceId,
    modelId,
    path: `/v1/text-to-speech/${encodeURIComponent(resolvedVoiceId)}/with-timestamps`,
    query: { output_format: "mp3_44100_128" },
    body,
  };
}
