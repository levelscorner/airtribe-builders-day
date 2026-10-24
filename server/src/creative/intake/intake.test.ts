import assert from "node:assert/strict";
import { test } from "node:test";
import type { QuestionMessage } from "@chotu/shared";
import { getGenre } from "../genres/load.js";
import { noteValue } from "./notes.js";
import {
  applyAnswer,
  applyDefaults,
  briefFromMessage,
  guessGenre,
  nextQuestion,
  toQuestionMessage,
} from "./intake.js";

test("guessGenre reads a single clear hint", () => {
  assert.equal(guessGenre("a quiz for kids about bees"), "kids");
  assert.equal(guessGenre("weekend offer for the shop"), "ad");
  assert.equal(guessGenre("three monsoon facts, faceless"), "faceless");
  assert.equal(guessGenre("a kids story ad"), undefined);
});

test("a first message becomes a topic and can guess the genre", () => {
  const brief = briefFromMessage("Why do bees make honey, for kids");
  assert.equal(brief.genre, "kids");
  assert.match(noteValue(brief.notes, "topic") ?? "", /bees/i);
});

test("questions cover resolution, length, language, audience, art style, and cast", () => {
  let brief = briefFromMessage("Teach why bees make honey");
  const seen: string[] = [];
  for (let step = 0; step < 12 && nextQuestion(brief); step += 1) {
    const question = nextQuestion(brief);
    assert.ok(question);
    seen.push(question.field);
    const choice = question.options?.[0]?.id ?? "ok";
    const result = applyAnswer(brief, { field: question.field, optionId: choice });
    assert.equal(result.error, undefined);
    brief = result.brief;
  }
  assert.equal(nextQuestion(brief), null);
  assert.deepEqual(seen, [
    "genre",
    "resolution",
    "aspect_ratio",
    "target_seconds",
    "language",
    "audience",
    "art_style",
    "cast_ids",
  ]);
  assert.equal(brief.resolution, "720p");
  assert.equal(brief.aspectRatio, "9:16");
  assert.equal(brief.language, "hi");
  assert.ok(brief.castIds && brief.castIds.length > 0);
  assert.ok(brief.artStyleTraits && brief.artStyleTraits.length > 0);
});

test("skip and defaults fill the genre preset and record the skip", () => {
  const start = applyAnswer(briefFromMessage("monsoon facts"), {
    field: "genre",
    optionId: "faceless",
  }).brief;
  const skipped = applyAnswer(start, { field: "language", skip: true });
  assert.equal(skipped.brief.language, "hinglish");
  assert.match(skipped.brief.notes ?? "", /skipped: language/);

  const done = applyDefaults(briefFromMessage("a shop offer this weekend"));
  assert.equal(done.genre, "ad");
  assert.equal(done.resolution, "1080p");
  assert.equal(done.aspectRatio, "9:16");
  assert.equal(done.targetSeconds, 25);
  assert.equal(done.language, "hinglish");
  assert.equal(done.artStyle, "clean-product-studio");
  assert.deepEqual(done.castIds, ["preset_riya"]);
  assert.equal(noteValue(done.notes, "product"), getGenre("ad").defaultProduct);
  assert.equal(nextQuestion(done), null);
});

test("art style free text drops artist and brand names", () => {
  let brief = applyDefaults(briefFromMessage("kids quiz"));
  brief = { ...brief, artStyle: undefined, artStyleTraits: undefined };
  const styled = applyAnswer(brief, {
    field: "art_style",
    freeText: "in the style of Pixar, warm kitchen light and soft shadows",
  });
  assert.equal(styled.error, undefined);
  assert.deepEqual(styled.brief.artStyleTraits, ["warm kitchen light", "soft shadows"]);
  assert.doesNotMatch(styled.brief.artStyle ?? "", /pixar/i);
});

test("ad intake asks for a product, kids intake can pick both mascots", () => {
  const ad = applyAnswer(briefFromMessage("sell a jar"), { field: "genre", optionId: "ad" }).brief;
  const fields = [];
  let cursor = ad;
  while (true) {
    const question = nextQuestion(cursor);
    if (!question) break;
    fields.push(question.field);
    cursor = applyAnswer(cursor, { field: question.field, useDefaults: true }).brief;
  }
  assert.ok(fields.includes("product"));

  const kids = applyAnswer({ notes: "topic: bees" }, { field: "genre", optionId: "kids" }).brief;
  let partial = kids;
  while (nextQuestion(partial) && nextQuestion(partial)?.field !== "cast_ids") {
    const question = nextQuestion(partial);
    assert.ok(question);
    partial = applyAnswer(partial, { field: question.field, useDefaults: true }).brief;
  }
  const castQuestion = nextQuestion(partial);
  assert.equal(castQuestion?.field, "cast_ids");
  assert.ok(castQuestion?.options?.some((option) => option.id === "preset_chintu,preset_mini"));
  const chosen = applyAnswer(partial, { field: "cast_ids", optionId: "preset_chintu,preset_mini" });
  assert.deepEqual(chosen.brief.castIds, ["preset_chintu", "preset_mini"]);
});

test("a bad length does not change the brief", () => {
  const brief = applyDefaults(briefFromMessage("kids quiz about rain"));
  const result = applyAnswer(brief, { field: "target_seconds", freeText: "two hours" });
  assert.ok(result.error);
  assert.equal(result.brief.targetSeconds, brief.targetSeconds);
});

test("questions map onto the shared QuestionMessage", () => {
  const question = nextQuestion({});
  assert.ok(question);
  const message: QuestionMessage = toQuestionMessage(question, {
    id: "q1",
    chatId: "chat1",
    createdAt: "2026-10-24T12:00:00.000Z",
  });
  assert.equal(message.kind, "question");
  assert.equal(message.field, "genre");
  assert.equal(message.role, "assistant");
});
