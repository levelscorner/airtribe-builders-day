import { join } from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { env } from "../env.js";
import { assetUrlFromPath } from "../jobs/store.js";
import type { SceneVisual, VisualsProvider, VisualsRequest } from "./types.js";

const W = 1080;
const H = 1920;

const PALETTE = [
  ["#F6E7D8", "#C45C26"],
  ["#E8F4F8", "#2A6F7A"],
  ["#F3E8FF", "#6B4C9A"],
  ["#EAF6E8", "#3D7A4A"],
  ["#FFF3D6", "#B8860B"],
];

function wrapText(text: string, max: number): string[] {
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
  return lines.slice(0, 4);
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function mockImage(prompt: string, index: number, outPath: string): Promise<void> {
  const [bg, accent] = PALETTE[index % PALETTE.length]!;
  const lines = wrapText(prompt.slice(0, 120), 28);
  const textSvg = lines
    .map(
      (line, i) =>
        `<text x="540" y="${820 + i * 56}" text-anchor="middle" font-family="Georgia, serif" font-size="42" fill="${accent}">${escapeXml(line)}</text>`,
    )
    .join("");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.35"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <circle cx="540" cy="480" r="180" fill="${accent}" opacity="0.25"/>
  <text x="540" y="500" text-anchor="middle" font-family="Georgia, serif" font-size="120" fill="${accent}">✦</text>
  ${textSvg}
  <text x="540" y="1750" text-anchor="middle" font-family="Georgia, serif" font-size="36" fill="${accent}" opacity="0.7">Chotu mini · scene ${index + 1}</text>
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(outPath);
}

function runCmd(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let err = "";
    p.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(-600)}`));
    });
  });
}

async function mockClipFromStill(imagePath: string, outPath: string, durationSec = 3): Promise<void> {
  const frames = Math.max(25, Math.round(durationSec * 25));
  await runCmd("ffmpeg", [
    "-y",
    "-loop",
    "1",
    "-framerate",
    "25",
    "-i",
    imagePath,
    "-filter_complex",
    `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},` +
      `zoompan=z='min(1+0.0008*on,1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=25,setsar=1`,
    "-t",
    durationSec.toFixed(2),
    "-an",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outPath,
  ]);
}

export class MockVisualsProvider implements VisualsProvider {
  readonly id = "mock" as const;

  async generateSceneVisual(req: VisualsRequest): Promise<SceneVisual> {
    const imagePath = join(req.imagesDir, `scene-${req.sceneIndex}.png`);
    await mockImage(req.prompt, req.sceneIndex, imagePath);

    if (!env.mockVisualsClips) {
      return {
        kind: "image",
        imagePath,
        imageUrl: assetUrlFromPath(imagePath),
        provider: this.id,
      };
    }

    const videoPath = join(req.videosDir, `scene-${req.sceneIndex}.mp4`);
    await mockClipFromStill(imagePath, videoPath, 3);
    return {
      kind: "video",
      imagePath,
      imageUrl: assetUrlFromPath(imagePath),
      videoPath,
      videoUrl: assetUrlFromPath(videoPath),
      provider: this.id,
      meta: { mockClip: true },
    };
  }
}
