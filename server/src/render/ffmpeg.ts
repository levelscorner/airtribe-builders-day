import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { frameSize, type RendererInput, type RendererOutput } from "./types.js";

const bundledFont = join(dirname(fileURLToPath(import.meta.url)), "fonts", "NotoSansDevanagari-Regular.ttf");

/** DejaVu and Liberation have no Devanagari glyphs, so they are not fallbacks. */
const FONTS = [bundledFont, "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf"];

export function captionFont(): string {
  const found = FONTS.find((path) => existsSync(path));
  if (!found) {
    throw new Error(
      "Noto Sans Devanagari is required for Hindi captions. Expected server/src/render/fonts/NotoSansDevanagari-Regular.ttf",
    );
  }
  return found;
}

/** Break narration so one drawtext line fits the portrait frame. */
export function wrapCaption(text: string, maxChars: number): string {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter((word) => word.length > 0);
  const limit = Math.max(8, maxChars);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > limit) {
      lines.push(current);
      current = word;
      continue;
    }
    current = next;
  }
  if (current) lines.push(current);
  return lines.join("\n");
}

export function renderOutputPath(workDir: string, videoId: string): string {
  return join(workDir, safeVideoId(videoId), "final.mp4");
}

export function safeVideoId(videoId: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(videoId)) {
    throw new Error("videoId may only contain letters, numbers, _ and -");
  }
  return videoId;
}

export interface AssembleOptions {
  workDir: string;
  publicBaseUrl: string;
  fetchImpl?: typeof fetch;
}

export async function assembleWithFfmpeg(input: RendererInput, options: AssembleOptions): Promise<RendererOutput> {
  if (input.scenes.length === 0) throw new Error("render needs at least one scene");
  const videoId = safeVideoId(input.videoId);
  const { width, height } = frameSize(input.resolution);
  const workDir = resolve(options.workDir);
  const dir = join(workDir, videoId);
  await mkdir(dir, { recursive: true });
  const font = captionFont();
  const fontSize = captionFontSize(input.captionStyle, height);
  const segments: string[] = [];

  for (const scene of input.scenes) {
    if (!Number.isFinite(scene.durationMs) || scene.durationMs <= 0) {
      throw new Error(`scene ${scene.idx} has no duration`);
    }
    const segment = join(dir, `scene-${scene.idx}.mp4`);
    const audio = await materialize(scene.audioUrl, join(dir, `audio-${scene.idx}`), options.fetchImpl);
    const clip = scene.clipUrl
      ? await materialize(scene.clipUrl, join(dir, `clip-${scene.idx}`), options.fetchImpl)
      : undefined;
    const image = !clip && scene.imageUrl
      ? await materialize(scene.imageUrl, join(dir, `image-${scene.idx}`), options.fetchImpl)
      : undefined;
    const captionFile = join(dir, `caption-${scene.idx}.txt`);
    const wrapped = wrapCaption(scene.narration, captionWidthChars(width, fontSize));
    await writeFile(captionFile, wrapped);
    await encodeScene({
      segment,
      width,
      height,
      durationSec: scene.durationMs / 1000,
      audio,
      clip,
      image,
      captionFile: wrapped ? captionFile : undefined,
      font,
      fontSize,
    });
    segments.push(segment);
  }

  const listPath = join(dir, "concat.txt");
  await writeFile(listPath, segments.map((path) => `file '${path.replace(/'/g, "'\\''")}'`).join("\n"));
  const output = renderOutputPath(workDir, videoId);
  await run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", output]);
  const probed = await probeVideo(output);
  const base = options.publicBaseUrl.replace(/\/$/, "");
  return {
    url: `${base}/media/${videoId}/final.mp4`,
    durationMs: Math.round(probed.durationSec * 1000),
    provider: "ffmpeg",
  };
}

function captionFontSize(style: string | undefined, height: number): number {
  const base = style === "large" ? 72 : 56;
  return Math.max(28, Math.round(base * (height / 1920)));
}

function captionWidthChars(width: number, fontSize: number): number {
  return Math.max(12, Math.floor((width * 0.84) / (fontSize * 0.55)));
}

async function encodeScene(input: {
  segment: string;
  width: number;
  height: number;
  durationSec: number;
  audio: string;
  clip?: string;
  image?: string;
  captionFile?: string;
  font: string;
  fontSize: number;
}): Promise<void> {
  const voDur = await probeDuration(input.audio).catch(() => input.durationSec);
  const duration = voDur.toFixed(3);
  const videoInput = input.clip
    ? ["-i", input.clip]
    : input.image
      ? ["-loop", "1", "-i", input.image]
      : ["-f", "lavfi", "-i", `color=c=0x1a1a2e:s=${input.width}x${input.height}:r=25`];
  const draw = input.captionFile
    ? `drawtext=fontfile='${filterPath(input.font)}':textfile='${filterPath(input.captionFile)}':text_shaping=1:fontsize=${input.fontSize}:fontcolor=white:borderw=4:bordercolor=black:line_spacing=8:x=(w-text_w)/2:y=h-text_h-96,`
    : "";
  // Freeze the last frame so a short Seedance clip lasts as long as the voiceover.
  const tpad = input.clip ? `tpad=stop_mode=clone:stop_duration=${duration},` : "";
  const filter =
    `[0:v]scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},fps=25,${tpad}${draw}format=yuv420p[v];` +
    `[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,apad[a]`;
  await run("ffmpeg", [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...videoInput,
    "-i",
    input.audio,
    "-filter_complex",
    filter,
    "-map",
    "[v]",
    "-map",
    "[a]",
    "-t",
    duration,
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "96k",
    input.segment,
  ]);
}

function filterPath(path: string): string {
  return path.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

async function materialize(source: string, destWithoutExt: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetchImpl(source);
    if (!response.ok) throw new Error(`failed to fetch media (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    const dest = `${destWithoutExt}${extensionOf(source, response.headers.get("content-type"))}`;
    await mkdir(dirname(dest), { recursive: true });
    await writeFile(dest, bytes);
    return dest;
  }
  if (source.startsWith("file://")) return fileURLToPath(source);
  if (!existsSync(source)) throw new Error(`media file not found: ${source}`);
  return source;
}

function extensionOf(source: string, contentType: string | null): string {
  const fromUrl = source.split("?")[0]?.match(/(\.[a-z0-9]{2,4})$/i)?.[1];
  if (fromUrl) return fromUrl.toLowerCase();
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("wav")) return ".wav";
  if (contentType?.includes("mpeg") || contentType?.includes("mp3")) return ".mp3";
  return ".bin";
}

export interface Probe {
  width: number;
  height: number;
  durationSec: number;
}

async function probeDuration(path: string): Promise<number> {
  const duration = Number(await runCapture("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path,
  ]));
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`ffprobe could not read duration ${path}`);
  }
  return duration;
}

export async function probeVideo(path: string): Promise<Probe> {
  const duration = Number(await runCapture("ffprobe", [
    "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path,
  ]));
  const size = (await runCapture("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0:s=x", path,
  ])).trim();
  const [width, height] = size.split("x").map((part) => Number(part));
  if (!width || !height || !Number.isFinite(duration)) {
    throw new Error(`ffprobe could not read ${path}`);
  }
  return { width, height, durationSec: duration };
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

function runCapture(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`));
    });
  });
}
