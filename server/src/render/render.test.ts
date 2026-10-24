import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import sharp from "sharp";
import { captionFont, probeVideo, renderOutputPath, wrapCaption } from "./ffmpeg.js";
import { createRenderer } from "./index.js";
import type { RendererInput } from "./types.js";

async function fixtures(): Promise<{
  dir: string;
  image: string;
  audio: string;
  clip: string;
  cleanup: () => Promise<void>;
}> {
  const dir = await mkdtemp(join(tmpdir(), "chotu-render-"));
  const image = join(dir, "still.png");
  const audio = join(dir, "voice.wav");
  const clip = join(dir, "clip.mp4");
  await sharp({
    create: { width: 640, height: 360, channels: 3, background: { r: 180, g: 16, b: 16 } },
  })
    .png()
    .toFile(image);
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=0.5",
    audio,
  ]);
  await run("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=blue:s=320x180:r=25:d=0.5",
    "-f", "lavfi", "-i", "sine=frequency=660:sample_rate=44100:duration=0.5",
    "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    clip,
  ]);
  return { dir, image, audio, clip, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test("captions use Devanagari and wrap inside the frame", () => {
  assert.match(captionFont(), /NotoSansDevanagari/);
  assert.doesNotMatch(captionFont(), /DejaVu|Liberation/);
  const wrapped = wrapCaption("एक लम्बी लाइन जो फ्रेम के बाहर चली जाती अगर हम उसे एक ही पंक्ति में रखते", 18);
  assert.ok(wrapped.includes("\n"));
  for (const line of wrapped.split("\n")) {
    assert.ok(line.length <= 18 || !line.includes(" "), line);
  }
});

test("ffmpeg burns captions into a 1080x1920 cut", async () => {
  const files = await fixtures();
  const workDir = join(files.dir, "out");
  try {
    const input: RendererInput = {
      videoId: "sample1080",
      aspectRatio: "9:16",
      resolution: "1080p",
      captionStyle: "large",
      scenes: [
        { idx: 0, imageUrl: files.image, audioUrl: files.audio, narration: "नमस्ते Chotu", durationMs: 500 },
        { idx: 1, clipUrl: files.clip, audioUrl: files.audio, narration: "Hello", durationMs: 500 },
      ],
    };
    const rendered = await createRenderer({
      mock: false,
      publicBaseUrl: "http://localhost:8787",
      workDir,
    }).render(input);
    assert.equal(rendered.provider, "ffmpeg");
    assert.equal(rendered.url, "http://localhost:8787/media/sample1080/final.mp4");
    const probed = await probeVideo(renderOutputPath(workDir, "sample1080"));
    assert.equal(probed.width, 1080);
    assert.equal(probed.height, 1920);
    assert.ok(probed.durationSec > 0.8 && probed.durationSec < 1.4, `duration ${probed.durationSec}`);

    const frame = join(files.dir, "frame.png");
    await run("ffmpeg", [
      "-y", "-hide_banner", "-loglevel", "error",
      "-ss", "0.2", "-i", renderOutputPath(workDir, "sample1080"),
      "-frames:v", "1", frame,
    ]);
    const { data, info } = await sharp(frame).raw().toBuffer({ resolveWithObject: true });
    let maxChroma = 0;
    const y0 = info.height - 320;
    const y1 = info.height - 80;
    const x0 = Math.floor(info.width / 2) - 360;
    const x1 = Math.floor(info.width / 2) + 360;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 2) {
        const i = (y * info.width + x) * info.channels;
        maxChroma = Math.max(maxChroma, data[i + 1] ?? 0, data[i + 2] ?? 0);
      }
    }
    assert.ok(maxChroma > 200, `caption band stayed dark (max G/B ${maxChroma})`);
  } finally {
    await files.cleanup();
  }
});

test("MOCK=1 returns colour frames even when a Render key is set", async () => {
  const dir = await mkdtemp(join(tmpdir(), "chotu-mock-"));
  try {
    const rendered = await createRenderer({
      mock: true,
      renderApiKey: "rnd_should_not_be_used",
      workDir: dir,
      publicBaseUrl: "http://localhost:8787",
    }).render({
      videoId: "mockcut",
      aspectRatio: "9:16",
      resolution: "1080p",
      scenes: [{ idx: 0, audioUrl: "unused", narration: "", durationMs: 300 }],
    });
    assert.equal(rendered.provider, "mock");
    const probed = await probeVideo(renderOutputPath(dir, "mockcut"));
    assert.equal(probed.width, 1080);
    assert.equal(probed.height, 1920);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a Render workflow result is used, and a failed run falls back to ffmpeg", async () => {
  const files = await fixtures();
  const workDir = join(files.dir, "out");
  try {
    const remote = await createRenderer({
      mock: false,
      renderApiKey: "rnd_test",
      workDir,
      publicBaseUrl: "http://localhost:8787",
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body));
        assert.equal(body.task, "chotu-render/assemble");
        assert.equal(body.idempotencyKey, "remote1");
        const headers = init?.headers as { authorization?: string };
        assert.equal(headers.authorization, "Bearer rnd_test");
        return Response.json(
          { id: "trn_1", status: "succeeded", results: [{ url: "https://cdn.example/final.mp4", durationMs: 1000 }] },
          { status: 202 },
        );
      },
    }).render({
      videoId: "remote1",
      aspectRatio: "9:16",
      resolution: "1080p",
      scenes: [{ idx: 0, audioUrl: files.audio, narration: "skip", durationMs: 400 }],
    });
    assert.equal(remote.provider, "render_workflow");
    assert.equal(remote.url, "https://cdn.example/final.mp4");

    const local = await createRenderer({
      mock: false,
      renderApiKey: "rnd_test",
      workDir,
      publicBaseUrl: "http://localhost:8787",
      fetchImpl: async () => new Response("nope", { status: 500 }),
    }).render({
      videoId: "fallback1",
      aspectRatio: "9:16",
      resolution: "1080p",
      scenes: [{ idx: 0, imageUrl: files.image, audioUrl: files.audio, narration: "नमस्ते", durationMs: 400 }],
    });
    assert.equal(local.provider, "ffmpeg");
    const probed = await probeVideo(renderOutputPath(workDir, "fallback1"));
    assert.equal(probed.width, 1080);
    assert.equal(probed.height, 1920);
  } finally {
    await files.cleanup();
  }
});

test("a relative workDir still writes final.mp4", async () => {
  const files = await fixtures();
  const rel = join("tmp-chotu-rel", `run-${Date.now()}`);
  try {
    const rendered = await createRenderer({
      mock: false,
      publicBaseUrl: "http://localhost:8787",
      workDir: rel,
    }).render({
      videoId: "rel1",
      aspectRatio: "9:16",
      resolution: "720p",
      scenes: [{ idx: 0, imageUrl: files.image, audioUrl: files.audio, narration: "short line", durationMs: 400 }],
    });
    assert.equal(rendered.provider, "ffmpeg");
    const { existsSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    assert.equal(existsSync(resolve(rel, "rel1", "final.mp4")), true);
  } finally {
    await rm(rel, { recursive: true, force: true });
    await files.cleanup();
  }
});

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
      else reject(new Error(`${cmd} exited ${code}: ${err.slice(-500)}`));
    });
  });
}
