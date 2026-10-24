import assert from "node:assert/strict";
import test from "node:test";
import {
  castAnchorIds,
  mapWithConcurrency,
  regenScope,
  runSceneShots,
  sceneDurationSec,
  type SceneShot,
  type StepMedia,
} from "./scenes.ts";

function shot(index: number): SceneShot {
  return {
    sceneId: `s${index}`,
    index,
    imagePrompt: `still ${index}`,
    motionPrompt: `move ${index}`,
    durationSec: index % 2 === 0 ? 5 : 10,
    vo: `line ${index}`,
    voiceId: "FZkK3TvQ0pjyDmT8fzIW",
    anchorUrls: index === 0 ? ["ref:https%3A%2F%2Fcdn.example%2Fface.png"] : [],
  };
}

function media(kind: string, sceneId: string): StepMedia {
  return {
    url: `mock://${sceneId}/${kind}`,
    provider: "mock",
    model: kind,
    providerLabel: "Mock",
  };
}

test("scene pool stays at the concurrency limit", async () => {
  let active = 0;
  let peak = 0;
  const release: Array<() => void> = [];
  const running = mapWithConcurrency(
    [0, 1, 2, 3, 4, 5],
    3,
    () =>
      new Promise<number>((resolve) => {
        active += 1;
        peak = Math.max(peak, active);
        release.push(() => {
          active -= 1;
          resolve(peak);
        });
      }),
  );
  await waitFor(() => release.length === 3);
  assert.equal(release.length, 3);
  assert.equal(peak, 3);
  release.splice(0, 3).forEach((done) => done());
  await waitFor(() => release.length === 3);
  assert.equal(peak, 3);
  release.splice(0).forEach((done) => done());
  await running;
  assert.equal(peak, 3);
});

test("scenes run three at a time and a clip waits for its still", async () => {
  const events: string[] = [];
  let peak = 0;
  const shots = [0, 1, 2, 3].map(shot);
  const results = await runSceneShots(shots, {
    async image(row) {
      events.push(`${row.sceneId}:image`);
      return media("image", row.sceneId);
    },
    async clip(row, image) {
      events.push(`${row.sceneId}:clip:${image.url}`);
      return media("clip", row.sceneId);
    },
    async voice(row) {
      events.push(`${row.sceneId}:voice:${row.voiceId}`);
      return media("voice", row.sceneId);
    },
  }, {
    concurrency: 3,
    observe: (active) => {
      peak = Math.max(peak, active);
    },
    onProgress: (event) => {
      events.push(`${event.sceneId}:${event.kind}:${event.status}`);
    },
  });
  assert.equal(peak, 3);
  assert.equal(results.length, 4);
  assert.equal(results[0]?.image.provider, "mock");
  assert.equal(results[0]?.image.model, "image");
  assert.equal(results[0]?.image.providerLabel, "Mock");
  const clip = events.indexOf("s0:clip:mock://s0/image");
  const imageDone = events.indexOf("s0:image:done");
  assert.ok(imageDone >= 0 && clip > imageDone);
  assert.ok(events.includes("s0:voice:FZkK3TvQ0pjyDmT8fzIW"));
  assert.equal(shots[0]?.durationSec, 5);
  assert.equal(sceneDurationSec(10, 1000), 10);
});

test("regen isolation reruns one scene and only its downstream steps", async () => {
  assert.deepEqual(regenScope("image"), { rerun: ["image", "clip"], keep: ["voice"] });
  assert.deepEqual(regenScope("clip"), { rerun: ["clip"], keep: ["image", "voice"] });
  assert.deepEqual(regenScope("voice"), { rerun: ["voice"], keep: ["image", "clip"] });

  const calls: string[] = [];
  const cachedVoice = media("voice", "s1");
  const cachedImage = media("image", "s1");
  const ran = await runSceneShots([0, 1, 2].map(shot), {
    async image(row) {
      calls.push(`${row.sceneId}:image:${row.anchorUrls.join(",")}`);
      return media("image-new", row.sceneId);
    },
    async clip(row, image) {
      calls.push(`${row.sceneId}:clip:${image.url}`);
      return media("clip-new", row.sceneId);
    },
    async voice(row) {
      calls.push(`${row.sceneId}:voice`);
      return media("voice-new", row.sceneId);
    },
  }, {
    onlySceneIds: new Set(["s1"]),
    skip: { s1: regenScope("image").keep },
    cached: { s1: { voice: cachedVoice, image: cachedImage } },
  });

  assert.deepEqual(calls, ["s1:image:", "s1:clip:mock://s1/image-new"]);
  assert.equal(ran.length, 1);
  assert.equal(ran[0]?.voice, cachedVoice);
  assert.equal(ran[0]?.image.url, "mock://s1/image-new");
  assert.notEqual(ran[0]?.image.url, cachedImage.url);
  assert.deepEqual(castAnchorIds([{ anchorUrl: "https://cdn.example/face.png" }]), [
    "ref:https%3A%2F%2Fcdn.example%2Fface.png",
  ]);
  assert.deepEqual(castAnchorIds([]), []);
});

function waitFor(ready: () => boolean): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      if (ready()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > 2000) {
        clearInterval(timer);
        reject(new Error("timed out waiting for the scene pool"));
      }
    }, 5);
  });
}
