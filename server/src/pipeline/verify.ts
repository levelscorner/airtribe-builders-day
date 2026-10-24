import { stat } from "node:fs/promises";
import { ScriptSchema, type Job, type SceneAssets } from "../jobs/types.js";

export interface VerifyResult {
  ok: boolean;
  errors: string[];
}

export async function runVerifyNode(job: Job, scenes: SceneAssets[]): Promise<VerifyResult> {
  const errors: string[] = [];

  if (!job.script) {
    errors.push("Missing script");
  } else {
    const parsed = ScriptSchema.safeParse(job.script);
    if (!parsed.success) {
      errors.push(`Script schema invalid: ${parsed.error.message}`);
    }
  }

  if (scenes.length < 4 || scenes.length > 5) {
    errors.push(`Expected 4–5 scenes, got ${scenes.length}`);
  }

  for (const scene of scenes) {
    // Poster/still required for slideshow fallback; motion clip optional.
    if (!scene.imagePath) errors.push(`Scene ${scene.index}: missing image`);
    else {
      try {
        const s = await stat(scene.imagePath);
        if (s.size <= 0) errors.push(`Scene ${scene.index}: empty image`);
      } catch {
        errors.push(`Scene ${scene.index}: image unreadable`);
      }
    }
    if (scene.visualKind === "video") {
      if (!scene.videoPath) errors.push(`Scene ${scene.index}: visualKind=video but missing videoPath`);
      else {
        try {
          const s = await stat(scene.videoPath);
          if (s.size <= 0) errors.push(`Scene ${scene.index}: empty video clip`);
        } catch {
          errors.push(`Scene ${scene.index}: video clip unreadable`);
        }
      }
    }
    if (!scene.audioPath) errors.push(`Scene ${scene.index}: missing audio`);
    else {
      try {
        const s = await stat(scene.audioPath);
        if (s.size <= 0) errors.push(`Scene ${scene.index}: empty audio`);
      } catch {
        errors.push(`Scene ${scene.index}: audio unreadable`);
      }
    }
  }

  if (!job.slideshowFallback) {
    if (!job.videoPath) {
      errors.push("Missing output video");
    } else {
      try {
        const s = await stat(job.videoPath);
        if (s.size <= 0) errors.push("Output video is empty");
      } catch {
        errors.push("Output video unreadable");
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
