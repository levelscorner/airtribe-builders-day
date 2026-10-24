import { env } from "../env.js";
import type { Job } from "../jobs/types.js";
import { getJob, setStage, updateJob } from "../jobs/store.js";
import { planStages, shouldRetryVerify } from "./supervisor.js";
import { runScriptNode } from "./script.js";
import { runVisualsNode } from "./visuals.js";
import { runVoiceNode } from "./voice.js";
import { runRenderNode } from "./render.js";
import { runVerifyNode } from "./verify.js";

const running = new Set<string>();

export function enqueueJob(jobId: string): void {
  if (running.has(jobId)) return;
  running.add(jobId);
  void executeJob(jobId)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      try {
        updateJob(jobId, { status: "failed", error: message });
      } catch {
        /* job gone */
      }
    })
    .finally(() => {
      running.delete(jobId);
    });
}

async function executeJob(jobId: string): Promise<void> {
  let job = getJob(jobId);
  if (!job) throw new Error("Job not found");

  updateJob(jobId, { status: "running", error: undefined });
  const stages = planStages(job);

  const runOnce = async (): Promise<void> => {
    job = getJob(jobId)!;

    setStage(jobId, "script", "running");
    const script = await runScriptNode(job);
    updateJob(jobId, { script });
    setStage(jobId, "script", "done", `${script.scenes.length} scenes`);

    setStage(jobId, "visuals", "running");
    let scenes = await runVisualsNode(getJob(jobId)!);
    updateJob(jobId, { scenes });
    const nVid = scenes.filter((s) => s.visualKind === "video").length;
    setStage(
      jobId,
      "visuals",
      "done",
      `${scenes.length} scenes (${nVid} clips, ${scenes.length - nVid} stills)`,
    );

    setStage(jobId, "voice", "running");
    scenes = await runVoiceNode(getJob(jobId)!, scenes);
    updateJob(jobId, { scenes });
    setStage(jobId, "voice", "done", `${scenes.length} clips`);

    setStage(jobId, "render", "running");
    try {
      const { videoPath, videoUrl } = await runRenderNode(getJob(jobId)!, scenes);
      updateJob(jobId, {
        videoPath,
        videoUrl,
        slideshowFallback: false,
      });
      setStage(jobId, "render", "done", "MP4 ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateJob(jobId, {
        slideshowFallback: true,
        videoPath: undefined,
        videoUrl: undefined,
        error: `Render failed (slideshow fallback): ${message}`,
      });
      setStage(jobId, "render", "failed", "using slideshow fallback");
    }

    setStage(jobId, "verify", "running");
    job = getJob(jobId)!;
    const result = await runVerifyNode(job, job.scenes);
    if (!result.ok) {
      setStage(jobId, "verify", "failed", result.errors.join("; "));
      throw new Error(`Verify failed: ${result.errors.join("; ")}`);
    }
    setStage(jobId, "verify", "done", job.slideshowFallback ? "slideshow ok" : "mp4 ok");
  };

  try {
    await runOnce();
    updateJob(jobId, {
      status: "done",
      error: getJob(jobId)?.slideshowFallback ? getJob(jobId)?.error : undefined,
    });
  } catch (err) {
    job = getJob(jobId)!;
    if (shouldRetryVerify(job, false)) {
      updateJob(jobId, { retryCount: job.retryCount + 1 });
      for (const name of stages) {
        setStage(jobId, name, "pending");
      }
      try {
        await runOnce();
        updateJob(jobId, {
          status: "done",
          error: getJob(jobId)?.slideshowFallback ? getJob(jobId)?.error : undefined,
        });
        return;
      } catch (retryErr) {
        const message = retryErr instanceof Error ? retryErr.message : String(retryErr);
        updateJob(jobId, { status: "failed", error: message });
        return;
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    updateJob(jobId, { status: "failed", error: message });
  }
}

export function toPublicJob(job: Job) {
  return {
    id: job.id,
    topic: job.topic,
    language: job.language,
    style: job.style,
    status: job.status,
    stages: job.stages,
    script: job.script
      ? { title: job.script.title, sceneCount: job.script.scenes.length }
      : undefined,
    scenes: job.scenes.map((s) => ({
      index: s.index,
      narration: s.narration,
      imageUrl: s.imageUrl,
      videoUrl: s.videoUrl,
      visualKind: s.visualKind,
      visualProvider: s.visualProvider,
      audioUrl: s.audioUrl,
      audioDurationSec: s.audioDurationSec,
      caption: s.caption,
    })),
    videoUrl: job.videoUrl,
    slideshowFallback: job.slideshowFallback,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    mockMode: env.mockMode,
    visualsProvider: env.visualsProvider,
  };
}
