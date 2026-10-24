import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import type { Job, SceneAssets } from "../jobs/types.js";
import { assetUrlFromPath, jobDir } from "../jobs/store.js";

const W = 1080;
const H = 1920;

function runCmd(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(-1200)}`));
    });
  });
}

function probeDuration(path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    p.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    p.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    p.on("close", (code) => {
      if (code !== 0) reject(new Error(`ffprobe failed: ${err}`));
      else {
        const n = Number.parseFloat(out.trim());
        resolve(Number.isFinite(n) && n > 0 ? n : 3);
      }
    });
  });
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapCaption(text: string, max = 32): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}

async function makeCaptionPng(text: string, outPath: string): Promise<void> {
  const lines = wrapCaption(text);
  const lineSvgs = lines
    .map((line, i) => {
      const y = 160 + i * 70;
      return `<text x="540" y="${y}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="48" font-weight="700" fill="white" stroke="#1a1a1a" stroke-width="6" paint-order="stroke">${escapeXml(line)}</text>`;
    })
    .join("\n");

  const boxH = 120 + lines.length * 70;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${boxH}" xmlns="http://www.w3.org/2000/svg">
  <rect x="40" y="40" width="${W - 80}" height="${boxH - 60}" rx="28" fill="rgba(0,0,0,0.55)"/>
  ${lineSvgs}
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outPath);
}

/** Ken Burns still → timed clip with caption overlay. */
async function renderFromStill(scene: SceneAssets, clipPath: string, captionPath: string): Promise<void> {
  if (!scene.imagePath || !scene.audioPath) {
    throw new Error(`Scene ${scene.index} missing image or audio`);
  }
  const duration = scene.audioDurationSec ?? 4;
  const frames = Math.max(25, Math.round(duration * 25));
  await runCmd("ffmpeg", [
    "-y",
    "-loop",
    "1",
    "-framerate",
    "25",
    "-i",
    scene.imagePath,
    "-i",
    scene.audioPath,
    "-loop",
    "1",
    "-framerate",
    "25",
    "-i",
    captionPath,
    "-filter_complex",
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
      `zoompan=z='min(1+0.0005*on,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=25,setsar=1[vkb];` +
      `[2:v]format=rgba,scale=${W}:-1[cap];` +
      `[vkb][cap]overlay=x=0:y=H-h-80[vout]`,
    "-map",
    "[vout]",
    "-map",
    "1:a",
    "-t",
    duration.toFixed(3),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    clipPath,
  ]);
}

/**
 * Motion clip → trim or loop to match audio length, then burn caption.
 * - clip shorter than audio: loop (-stream_loop -1) then -t audioDur
 * - clip longer than audio: trim with -t audioDur
 */
async function renderFromVideo(scene: SceneAssets, clipPath: string, captionPath: string): Promise<void> {
  if (!scene.videoPath || !scene.audioPath) {
    throw new Error(`Scene ${scene.index} missing video or audio`);
  }
  const target = scene.audioDurationSec ?? 4;
  const srcDur = await probeDuration(scene.videoPath);
  // Loop if source is shorter than target (with small epsilon)
  const loopArgs = srcDur + 0.05 < target ? ["-stream_loop", "-1"] : [];

  await runCmd("ffmpeg", [
    "-y",
    ...loopArgs,
    "-i",
    scene.videoPath,
    "-i",
    scene.audioPath,
    "-loop",
    "1",
    "-framerate",
    "25",
    "-i",
    captionPath,
    "-filter_complex",
    `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=25,setsar=1[v];` +
      `[2:v]format=rgba,scale=${W}:-1[cap];` +
      `[v][cap]overlay=x=0:y=H-h-80[vout]`,
    "-map",
    "[vout]",
    "-map",
    "1:a",
    "-t",
    target.toFixed(3),
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    clipPath,
  ]);
}

async function renderSceneClip(scene: SceneAssets, clipPath: string, captionPath: string): Promise<void> {
  if (scene.videoPath && (scene.visualKind === "video" || scene.videoPath.endsWith(".mp4"))) {
    await renderFromVideo(scene, clipPath, captionPath);
  } else {
    await renderFromStill(scene, clipPath, captionPath);
  }
}

export async function runRenderNode(
  job: Job,
  scenes: SceneAssets[],
): Promise<{ videoPath: string; videoUrl: string }> {
  const dir = jobDir(job.id);
  const clipsDir = join(dir, "clips");
  const captionsDir = join(dir, "captions");
  await mkdir(clipsDir, { recursive: true });
  await mkdir(captionsDir, { recursive: true });

  const clipPaths: string[] = [];
  for (const scene of scenes) {
    const captionPath = join(captionsDir, `scene-${scene.index}.png`);
    await makeCaptionPng(scene.narration, captionPath);
    const clipPath = join(clipsDir, `scene-${scene.index}.mp4`);
    await renderSceneClip(scene, clipPath, captionPath);
    clipPaths.push(clipPath);
  }

  const listPath = join(clipsDir, "concat.txt");
  await writeFile(listPath, clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"));

  const videoPath = join(dir, "output.mp4");
  await runCmd("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", videoPath]);

  return { videoPath, videoUrl: assetUrlFromPath(videoPath) };
}
