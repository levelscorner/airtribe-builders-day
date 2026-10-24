import assert from "node:assert/strict";
import { test } from "node:test";
import type { Genre } from "@chotu/shared";
import { getGenre, getGenres, getPreset, getPresetCast, GENRE_ORDER } from "./load.js";

test("three genre configs use the shared Genre ids", () => {
  const genres = getGenres();
  assert.deepEqual(GENRE_ORDER, ["kids", "ad", "faceless"]);
  for (const id of GENRE_ORDER) {
    assert.equal(genres[id].id, id);
  }
});

test("each genre sets shape, length, art style, cast, captions, and skills", () => {
  const expected: Record<Genre, { scenes: number; seconds: number; cast: string[]; style: string }> = {
    kids: { scenes: 5, seconds: 45, cast: ["preset_chintu", "preset_mini"], style: "bright-2d-cartoon" },
    ad: { scenes: 5, seconds: 25, cast: ["preset_riya"], style: "clean-product-studio" },
    faceless: { scenes: 5, seconds: 50, cast: ["preset_narrator"], style: "cinematic-realistic" },
  };

  for (const id of GENRE_ORDER) {
    const genre = getGenre(id);
    const want = expected[id];
    assert.equal(genre.beats.length, want.scenes);
    assert.equal(genre.defaultTargetSeconds, want.seconds);
    assert.ok(genre.minSeconds <= genre.defaultTargetSeconds);
    assert.ok(genre.defaultTargetSeconds <= genre.maxSeconds);
    assert.ok(genre.maxSeconds <= 60);
    assert.equal(genre.defaultAspectRatio, "9:16");
    assert.equal(genre.defaultArtStyle, want.style);
    assert.ok(genre.artStylePresets.some((preset) => preset.id === want.style));
    assert.deepEqual(genre.defaultCastIds, want.cast);
    assert.ok(genre.captionStyle.length > 0);
    assert.ok(genre.skillRefs.length >= 1);
    assert.ok(genre.followUps.some((question) => question.field === "topic"));
    assert.ok(genre.tone.length > 0);
    assert.ok(genre.who.length > 0);
  }
});

test("starter cast matches the genre and keeps identity text reusable", () => {
  const cast = getPresetCast();
  assert.equal(cast.length, 4);
  assert.equal(getPreset("preset_chintu")?.role, "mascot");
  assert.equal(getPreset("preset_mini")?.role, "mascot");
  assert.equal(getPreset("preset_riya")?.role, "presenter");
  assert.equal(getPreset("preset_narrator")?.role, "narrator");
  assert.equal(getPreset("preset_narrator")?.higgsfieldElementId, undefined);
  assert.ok(getPreset("preset_chintu")?.higgsfieldElementId);
  for (const member of cast) {
    assert.equal(member.isPreset, true);
    assert.equal(member.status, "approved");
    assert.ok(member.dnaChips.length >= 4 && member.dnaChips.length <= 6);
    assert.ok(member.identityText.includes(member.role === "narrator" ? "No face" : member.name));
  }

  for (const id of GENRE_ORDER) {
    for (const castId of getGenre(id).defaultCastIds) {
      assert.ok(getPreset(castId), `${id} cast ${castId} missing from presets`);
    }
  }
});
