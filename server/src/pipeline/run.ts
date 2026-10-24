import { env } from "../env.js";
import type { Job } from "../jobs/types.js";
import { appendActivity, getJob, setStage, updateJob } from "../jobs/store.js";
import { logEvent } from "../events/store.js";
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
  void runUntilScriptGate(jobId)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      try {
        appendActivity(jobId, { node: "pipeline", status: "failed", message });
        updateJob(jobId, { status: "failed", error: message });
      } catch {
        /* job gone */
      }
    })
    .finally(() => {
      running.delete(jobId);
    });
}

/** Resume after creator approves the script. */
export function continueAfterScriptApproval(jobId: string): void {
  if (running.has(jobId)) return;
  running.add(jobId);
  void runAfterScript(jobId)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      try {
        appendActivity(jobId, { node: "pipeline", status: "failed", message });
        updateJob(jobId, { status: "failed", error: message });
      } catch {
        /* ignore */
      }
    })
    .finally(() => {
      running.delete(jobId);
    });
}

async function runUntilScriptGate(jobId: string): Promise<void> {
  const job = getJob(jobId);
  if (!job) throw new Error("Job not found");

  updateJob(jobId, { status: "running", error: undefined });
  appendActivity(jobId, { node: "supervisor", status: "started", message: "Script → (approval) → Visuals → Voice → Render → Verify" });

  setStage(jobId, "script", "running");
  appendActivity(jobId, {
    node: "script",
    status: "started",
    provider: env.mockMode ? "mock" : "openai",
    tool: env.mockMode ? undefined : "generateObject",
    message: "Drafting kids explainer script",
  });
  const script = await runScriptNode(job);
  updateJob(jobId, { script });
  setStage(jobId, "script", "done", `${script.scenes.length} scenes`);
  appendActivity(jobId, {
    node: "script",
    status: "done",
    provider: env.mockMode ? "mock" : "openai",
    tool: env.mockMode ? undefined : "generateObject",
    message: `${script.scenes.length} scenes — waiting for creator approval`,
  });

  updateJob(jobId, { status: "awaiting_script_approval" });
  appendActivity(jobId, {
    node: "approval",
    status: "waiting",
    message: "Human-in-the-loop: approve script before visuals/voice",
  });
}

async function runAfterScript(jobId: string): Promise<void> {
  let job = getJob(jobId);
  if (!job) throw new Error("Job not found");
  if (!job.script) throw new Error("No script to produce");

  updateJob(jobId, { status: "running", error: undefined });
  const stages = planStages(job);

  const produce = async (): Promise<void> => {
    // --- visuals ---
    setStage(jobId, "visuals", "running");
    appendActivity(jobId, {
      node: "visuals",
      status: "started",
      provider: env.visualsProvider,
      message: `Provider ${env.visualsProvider}`,
    });
    let scenes = await runVisualsNode(getJob(jobId)!);
    updateJob(jobId, { scenes });
    const nVid = scenes.filter((s) => s.visualKind === "video").length;
    setStage(
      jobId,
      "visuals",
      "done",
      `${scenes.length} scenes (${nVid} clips, ${scenes.length - nVid} stills)`,
    );
    appendActivity(jobId, {
      node: "visuals",
      status: "done",
      provider: env.visualsProvider,
      tool: scenes[0]?.visualProvider === "higgsfield" ? "MCP image/i2v" : scenes[0]?.visualProvider,
      message: `${scenes.length} scenes via ${env.visualsProvider}`,
    });

    // --- voice ---
    setStage(jobId, "voice", "running");
    appendActivity(jobId, {
      node: "voice",
      status: "started",
      provider: "elevenlabs",
      tool: env.mockMode ? "mock-sine" : env.elevenlabsTtsTool,
      message: "ElevenLabs TTS (MCP → REST fallback)",
    });
    scenes = await runVoiceNode(getJob(jobId)!, scenes);
    updateJob(jobId, { scenes });
    setStage(jobId, "voice", "done", `${scenes.length} clips`);
    appendActivity(jobId, {
      node: "voice",
      status: "done",
      provider: "elevenlabs",
      tool: env.mockMode ? "mock-sine" : env.elevenlabsTtsTool,
      message: `${scenes.length} narration clips`,
    });

    // --- render ---
    setStage(jobId, "render", "running");
    appendActivity(jobId, { node: "render", status: "started", tool: "ffmpeg", message: "Assemble 9:16" });
    try {
      const { videoPath, videoUrl } = await runRenderNode(getJob(jobId)!, scenes);
      updateJob(jobId, { videoPath, videoUrl, slideshowFallback: false });
      setStage(jobId, "render", "done", "MP4 ready");
      appendActivity(jobId, { node: "render", status: "done", tool: "ffmpeg", message: "MP4 ready" });
      logEvent("render_done", `Render done for “${getJob(jobId)!.topic}”`, {
        userId: getJob(jobId)!.userId,
        jobId,
        meta: { videoUrl, slideshowFallback: false },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateJob(jobId, {
        slideshowFallback: true,
        videoPath: undefined,
        videoUrl: undefined,
        error: `Render failed (slideshow fallback): ${message}`,
      });
      setStage(jobId, "render", "failed", "using slideshow fallback");
      appendActivity(jobId, {
        node: "render",
        status: "failed",
        tool: "ffmpeg",
        message: `slideshow fallback: ${message.slice(0, 200)}`,
      });
      logEvent("render_done", `Render fallback (slideshow) for “${getJob(jobId)!.topic}”`, {
        userId: getJob(jobId)!.userId,
        jobId,
        meta: { slideshowFallback: true },
      });
    }

    // --- verify ---
    setStage(jobId, "verify", "running");
    appendActivity(jobId, { node: "verify", status: "started", message: "Schema + assets" });
    job = getJob(jobId)!;
    const result = await runVerifyNode(job, job.scenes);
    if (!result.ok) {
      setStage(jobId, "verify", "failed", result.errors.join("; "));
      appendActivity(jobId, { node: "verify", status: "failed", message: result.errors.join("; ") });
      throw new Error(`Verify failed: ${result.errors.join("; ")}`);
    }
    setStage(jobId, "verify", "done", job.slideshowFallback ? "slideshow ok" : "mp4 ok");
    appendActivity(jobId, {
      node: "verify",
      status: "done",
      message: job.slideshowFallback ? "slideshow ok" : "mp4 ok",
    });
  };

  try {
    await produce();
    updateJob(jobId, {
      status: "awaiting_final_approval",
      error: getJob(jobId)?.slideshowFallback ? getJob(jobId)?.error : undefined,
      publishUnlocked: false,
    });
    appendActivity(jobId, {
      node: "approval",
      status: "waiting",
      message: "Human-in-the-loop: approve final cut before publish/download",
    });
  } catch (err) {
    job = getJob(jobId)!;
    if (shouldRetryVerify(job, false)) {
      updateJob(jobId, { retryCount: job.retryCount + 1 });
      for (const name of stages) {
        if (name === "script") continue;
        setStage(jobId, name, "pending");
      }
      appendActivity(jobId, { node: "pipeline", status: "started", message: "One retry after verify failure" });
      try {
        await produce();
        updateJob(jobId, {
          status: "awaiting_final_approval",
          error: getJob(jobId)?.slideshowFallback ? getJob(jobId)?.error : undefined,
          publishUnlocked: false,
        });
        appendActivity(jobId, {
          node: "approval",
          status: "waiting",
          message: "Human-in-the-loop: approve final cut before publish/download",
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
  const scriptApproved = job.approvals.some((a) => a.kind === "script");
  const finalApproved = job.approvals.some((a) => a.kind === "final");
  return {
    id: job.id,
    userId: job.userId,
    topic: job.topic,
    language: job.language,
    style: job.style,
    status: job.status,
    stages: job.stages,
    script: job.script,
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
    /** Preview URL available after render; download gated by publishUnlocked. */
    videoUrl: job.videoUrl,
    slideshowFallback: job.slideshowFallback,
    publishUnlocked: job.publishUnlocked,
    scriptApproved,
    finalApproved,
    approvals: job.approvals,
    activity: job.activity,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    mockMode: env.mockMode,
    visualsProvider: env.visualsProvider,
  };
}
