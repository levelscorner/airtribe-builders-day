import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SCENE_COUNT } from "../creative/script/mock.js";
import { STARTER_CREDITS } from "../orchestrator/store.js";
import { artefactCreditCost, quotedVideoCredits } from "./stub.js";

test("80 starter credits cover one default two-scene video", () => {
  assert.equal(DEFAULT_SCENE_COUNT, 2);
  const quote = quotedVideoCredits(DEFAULT_SCENE_COUNT);
  const perScene =
    artefactCreditCost("prompt") +
    artefactCreditCost("image") +
    artefactCreditCost("clip") +
    artefactCreditCost("voice");
  assert.equal(quote, artefactCreditCost("script") + artefactCreditCost("final") + DEFAULT_SCENE_COUNT * perScene);
  assert.equal(quote, 80);
  assert.ok(quote <= STARTER_CREDITS);
});
