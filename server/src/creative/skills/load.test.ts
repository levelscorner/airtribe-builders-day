import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { loadSkillPacks, systemPrompt } from "./load.js";
import { INHERITED_RULES, SCRIPT_TASK } from "./rules.js";

test("skill loader reads a mounted chotu-craft tree and lists what is missing", () => {
  const root = mkdtempSync(join(tmpdir(), "chotu-craft-"));
  const skill = join(root, "skills/script-per-genre/SKILL.md");
  mkdirSync(dirname(skill), { recursive: true });
  writeFileSync(skill, "SENTINEL_SKILL_PHRASE stays on the server");

  const loaded = loadSkillPacks({ packs: ["script"], genre: "kids", root });
  assert.equal(loaded.root, root);
  assert.deepEqual(loaded.loaded, ["skills/script-per-genre/SKILL.md"]);
  assert.ok(loaded.missing.length > 0);
  assert.match(loaded.text, /SENTINEL_SKILL_PHRASE/);
  assert.match(systemPrompt(loaded, SCRIPT_TASK, INHERITED_RULES), /SENTINEL_SKILL_PHRASE/);
});

test("missing craft root yields no skill text", () => {
  const loaded = loadSkillPacks({
    packs: ["image"],
    root: join(tmpdir(), "does-not-exist-chotu-craft"),
  });
  assert.equal(loaded.root, null);
  assert.equal(loaded.text, "");
  assert.equal(loaded.loaded.length, 0);
  assert.ok(loaded.missing.some((file) => file.endsWith("SKILL.md")));
});
