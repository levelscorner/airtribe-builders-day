import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { env } from "../env.js";
import type { Job, SceneAssets } from "../jobs/types.js";
import { assetUrlFromPath, jobDir } from "../jobs/store.js";
import { callMcpTool } from "../mcp/client.js";
import { downloadUrlToFile } from "../mcp/download.js";
import { extractUrls, toolResultToText } from "../mcp/extract.js";
import { withOneRetry } from "../mcp/poll.js";
import { getMcpServer } from "../mcp/registry.js";

function textHash(text: string, voiceId: string): string {
  return createHash("sha256").update(`${voiceId}\n${text}`).digest("hex").slice(0, 24);
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
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(-800)}`));
    });
  });
}

async function probeDurationSec(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", audioPath],
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

function estimateDurationSec(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2.5, Math.min(12, words / 2.4));
}

async function synthesizeMockMp3(text: string, outPath: string): Promise<number> {
  const duration = estimateDurationSec(text);
  await runCmd("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=440:duration=${duration.toFixed(2)}`,
    "-af",
    "volume=0.15",
    "-codec:a",
    "libmp3lame",
    "-q:a",
    "4",
    outPath,
  ]);
  return probeDurationSec(outPath);
}

async function synthesizeElevenLabsRest(text: string, outPath: string): Promise<number> {
  const voiceId = env.elevenlabsVoiceId;
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": env.elevenlabsApiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
        style: 0.35,
        use_speaker_boost: true,
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ElevenLabs REST TTS failed: ${res.status} ${body}`);
  }
  await writeFile(outPath, Buffer.from(await res.arrayBuffer()));
  return probeDurationSec(outPath);
}

async function synthesizeElevenLabsMcp(text: string, outPath: string): Promise<number> {
  const server = getMcpServer("elevenlabs");
  if (!server) throw new Error("ElevenLabs MCP not connected");

  await withOneRetry(async () => {
    const { result } = await callMcpTool(
      server.tools,
      env.elevenlabsTtsTool,
      {
        text,
        voice_id: env.elevenlabsVoiceId,
        voiceId: env.elevenlabsVoiceId,
        model_id: "eleven_multilingual_v2",
        modelId: "eleven_multilingual_v2",
        output_format: "mp3_44100_128",
      },
      ["text_to_speech", "tts", "speak", "generate_speech", "speech"],
    );

    const urls = extractUrls(result, ["mp3", "wav", "mpeg"]);
    const dataUrl = urls.find((u) => u.startsWith("data:")) ?? urls[0];
    if (dataUrl) {
      await downloadUrlToFile(dataUrl, outPath);
      return;
    }

    // Some MCP servers return base64 in text without data: prefix
    const raw = toolResultToText(result);
    const b64 = raw.match(/(?:base64[,:\s]+)([A-Za-z0-9+/=\s]{100,})/);
    if (b64?.[1]) {
      await writeFile(outPath, Buffer.from(b64[1].replace(/\s+/g, ""), "base64"));
      return;
    }

    throw new Error(`ElevenLabs MCP TTS returned no audio URL. Got: ${raw.slice(0, 300)}`);
  }, "elevenlabs-mcp-tts");

  return probeDurationSec(outPath);
}

export async function runVoiceNode(job: Job, scenes: SceneAssets[]): Promise<SceneAssets[]> {
  const dir = jobDir(job.id);
  const cacheDir = join(env.dataDir, "cache", "voice");
  await mkdir(cacheDir, { recursive: true });
  const voiceKey = env.mockMode ? "mock" : env.elevenlabsVoiceId;

  const out: SceneAssets[] = [];
  for (const scene of scenes) {
    const hash = textHash(scene.narration, voiceKey);
    const cachePath = join(cacheDir, `${hash}.mp3`);
    const audioPath = join(dir, "audio", `scene-${scene.index}.mp3`);

    let duration: number;
    if (existsSync(cachePath)) {
      await copyFile(cachePath, audioPath);
      duration = await probeDurationSec(audioPath);
    } else if (env.mockMode) {
      duration = await synthesizeMockMp3(scene.narration, audioPath);
      await copyFile(audioPath, cachePath);
    } else {
      try {
        duration = await synthesizeElevenLabsMcp(scene.narration, audioPath);
      } catch (mcpErr) {
        console.warn(
          "[voice] ElevenLabs MCP TTS failed, falling back to REST:",
          mcpErr instanceof Error ? mcpErr.message : mcpErr,
        );
        duration = await synthesizeElevenLabsRest(scene.narration, audioPath);
      }
      await copyFile(audioPath, cachePath);
    }

    out.push({
      ...scene,
      audioPath,
      audioUrl: assetUrlFromPath(audioPath),
      audioDurationSec: duration,
    });
  }
  return out;
}
