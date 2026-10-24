import assert from "node:assert/strict";
import test from "node:test";
import {
  concatArgs,
  encodeSceneArgs,
  fitClipToVoice,
  musicDuckArgs,
  musicDuckFilter,
  sceneVideoFilter,
} from "./commands.ts";

test("ffmpeg freezes a short clip and trims a long one to the voice", () => {
  const short = fitClipToVoice(9.8, 5);
  assert.equal(short.trimSec, 9.8);
  assert.ok(short.padSec > 4 && short.padSec < 5);
  const padded = sceneVideoFilter({ width: 720, height: 1280, padSec: short.padSec });
  assert.match(padded, /scale=720:1280/);
  assert.match(padded, /crop=720:1280/);
  assert.match(padded, /tpad=stop_mode=clone:stop_duration=/);

  const long = fitClipToVoice(5, 10);
  assert.equal(long.padSec, 0);
  assert.equal(long.trimSec, 5);
  const trimmed = sceneVideoFilter({ width: 720, height: 1280, padSec: long.padSec });
  assert.doesNotMatch(trimmed, /tpad/);

  const args = encodeSceneArgs({
    clip: "clip.mp4",
    audio: "vo.mp3",
    width: 720,
    height: 1280,
    voSec: 5,
    clipSec: 10,
    segment: "scene-0.mp4",
  });
  assert.equal(args[args.indexOf("-t") + 1], "5.000");
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("yuv420p"));
  assert.equal(args.includes("tpad=stop_mode=clone"), false);
  const filter = args[args.indexOf("-filter_complex") + 1] ?? "";
  assert.match(filter, /scale=720:1280/);
  assert.match(filter, /crop=720:1280/);
});

test("concat is faststart and the bed is ducked under the voice", () => {
  const concat = concatArgs("concat.txt", "final.mp4");
  assert.ok(concat.includes("+faststart"));
  assert.ok(concat.includes("copy"));
  const duck = musicDuckArgs("final.mp4", "bed.mp3", "ducked.mp4");
  assert.equal(duck[duck.indexOf("-filter_complex") + 1], musicDuckFilter());
  assert.match(musicDuckFilter(), /sidechaincompress=/);
  assert.match(musicDuckFilter(), /volume=0\.18/);
  assert.ok(duck.includes("+faststart"));
  assert.ok(duck.includes("-c:v"));
  assert.ok(duck.includes("copy"));
  assert.equal(duck[duck.indexOf("-map") + 1], "0:v");
});
