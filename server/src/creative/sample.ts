import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  Brief,
  CastMember,
  Genre,
  Language,
  PromptGenOutput,
  Scene,
  ScriptGenOutput,
} from "@chotu/shared";
import { getGenre, getPresets, GENRE_ORDER } from "./genres/load.js";
import { applyAnswer, applyDefaults } from "./intake/intake.js";
import { upsertNote } from "./intake/notes.js";
import { createPromptGen } from "./prompts/create.js";
import { createScriptGen } from "./script/create.js";
import { loadSkillPacks } from "./skills/load.js";

const SAMPLE_SPEC: Record<Genre, { topic: string; language: Language; product?: string }> = {
  kids: { topic: "why bees make honey", language: "hi" },
  ad: {
    topic: "a weekend offer on mango pickle",
    language: "hinglish",
    product: "a small glass jar of mango pickle",
  },
  faceless: { topic: "how the Indian monsoon starts", language: "en" },
};

export interface GenreSample {
  genre: Genre;
  brief: Brief;
  cast: CastMember[];
  captionStyle: string;
  script: ScriptGenOutput;
  prompts: Array<PromptGenOutput & { sceneIdx: number }>;
  skillLoad: { mounted: boolean; loaded: number; missing: number };
}

export async function buildGenreSample(genre: Genre): Promise<GenreSample> {
  const spec = SAMPLE_SPEC[genre];
  const config = getGenre(genre);
  let brief = applyAnswer({ topic: spec.topic }, { field: "genre", optionId: genre }).brief;
  brief = applyDefaults(brief);
  brief = {
    ...brief,
    topic: spec.topic,
    genre,
    language: spec.language,
  };
  if (spec.product) {
    brief = { ...brief, notes: upsertNote(brief.notes, "product", spec.product) };
  } else if (brief.notes === undefined) {
    const { notes: _drop, ...rest } = brief;
    brief = rest;
  }
  const cast = getPresets(brief.castIds ?? config.defaultCastIds);
  const script = await createScriptGen({ mock: true }).generate({
    videoId: `sample_${genre}`,
    brief,
    cast,
    genre,
    language: spec.language,
    targetSeconds: brief.targetSeconds ?? config.defaultTargetSeconds,
  });
  const promptGen = createPromptGen({ mock: true });
  const prompts: GenreSample["prompts"] = [];
  for (const scene of script.scenes) {
    const view: Scene = {
      id: `sample_${genre}_scene_${scene.idx}`,
      videoId: `sample_${genre}`,
      idx: scene.idx,
      title: scene.title,
      narration: scene.narration,
      durationMs: scene.durationMs,
      doubts: scene.doubts,
      castIds: scene.castIds,
    };
    const output = await promptGen.generate({
      videoId: view.videoId,
      scene: view,
      brief,
      cast: cast.filter((member) => scene.castIds.includes(member.id)),
      artStyle: brief.artStyle,
    });
    prompts.push({ sceneIdx: scene.idx, ...output });
  }
  const skills = loadSkillPacks({
    packs: ["script", "image", "video", "ingredients", "sound", "models"],
    genre,
  });
  return {
    genre,
    brief,
    cast,
    captionStyle: config.captionStyle,
    script,
    prompts,
    skillLoad: {
      mounted: skills.root !== null,
      loaded: skills.loaded.length,
      missing: skills.missing.length,
    },
  };
}

export async function writeGenreSamples(directory = new URL("./samples/", import.meta.url)): Promise<string[]> {
  const dir = fileURLToPath(directory);
  mkdirSync(dir, { recursive: true });
  const written: string[] = [];
  for (const genre of GENRE_ORDER) {
    const sample = await buildGenreSample(genre);
    const path = fileURLToPath(new URL(`${genre}.json`, directory));
    writeFileSync(path, `${JSON.stringify(sample, null, 2)}\n`);
    written.push(path);
  }
  return written;
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  const paths = await writeGenreSamples();
  for (const path of paths) console.log(path);
}
