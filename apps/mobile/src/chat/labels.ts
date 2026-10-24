import type { ArtefactKind, Stage } from "@chotu/shared";

export const STAGE_ORDER: readonly Stage[] = [
  "brief",
  "cast",
  "script",
  "prompts",
  "images",
  "clips",
  "audio",
  "final",
  "done",
];

export const STAGE_LABEL: Record<Stage, string> = {
  brief: "Brief",
  cast: "Cast",
  script: "Script",
  prompts: "Prompts",
  images: "Images",
  clips: "Clips",
  audio: "Audio",
  final: "Final cut",
  done: "Done",
};

export const KIND_LABEL: Record<ArtefactKind, string> = {
  identity: "Identity",
  sheet: "Character sheet",
  anchor: "Face anchor",
  voice_sample: "Voice sample",
  script: "Script",
  prompt: "Prompt",
  image: "Image",
  clip: "Clip",
  audio: "Audio",
  final: "Final cut",
};

export function stageMark(stage: Stage, current: Stage): "done" | "abhi" | "baad" {
  const here = STAGE_ORDER.indexOf(current);
  const there = STAGE_ORDER.indexOf(stage);
  if (there < here) return "done";
  if (there === here) return "abhi";
  return "baad";
}
