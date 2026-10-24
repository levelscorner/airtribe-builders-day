import type { ArtefactSummary, CastMember, PlannedScene, Scene, ScenePlan } from "@chotu/shared";

/** Seedance accepts 5s or 10s. Shorter scenes snap to 5; 7.5s and up snap to 10. */
export function durationSecOf(durationMs: number | undefined): 5 | 10 {
  return (durationMs ?? 0) >= 7500 ? 10 : 5;
}

export function clipDurationMs(durationMs: number | undefined): number {
  return durationSecOf(durationMs) * 1000;
}

function plannedFromPayload(payload: Record<string, unknown> | undefined): PlannedScene[] | undefined {
  const plan = payload?.scenePlan;
  if (!plan || typeof plan !== "object" || !("scenes" in plan)) return undefined;
  const scenes = (plan as { scenes?: unknown }).scenes;
  if (!Array.isArray(scenes)) return undefined;
  const rows = scenes.filter((item): item is PlannedScene => {
    if (!item || typeof item !== "object") return false;
    const row = item as Partial<PlannedScene>;
    return (
      typeof row.imagePrompt === "string" &&
      typeof row.motionPrompt === "string" &&
      (row.durationSec === 5 || row.durationSec === 10) &&
      typeof row.vo === "string" &&
      typeof row.voiceId === "string"
    );
  });
  return rows.length ? rows : undefined;
}

/** Prefer the Claude `ScenePlan` on the script artefact. Otherwise assemble `PlannedScene` rows. */
export function buildScenePlan(input: {
  scenes: Scene[];
  artefacts: ArtefactSummary[];
  cast: CastMember[];
}): ScenePlan {
  const script = input.artefacts.find((item) => item.kind === "script");
  const stored = plannedFromPayload(script?.payload);
  if (stored) return { scenes: stored };
  return {
    scenes: input.scenes.map((scene) => {
      const prompt = input.artefacts.find((item) => item.kind === "prompt" && item.sceneId === scene.id);
      const voice = input.artefacts.find(
        (item) => (item.kind === "voice" || item.kind === "audio") && item.sceneId === scene.id,
      );
      const speaker =
        input.cast.find((member) => scene.castIds.includes(member.id) && member.voiceId) ??
        input.cast.find((member) => scene.castIds.includes(member.id));
      const voiceId =
        typeof voice?.payload.voiceId === "string" && voice.payload.voiceId
          ? voice.payload.voiceId
          : speaker?.voiceId ?? "";
      const vo =
        typeof voice?.payload.narration === "string" && voice.payload.narration
          ? voice.payload.narration
          : scene.narration ?? "";
      const motion =
        typeof prompt?.payload.videoPrompt === "string"
          ? prompt.payload.videoPrompt
          : typeof prompt?.payload.motionPrompt === "string"
            ? prompt.payload.motionPrompt
            : "";
      return {
        imagePrompt: typeof prompt?.payload.imagePrompt === "string" ? prompt.payload.imagePrompt : "",
        motionPrompt: motion,
        durationSec: durationSecOf(scene.durationMs),
        vo,
        voiceId,
      };
    }),
  };
}
