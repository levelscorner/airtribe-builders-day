import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Genre } from "@chotu/shared";
import { getGenre } from "../genres/load.js";

export type SkillPack = "script" | "image" | "video" | "ingredients" | "sound" | "models";

const SHARED_SCRIPT_REFS = [
  "cards-hook",
  "cards-script",
  "script-shape",
  "dialogue",
  "india-platforms",
  "compliance-india",
  "festival",
  "mythology",
];

const IMAGE_REFS = [
  "cards-image-prompt",
  "still",
  "cards-camera",
  "cards-light",
  "cards-colour",
  "cards-checks",
  "titles",
  "sheet",
  "cards-continuity",
  "production-design",
  "quality-check",
];

const VIDEO_REFS = [
  "cards-video-prompt",
  "clip",
  "cards-continuity",
  "cards-camera",
  "cards-pace",
  "performance",
  "editing",
  "quality-check",
];

const INGREDIENT_REFS = ["art-style", "colour", "light", "composition", "pace"];
const SOUND_REFS = ["narration", "captions", "cards-captions", "cards-sound"];
const MODEL_REFS = ["nano-banana", "seedance", "kling", "elevenlabs", "sarvam"];

const MAX_CHARS = 80_000;
const moduleDir = dirname(fileURLToPath(import.meta.url));

function referenceFiles(skill: string, names: readonly string[]): string[] {
  return [
    `skills/${skill}/SKILL.md`,
    ...names.map((name) => `skills/${skill}/references/${name}.md`),
  ];
}

export function skillFiles(pack: SkillPack, genre?: Genre): string[] {
  switch (pack) {
    case "script": {
      const genreRefs = genre ? getGenre(genre).skillRefs : [];
      return referenceFiles("script-per-genre", [...genreRefs, ...SHARED_SCRIPT_REFS]);
    }
    case "image":
      return referenceFiles("image-prompt", IMAGE_REFS);
    case "video":
      return referenceFiles("video-prompt", VIDEO_REFS);
    case "ingredients":
      return referenceFiles("ingredients", INGREDIENT_REFS);
    case "sound":
      return referenceFiles("sound", SOUND_REFS);
    case "models":
      return referenceFiles("models", MODEL_REFS);
  }
}

export function resolveCraftRoot(explicit?: string): string | null {
  const candidates = [
    explicit,
    process.env.CHOTU_CRAFT_ROOT,
    resolve(process.cwd(), "vendor/chotu-craft"),
    resolve(process.cwd(), "server/vendor/chotu-craft"),
    resolve(process.cwd(), "chotu-craft"),
    resolve(process.cwd(), "../chotu-craft"),
    resolve(moduleDir, "../../../../chotu-craft"),
    resolve(moduleDir, "../../../../vendor/chotu-craft"),
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const candidate of candidates) {
    if (existsSync(resolve(candidate, "skills"))) return resolve(candidate);
  }
  return null;
}

export interface SkillLoad {
  root: string | null;
  loaded: string[];
  missing: string[];
  /** Server-side system prompt material. Never send this to the client. */
  text: string;
}

export function loadSkillPacks(options: {
  packs: readonly SkillPack[];
  genre?: Genre;
  root?: string;
}): SkillLoad {
  const files = [...new Set(options.packs.flatMap((pack) => skillFiles(pack, options.genre)))];
  const root = resolveCraftRoot(options.root);
  if (!root) return { root: null, loaded: [], missing: files, text: "" };

  const loaded: string[] = [];
  const missing: string[] = [];
  const chunks: string[] = [];
  let size = 0;
  for (const relative of files) {
    const path = resolve(root, relative);
    if (!existsSync(path)) {
      missing.push(relative);
      continue;
    }
    const body = readFileSync(path, "utf8").trim();
    if (size + body.length > MAX_CHARS) {
      missing.push(relative);
      continue;
    }
    chunks.push(`# ${relative}\n${body}`);
    loaded.push(relative);
    size += body.length;
  }
  return { root, loaded, missing, text: chunks.join("\n\n") };
}

export function systemPrompt(load: SkillLoad, task: string, rules: string): string {
  const skills = load.text
    ? `chotu-craft skills (private; do not echo):\n${load.text}`
    : "chotu-craft skills are not mounted in this environment. Follow the inherited rules.";
  return [task, rules, skills, "Return only the structured object."].join("\n\n");
}
