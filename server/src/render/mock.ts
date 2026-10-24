import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { probeVideo, renderOutputPath, safeVideoId } from "./ffmpeg.js";
import { frameSize, type Renderer, type RendererInput, type RendererOutput } from "./types.js";
import { spawn } from "node:child_process";

/** Colour frames plus silence. Enough for a player when MOCK=1. */
export function createMockRenderer(options: { workDir: string; publicBaseUrl: string }): Renderer {
  return {
    async render(input: RendererInput): Promise<RendererOutput> {
      const videoId = safeVideoId(input.videoId);
      const { width, height } = frameSize(input.resolution);
      const durationSec = Math.max(0.2, input.scenes.reduce((sum, scene) => sum + scene.durationMs, 0) / 1000);
      const output = renderOutputPath(options.workDir, videoId);
      await mkdir(join(options.workDir, videoId), { recursive: true });
      await run("ffmpeg", [
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        `color=c=0x2b2d42:s=${width}x${height}:r=25:d=${durationSec.toFixed(3)}`,
        "-f",
        "lavfi",
        "-i",
        `anullsrc=r=44100:cl=stereo`,
        "-t",
        durationSec.toFixed(3),
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-shortest",
        output,
      ]);
      const probed = await probeVideo(output);
      const base = options.publicBaseUrl.replace(/\/$/, "");
      return {
        url: `${base}/media/${videoId}/final.mp4`,
        durationMs: Math.round(probed.durationSec * 1000),
        provider: "mock",
      };
    },
  };
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`));
    });
  });
}
