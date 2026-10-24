import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Genre } from "@chotu/shared";
import { GENRE_ORDER } from "./genres/load.js";
import { parsePromptGenOutput, parseScriptGenOutput } from "./schema.js";
import { buildGenreSample } from "./sample.js";

test("committed samples match the mock generators for every genre", async () => {
  for (const genre of GENRE_ORDER) {
    const sample = await buildGenreSample(genre);
    const saved = JSON.parse(readFileSync(new URL(`./samples/${genre}.json`, import.meta.url), "utf8")) as unknown;
    assert.deepEqual(saved, sample);
    parseScriptGenOutput(sample.script);
    for (const prompt of sample.prompts) {
      parsePromptGenOutput(prompt);
    }
    assert.equal(sample.genre, genre satisfies Genre);
    assert.ok(sample.script.scenes.every((scene) => Array.isArray(scene.castIds)));
  }
});
