import type { Genre } from "@chotu/shared";

/**
 * Studio voice bank. The seed and docs/13 ship 4 presets.
 * An 11-voice bank was not in this repo or in the inaccessible chotu-craft checkout.
 * `voiceId` on a planned scene is one of these ids.
 */
export const VOICE_BANK = [
  { id: "warm_kid_female", label: "Warm kid-friendly female", genres: ["kids"] as const },
  { id: "playful_young_male", label: "Playful young male", genres: ["kids"] as const },
  { id: "confident_presenter_female", label: "Confident presenter female", genres: ["ad"] as const },
  { id: "deep_storyteller_male", label: "Deep storyteller male", genres: ["faceless", "kids", "ad"] as const },
] as const;

export const VOICE_IDS = VOICE_BANK.map((voice) => voice.id);

export function defaultVoiceId(genre: Genre): string {
  if (genre === "ad") return "confident_presenter_female";
  if (genre === "faceless") return "deep_storyteller_male";
  return "playful_young_male";
}

export function isVoiceId(value: string): boolean {
  return (VOICE_IDS as readonly string[]).includes(value);
}
