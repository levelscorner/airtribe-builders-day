import { readFileSync } from "node:fs";
import type { CastMember, Genre } from "@chotu/shared";
import {
  CastMemberSchema,
  GenreConfigSchema,
  type ArtStylePreset,
  type GenreConfig,
} from "../schema.js";

function readJson(relativeName: string): unknown {
  const url = new URL(relativeName, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as unknown;
}

function loadConfig(fileName: string): GenreConfig {
  return GenreConfigSchema.parse(readJson(fileName));
}

let genres: Record<Genre, GenreConfig> | undefined;
let presets: CastMember[] | undefined;

export function getGenres(): Record<Genre, GenreConfig> {
  if (!genres) {
    const kids = loadConfig("./kids.json");
    const ad = loadConfig("./ad.json");
    const faceless = loadConfig("./faceless.json");
    genres = { kids, ad, faceless };
  }
  return genres;
}

export function getGenre(id: Genre): GenreConfig {
  return getGenres()[id];
}

export function getPresetCast(): CastMember[] {
  if (!presets) {
    presets = CastMemberSchema.array().parse(readJson("./presets.json"));
  }
  return presets;
}

export function getPreset(id: string): CastMember | undefined {
  return getPresetCast().find((member) => member.id === id);
}

export function getPresets(ids: readonly string[]): CastMember[] {
  const wanted = new Set(ids);
  return getPresetCast().filter((member) => wanted.has(member.id));
}

export function artStylePreset(genre: Genre, styleId: string): ArtStylePreset | undefined {
  return getGenre(genre).artStylePresets.find((preset) => preset.id === styleId);
}

export const GENRE_ORDER: readonly Genre[] = ["kids", "ad", "faceless"];
