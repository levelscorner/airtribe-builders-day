import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Job, SceneAssets } from "../jobs/types.js";
import { jobDir } from "../jobs/store.js";
import { resolveVisualsProvider } from "../visuals/index.js";

/** Visuals node — pluggable MCP (or mock) provider per VISUALS_PROVIDER. */
export async function runVisualsNode(job: Job): Promise<SceneAssets[]> {
  if (!job.script) throw new Error("Script missing before visuals");
  const dir = jobDir(job.id);
  const imagesDir = join(dir, "images");
  const videosDir = join(dir, "videos");
  await mkdir(imagesDir, { recursive: true });
  await mkdir(videosDir, { recursive: true });

  const provider = resolveVisualsProvider();
  const scenes: SceneAssets[] = [];

  for (let i = 0; i < job.script.scenes.length; i++) {
    const scene = job.script.scenes[i]!;
    const visual = await provider.generateSceneVisual({
      jobId: job.id,
      sceneIndex: i,
      prompt: scene.imagePrompt,
      style: job.style,
      imagesDir,
      videosDir,
    });

    scenes.push({
      index: i,
      narration: scene.narration,
      imagePrompt: scene.imagePrompt,
      imagePath: visual.imagePath,
      imageUrl: visual.imageUrl,
      videoPath: visual.videoPath,
      videoUrl: visual.videoUrl,
      visualKind: visual.kind,
      visualProvider: visual.provider,
      caption: scene.narration,
    });
  }

  return scenes;
}
