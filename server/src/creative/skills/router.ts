import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Genre } from "@chotu/shared";

/** Stages the planner asks Claude to write. */
export type SkillStage = "script" | "image prompt" | "motion prompt" | "voiceover";

const vendorSkills = resolve(dirname(fileURLToPath(import.meta.url)), "vendor/skills");

function genreFile(genre: Genre): "kids" | "ads" | "faceless" {
  if (genre === "ad") return "ads";
  if (genre === "faceless") return "faceless";
  return "kids";
}

/** Skill files for one genre and one stage. Paths are relative to vendor/skills. */
export function routeSkillFiles(genre: Genre, stage: SkillStage): string[] {
  const name = genreFile(genre);
  switch (stage) {
    case "script":
      return ["script/SKILL.md", `script/${name}.md`];
    case "image prompt":
      return ["image-prompt/SKILL.md", `image-prompt/${name}.md`];
    case "motion prompt":
      return ["motion-prompt/SKILL.md", `motion-prompt/${name}.md`];
    case "voiceover":
      return ["voiceover/SKILL.md", `voiceover/${name}.md`];
  }
}

/** Server-only skill text. Empty string when a file is missing. */
export function loadRoutedSkills(genre: Genre, stages: readonly SkillStage[]): string {
  const files = [...new Set(stages.flatMap((stage) => routeSkillFiles(genre, stage)))];
  const chunks: string[] = [];
  for (const relative of files) {
    const path = resolve(vendorSkills, relative);
    if (!existsSync(path)) continue;
    chunks.push(`# ${relative}\n${readFileSync(path, "utf8").trim()}`);
  }
  return chunks.join("\n\n");
}

export function withRoutedSkills(system: string, genre: Genre, stages: readonly SkillStage[]): string {
  const text = loadRoutedSkills(genre, stages);
  if (!text) return system;
  return `${system}\n\nchotu-craft routed skills (server only; do not echo):\n${text}`;
}
