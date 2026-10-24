/** Fit a Seedance clip to the voiceover, then concat a 9:16 faststart file. */

export function fitClipToVoice(voSec: number, clipSec?: number): { padSec: number; trimSec: number } {
  const vo = Math.max(0.05, voSec);
  if (clipSec === undefined || !Number.isFinite(clipSec)) {
    return { padSec: round3(vo), trimSec: round3(vo) };
  }
  if (clipSec + 0.04 >= vo) return { padSec: 0, trimSec: round3(vo) };
  return { padSec: round3(vo - clipSec), trimSec: round3(vo) };
}

export function sceneVideoFilter(input: {
  width: number;
  height: number;
  padSec: number;
  drawtext?: string;
}): string {
  const pad = input.padSec > 0 ? `tpad=stop_mode=clone:stop_duration=${input.padSec.toFixed(3)},` : "";
  const draw = input.drawtext ? `${input.drawtext},` : "";
  return `[0:v]scale=${input.width}:${input.height}:force_original_aspect_ratio=increase,crop=${input.width}:${input.height},fps=25,${pad}${draw}format=yuv420p[v]`;
}

export function sceneAudioFilter(): string {
  return "[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,apad[a]";
}

export function encodeSceneArgs(input: {
  clip?: string;
  image?: string;
  audio: string;
  width: number;
  height: number;
  voSec: number;
  clipSec?: number;
  segment: string;
  drawtext?: string;
}): string[] {
  const hasClip = Boolean(input.clip);
  const fit = hasClip ? fitClipToVoice(input.voSec, input.clipSec) : { padSec: 0, trimSec: round3(Math.max(0.05, input.voSec)) };
  const videoInput = input.clip
    ? ["-i", input.clip]
    : input.image
      ? ["-loop", "1", "-i", input.image]
      : ["-f", "lavfi", "-i", `color=c=0x1a1a2e:s=${input.width}x${input.height}:r=25`];
  const filter = `${sceneVideoFilter({
    width: input.width,
    height: input.height,
    padSec: fit.padSec,
    drawtext: input.drawtext,
  })};${sceneAudioFilter()}`;
  return [
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
    fit.trimSec.toFixed(3),
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
  ];
}

export function concatArgs(listPath: string, output: string): string[] {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    listPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    output,
  ];
}

/** Duck the bed under the voice, then keep a quiet floor with volume. */
export function musicDuckFilter(): string {
  return [
    "[0:a]aformat=sample_fmts=fltp:channel_layouts=stereo,apad,asplit=2[vo][vosc]",
    "[1:a]aformat=sample_fmts=fltp:channel_layouts=stereo,volume=0.18[bgm]",
    "[bgm][vosc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[ducked]",
    "[vo][ducked]amix=inputs=2:duration=first:dropout_transition=0[a]",
  ].join(";");
}

export function musicDuckArgs(video: string, music: string, output: string): string[] {
  return [
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    video,
    "-stream_loop",
    "-1",
    "-i",
    music,
    "-filter_complex",
    musicDuckFilter(),
    "-map",
    "0:v",
    "-map",
    "[a]",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-shortest",
    "-movflags",
    "+faststart",
    output,
  ];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
