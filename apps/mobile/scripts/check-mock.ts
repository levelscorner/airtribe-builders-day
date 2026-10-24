import type { ArtefactKind, ChatMessage, QuestionMessage } from "@chotu/shared";
import { readAgentReview, reviewFeedback, reviewFixes, reviewStatusLabel, reviewTone } from "../src/agent-review";
import { openQuestion } from "../src/chat/open-question";
import { parseMediaProgress, providerChipLabel, type MediaProgressEvent } from "../src/media-contract";
import { STARTER_CREDITS, VOICES } from "../src/mock-fixtures";
import { createMockStudio } from "../src/mock-studio";
import { readRejectNote } from "../src/reject-note";
import { sessionFromCheckout } from "../src/checkout";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function pump(times = 8): Promise<void> {
  for (let step = 0; step < times; step += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

/** Composer text during a chip question must advance intake, not close the card. */
async function composerDuringChipQuestions(): Promise<void> {
  const api = createMockStudio({ delayMs: 0 });
  await api.createUser({ displayName: "Asha", phoneOrEmail: "asha@example.com" });
  // The topic question is first when signup has no opening line. This walk supplies one so the chips still start on genre.
  const opened = await api.createChat({ initialMessage: "barish kaise banti hai" });
  await pump();

  let history = await api.listMessages(opened.chatId);
  let question = openQuestion(history.messages);
  assert(isQuestion(question) && question.field === "genre", "chat opens on the genre chips");

  await api.postMessage(opened.chatId, { text: "barish kaise banti hai" });
  await pump();
  history = await api.listMessages(opened.chatId);
  question = openQuestion(history.messages);
  assert(isQuestion(question) && question.field === "aspect_ratio", "unmatched genre text should take the default and advance");
  assert(
    history.messages.some((item) => item.kind === "text" && item.role === "user" && item.text.includes("Kids")),
    "unmatched genre text falls back to the kids default",
  );

  await api.postMessage(opened.chatId, { text: "wide" });
  await pump();
  history = await api.listMessages(opened.chatId);
  question = openQuestion(history.messages);
  assert(isQuestion(question) && question.field === "resolution", "fuzzy aspect text should advance");
  assert(
    history.messages.some((item) => item.kind === "text" && item.role === "user" && item.text.includes("16:9")),
    "wide should match the 16:9 chip",
  );

  await api.postMessage(opened.chatId, { text: "full hd 1080" });
  await pump();
  history = await api.listMessages(opened.chatId);
  question = openQuestion(history.messages);
  assert(isQuestion(question) && question.field === "target_seconds", "resolution text should advance");
  assert(
    history.messages.some((item) => item.kind === "text" && item.role === "user" && item.text.includes("1080p")),
    "1080 should match the 1080p chip",
  );

  await api.postMessage(opened.chatId, { text: "45" });
  await pump();
  await api.postMessage(opened.chatId, { text: "hinglish please" });
  await pump();
  history = await api.listMessages(opened.chatId);
  question = openQuestion(history.messages);
  assert(isQuestion(question) && question.field === "audience", "language text should advance");
  assert(
    history.messages.some((item) => item.kind === "text" && item.role === "user" && item.text.includes("Hinglish")),
    "hinglish should match the language chip",
  );

  await api.postMessage(opened.chatId, { text: "bacche" });
  await pump();
  await api.postMessage(opened.chatId, { text: "bright cartoon" });
  await pump();
  history = await api.listMessages(opened.chatId);
  question = openQuestion(history.messages);
  assert(isQuestion(question) && question.field === "cast", "free-text questions should still reach cast");

  await api.postMessage(opened.chatId, { text: "chintu aur mini" });
  await pump(20);
  history = await api.listMessages(opened.chatId);
  assert(openQuestion(history.messages) === undefined, "cast text should finish intake");
  const snap = await api.getVideo(opened.videoId);
  assert(snap.video.stage !== "brief", `composer answers should leave brief, got ${snap.video.stage}`);
  assert((snap.video.brief.castIds ?? []).join() === "cast_chintu,cast_mini", "typed cast names should stick");
  assert(snap.video.brief.resolution === "1080p", "typed resolution should stick");
  assert(snap.video.brief.language === "hinglish", "typed language should stick");
}

function isQuestion(message: ChatMessage | undefined): message is QuestionMessage {
  return message?.kind === "question";
}

function providerCases(): void {
  assert(VOICES.length === 4, "shared mock bank has the four seeded voices");
  assert(
    VOICES.every((voice) => voice.id && voice.elevenlabsVoiceId && voice.label && voice.languageHint && voice.isPreset),
    "voices use the shared VoicePreset fields",
  );
  assert(
    providerChipLabel({ payload: { provider: "mock", model: "alibaba/qwen-image-3/text-to-image" } }) === "Qwen Image",
    "image model chip uses the Qwen endpoint",
  );
  assert(
    providerChipLabel({ payload: { provider: "mock", model: "bytedance/seedance-2.0/image-to-video" } }) ===
      "Seedance 2.0",
    "clip model chip uses the Seedance 2.0 endpoint",
  );
  assert(
    providerChipLabel({ payload: { provider: "openai", model: "gpt-image-2" } }) === "GPT Image 2",
    "openai gpt-image-2 chip",
  );
  assert(
    providerChipLabel({ provider: "ark", model: "dreamina-seedance-2-5-260628" }) === "Seedance 2.5",
    "ark seedance 2.5 chip reads artefact fields",
  );
  assert(
    providerChipLabel({
      providerLabel: "Seedance 2.5 · BytePlus",
      payload: { provider: "openai", model: "gpt-image-2" },
    }) === "Seedance 2.5 · BytePlus",
    "artefact providerLabel wins over payload",
  );
  assert(
    providerChipLabel({
      provider: "openai",
      model: "gpt-image-2",
      payload: { provider: "mock", model: "other" },
    }) === "GPT Image 2",
    "artefact provider and model win over payload",
  );
  assert(
    providerChipLabel({ payload: { provider: "openai", model: "custom-model", providerLabel: "Studio label" } }) ===
      "Studio label",
    "unknown model falls back to providerLabel",
  );
  assert(
    providerChipLabel({ payload: { provider: "openai", model: "custom-model" } }) === "custom-model",
    "unknown model without a label shows the raw model",
  );
  assert(providerChipLabel({ payload: { provider: "elevenlabs" } }) === "ElevenLabs", "voice provider chip");
  assert(providerChipLabel({ payload: { provider: "mock" } }) === "Mock", "mock provider chip");
  assert(providerChipLabel({ payload: {} }) === undefined, "a card with no provider has no chip");
  const queued = parseMediaProgress({
    type: "media.progress",
    jobId: "job_1",
    artefactId: "art_1",
    kind: "image",
    status: "queued",
    provider: "mock",
  });
  assert(queued?.status === "queued", "queued progress parses");
  const generating = parseMediaProgress({
    type: "media.progress",
    jobId: "job_1",
    artefactId: "art_1",
    kind: "clip",
    status: "generating",
    percent: 40,
    provider: "mock",
    model: "bytedance/seedance-2.0/image-to-video",
    warning: "ignore",
  });
  assert(generating?.percent === 40 && generating.model?.includes("seedance"), "generating keeps percent and model");
  const done = parseMediaProgress({
    type: "media.progress",
    jobId: "job_1",
    artefactId: "art_1",
    kind: "voice",
    status: "done",
    provider: "elevenlabs",
    url: "mock://voice/1",
  });
  assert(done?.status === "done" && done.url === "mock://voice/1", "done progress keeps the mock url");
  assert(
    parseMediaProgress({
      type: "media.progress",
      jobId: "job_1",
      artefactId: "art_1",
      kind: "image",
      status: "nope",
      provider: "mock",
    }) === undefined,
    "unknown progress status is ignored",
  );
  assert(parseMediaProgress({ type: "message" }) === undefined, "chat messages are not media progress");
}

function agentReviewCases(): void {
  assert(readAgentReview({ payload: {} }) === undefined, "a card without a review stays blank");
  const failed = readAgentReview({ agentReview: { status: "failed", output: "Hook is missing." } });
  assert(failed !== undefined && failed.status === "failed", "failed review parses");
  assert(reviewTone(failed.status) === "warn", "failed uses the warning style");
  assert(reviewFixes(failed).join() === "Hook is missing.", "a string output is one fix");

  const budget = readAgentReview({
    agentReview: { status: "budget_exceeded", output: "Stopped before scene 3.\nRetry the ending." },
  });
  assert(budget !== undefined && budget.status === "budget_exceeded", "budget review parses");
  assert(reviewTone(budget.status) === "warn", "budget exceeded uses the warning style");
  assert(reviewFixes(budget).length === 2, "a newline string splits into fixes");

  const hitl = readAgentReview({
    agentReview: { status: "hitl_triggered", confidence: 0.41, output: ["Check the claim.", "Check the name."] },
  });
  assert(hitl !== undefined && hitl.status === "hitl_triggered", "hitl review parses");
  assert(reviewTone(hitl.status) === "hitl", "hitl is a note, not a warning");
  assert(reviewFeedback(hitl).includes("Check the claim."), "hitl output becomes regenerate feedback");
  assert(readAgentReview({ agentReview: { status: "nope", output: "x" } }) === undefined, "unknown status is ignored");

  const mocked = readAgentReview({
    agentReview: { status: "mocked", confidence: 1, output: ["Demo fix."], warning: "Live review skipped." },
  });
  assert(mocked !== undefined && mocked.status === "mocked", "mocked review parses");
  assert(reviewTone(mocked.status) === "ready", "mocked stays a neutral chip");
  assert(reviewStatusLabel(mocked.status) === "Demo review", "mocked chip says demo review");
  assert(mocked.warning === "Live review skipped.", "warning is kept on the review");
  const fromPayload = readAgentReview({
    payload: { agentReview: { status: "mocked", output: "From the payload", warning: "Budget note" } },
  });
  assert(fromPayload?.status === "mocked" && fromPayload.warning === "Budget note", "payload.agentReview is read");
  const fromTop = readAgentReview({
    agentReview: { status: "completed", output: "On the artefact" },
    payload: { agentReview: { status: "failed", output: "On the payload", warning: "ignore" } },
  });
  assert(fromTop?.status === "completed", "ScriptArtefact.agentReview wins when both are set");
}

async function mediaTicks(): Promise<void> {
  const api = createMockStudio({ delayMs: 0 });
  const seen: MediaProgressEvent[] = [];
  await api.createUser({ displayName: "Asha", phoneOrEmail: "asha@example.com" });
  const opened = await api.createChat({ initialMessage: "barish kaise banti hai" });
  const stop = api.subscribe(opened.chatId, (event) => {
    const progress = parseMediaProgress(event);
    if (progress) seen.push(progress);
  });
  await answerBrief(api, opened.chatId, opened.videoId);
  for (let step = 0; step < 40; step += 1) {
    await pump();
    const snap = await api.getVideo(opened.videoId);
    if (snap.video.stage === "images") break;
    if (snap.artefacts.some((item) => item.state === "awaiting_approval")) {
      await api.approveAllRemaining(opened.videoId);
    }
  }
  const image = (await api.getVideo(opened.videoId)).artefacts.find((item) => item.kind === "image");
  assert(image, "image card missing");
  assert(image.payload.provider === "openai" && image.payload.model === "gpt-image-2", "mock image uses gpt-image-2");
  assert(providerChipLabel(image) === "GPT Image 2", "mock image chip follows gpt-image-2");
  assert(typeof image.payload.url === "string" && image.payload.url.startsWith("mock://"), "image uses a mock url");
  const clipReady = seen.some((event) => event.kind === "image" && event.status === "done");
  assert(clipReady, "image generation emits a done tick");
  seen.length = 0;
  await api.regenerateArtefact(image.id, 1, "brighter sky");
  await pump(12);
  const statuses = seen.map((event) => event.status).join(",");
  assert(statuses.includes("queued") && statuses.includes("generating") && statuses.includes("done"), statuses);
  const updated = (await api.getVideo(opened.videoId)).artefacts.find((item) => item.id === image.id);
  assert(updated?.payload.feedback === "brighter sky", "typed feedback is stored on the artefact");
  assert(updated?.state === "awaiting_approval", "regenerate returns the card to review");
  const voice = (await api.listVoices()).items;
  assert(voice.length === VOICES.length, "listVoices returns the shared preset bank");
  stop();
}

async function main(): Promise<void> {
  providerCases();
  agentReviewCases();
  await composerDuringChipQuestions();

  const api = createMockStudio({ delayMs: 0 });
  const user = await api.createUser({ displayName: "Asha", phoneOrEmail: "asha@example.com" });
  assert(user.creditBalance > 0, "starter credits missing");
  const opened = await api.createChat({ initialMessage: "barish kaise banti hai" });
  assert(opened.stage === "brief", "chat should open on brief");

  const hydrated = await api.getChat(opened.chatId);
  assert(hydrated.videoId === opened.videoId, "GET chat returns videoId");
  assert(hydrated.stage === "brief", "GET chat returns stage");
  assert(hydrated.messages.length > 0, "GET chat returns messages");
  assert(Array.isArray(hydrated.artefacts), "GET chat returns artefacts");

  let singleChoiceRejected = false;
  try {
    await api.postMessage(opened.chatId, { answer: { field: "genre", optionIds: ["kids"] } });
  } catch (error) {
    singleChoiceRejected = error instanceof Error && error.message.includes("optionIds");
  }
  assert(singleChoiceRejected, "optionIds is only valid on cast");

  let rejectedOnce = false;
  let regenerated = false;
  let charged = 0;
  let castPicked = false;

  for (let step = 0; step < 50; step += 1) {
    await pump();
    const snap = await api.getVideo(opened.videoId);
    if (snap.video.stage === "done") break;

    if (snap.video.stage === "brief") {
      const history = await api.listMessages(opened.chatId);
      const question = openQuestion(history.messages);
      if (!question || !isQuestion(question)) continue;
      if (question.field === "cast" && !castPicked) {
        assert(!question.prompt.toLowerCase().includes("optionids"), "cast prompt stays user-facing");
        let emptyCast = false;
        try {
          await api.postMessage(opened.chatId, { answer: { field: "cast", optionIds: [] } });
        } catch {
          emptyCast = true;
        }
        assert(emptyCast, "cast rejects an empty optionIds list");
        let tooMany = false;
        try {
          await api.postMessage(opened.chatId, {
            answer: { field: "cast", optionIds: ["cast_chintu", "cast_mini", "cast_riya"] },
          });
        } catch {
          tooMany = true;
        }
        assert(tooMany, "cast rejects a third member");
        await api.postMessage(opened.chatId, {
          answer: { field: "cast", optionIds: ["cast_chintu", "cast_mini"] },
        });
        castPicked = true;
        continue;
      }
      await api.postMessage(opened.chatId, { answer: { field: question.field, useDefaults: true } });
      continue;
    }

    const awaiting = snap.artefacts.filter((item) => item.state === "awaiting_approval");
    const rejected = snap.artefacts.filter((item) => item.state === "rejected");

    if (!rejectedOnce && snap.video.stage === "cast" && awaiting[0]) {
      const target = awaiting[0];
      const rejectedBody = await api.rejectArtefact(target.id, { rejectNote: "Sheet ka pose badlo" });
      assert(rejectedBody.artefact.state === "rejected", "reject response returns artefact");
      assert(rejectedBody.artefact.id === target.id, "reject artefact id");
      const history = await api.listMessages(opened.chatId);
      const card = history.messages.find((item) => item.kind === "approval" && item.artefactId === target.id);
      assert(card && card.kind === "approval" && card.state === "rejected", "reject should update the card");
      assert(readRejectNote(card) === "Sheet ka pose badlo", "rejectNote should sit on the card");
      assert(card.preview.rejectionNote === undefined, "preview.rejectionNote is not the card field");
      assert(card.preview.rejectNote === undefined, "rejectNote stays off the preview bag");
      assert(rejectedBody.artefact.payload.rejectNote === "Sheet ka pose badlo", "artefact keeps the typed note name");
      const cleared = await api.approveAllRemaining(opened.videoId);
      assert(!cleared.approvedIds.includes(target.id), "approve-all must skip rejected cards");
      const held = await api.getVideo(opened.videoId);
      assert(held.video.stage === "cast", "a rejected card holds the stage");
      rejectedOnce = true;
      continue;
    }

    if (rejected[0] && !regenerated) {
      const target = rejected[0];
      const before = (await api.getMe()).creditBalance;
      const preview = await api.regenerateArtefact(target.id, 0);
      assert("canAfford" in preview, "confirm=0 returns a cost preview");
      assert(preview.canAfford, "starter balance should cover one regenerate");
      assert(preview.balance === before, "preview balance");
      assert(preview.creditCost > 0, "regenerate shows a cost");
      const confirmed = await api.regenerateArtefact(target.id, 1);
      assert("charged" in confirmed, "confirm=1 returns a charge");
      assert(confirmed.charged === preview.creditCost, "charged cost should match the preview");
      assert(confirmed.balance === before - confirmed.charged, "confirm returns wallet balance");
      assert(confirmed.artefact.state === "generating", "confirm returns updated artefact");
      const after = (await api.getMe()).creditBalance;
      assert(after === before - confirmed.charged, "balance should drop by the charged cost");
      charged = confirmed.charged;
      regenerated = true;
      continue;
    }

    if (awaiting.length > 0) {
      const first = awaiting[0]!;
      const approved = await api.approveArtefact(first.id);
      assert(approved.artefact.state === "approved", "approve response returns artefact");
      if (awaiting.length > 1) {
        await api.approveAllRemaining(opened.videoId);
      }
    }
  }

  const done = await api.getVideo(opened.videoId);
  assert(done.video.stage === "done", `expected done, got ${done.video.stage}`);
  assert(done.video.outputUrl?.startsWith("mock://"), "final url should be a mock locator");
  assert(rejectedOnce && regenerated && charged > 0, "reject and regenerate path did not run");
  assert(castPicked, "cast should have been picked via optionIds");

  const chatDone = await api.getChat(opened.chatId);
  assert(chatDone.stage === "done", "GET chat reflects done");
  assert(chatDone.messages.some((item) => item.kind === "question"), "brief questions missing");
  assert(chatDone.messages.some((item) => item.kind === "approval"), "approval cards missing");
  assert(chatDone.messages.some((item) => item.kind === "progress"), "progress lines missing");
  assert(chatDone.messages.some((item) => item.kind === "video"), "video message missing");
  const blob = JSON.stringify(chatDone.messages);
  assert(!blob.includes("http://") && !blob.includes("https://"), "mock transcript must not contain network URLs");

  const kinds = new Set(done.artefacts.map((item) => item.kind));
  const expected: ArtefactKind[] = ["identity", "voice_sample", "script", "prompt", "image", "clip", "audio", "final"];
  for (const kind of expected) {
    assert(kinds.has(kind), `missing artefact kind ${kind}`);
  }
  assert(done.artefacts.every((item) => item.state === "approved"), "every artefact should be approved");
  assert(done.video.brief.resolution === "720p", "kids default resolution");
  assert(done.video.brief.artStyle?.includes("2D"), "kids default art style");
  assert((done.video.brief.castIds ?? []).join() === "cast_chintu,cast_mini", "cast optionIds should stick");
  assert(done.video.brief.topic?.includes("barish"), "opening line should stay the topic");

  const packs = await api.listPacks();
  assert(packs.packs.length === 3, "three video packs");
  assert(packs.packs.map((pack) => pack.label).join(",") === "1 video,3 videos,10 videos", "pack labels are video counts");
  assert(packs.packs.every((pack) => pack.amountInr === 0), "placeholder prices stay TBD");
  assert(packs.packs[0]?.credits === STARTER_CREDITS, "one video uses the starter grant");
  assert(packs.packs[2]?.credits === STARTER_CREDITS * 10, "ten videos scale the starter grant");
  const beforePacks = (await api.getMe()).creditBalance;
  const bought = await api.checkout({ packId: "pack_1" });
  const session = sessionFromCheckout(bought);
  assert(session.orderId === bought.paymentId, "checkout returns an order id");
  assert(session.checkoutUrl?.startsWith("mock://pine-labs/"), "mock checkout locator");
  assert(!String(session.checkoutUrl).includes("http"), "checkout must not be a network url");
  assert(bought.creditsGranted === STARTER_CREDITS, "mock grants the pack credits");
  assert((await api.getMe()).creditBalance === beforePacks + STARTER_CREDITS, "balance grows by the pack");
  let unknownPack = false;
  try {
    await api.checkout({ packId: "missing" });
  } catch {
    unknownPack = true;
  }
  assert(unknownPack, "unknown pack fails checkout");
  assert((await api.getMe()).creditBalance === beforePacks + STARTER_CREDITS, "failed checkout leaves the balance");
}

async function answerBrief(api: ReturnType<typeof createMockStudio>, chatId: string, videoId: string): Promise<void> {
  for (let step = 0; step < 20; step += 1) {
    await pump();
    const snap = await api.getVideo(videoId);
    if (snap.video.stage !== "brief") return;
    const history = await api.listMessages(chatId);
    const question = openQuestion(history.messages);
    if (!question || !isQuestion(question)) continue;
    await api.postMessage(chatId, { answer: { field: question.field, useDefaults: true } });
  }
  throw new Error("brief did not finish");
}

async function briefEdges(): Promise<void> {
  const api = createMockStudio({ delayMs: 0 });
  await api.createUser({ displayName: "Asha", phoneOrEmail: "asha@example.com" });
  const opened = await api.createChat({});
  await pump();
  const first = openQuestion((await api.listMessages(opened.chatId)).messages);
  assert(first && isQuestion(first) && first.field === "topic", "signup with no topic must ask for one");
  await api.postMessage(opened.chatId, { text: "barish kaise banti hai" });
  await pump();
  const genre = openQuestion((await api.listMessages(opened.chatId)).messages);
  assert(genre && isQuestion(genre) && genre.field === "genre", "free-text topic should advance to genre");

  await answerBrief(api, opened.chatId, opened.videoId);
  for (let step = 0; step < 30; step += 1) {
    await pump();
    const snap = await api.getVideo(opened.videoId);
    if (snap.video.stage === "script") break;
    if (snap.artefacts.some((item) => item.state === "awaiting_approval")) {
      await api.approveAllRemaining(opened.videoId);
    }
  }
  const scriptSnap = await api.getVideo(opened.videoId);
  assert(scriptSnap.video.stage === "script", "expected the script stage");
  assert(scriptSnap.video.brief.topic === "barish kaise banti hai", "typed topic should lock on the brief");
  const script = scriptSnap.artefacts.find((item) => item.kind === "script");
  assert(script, "script card missing");
  const review = readAgentReview(script);
  assert(review !== undefined && review.status === "completed", "mock script carries a completed agent review");
  assert(review.confidence === 0.74, "mock script review includes a confidence");
  assert(reviewFixes(review).length === 3, "mock script review lists three fixes");
  const feedback = reviewFeedback(review);
  const before = JSON.stringify(script.payload);
  await api.regenerateArtefact(script.id, 1, feedback);
  await pump();
  const withFeedback = (await api.getVideo(opened.videoId)).artefacts.find((item) => item.id === script.id);
  const firstScene = Array.isArray(withFeedback?.payload.scenes) ? withFeedback.payload.scenes[0] : undefined;
  const narration =
    firstScene && typeof firstScene === "object" && "narration" in firstScene ? String(firstScene.narration) : "";
  assert(narration.includes("Shorten the hook"), "regenerate feedback should land on the script");
  await pump();
  const regenerated = (await api.getVideo(opened.videoId)).artefacts.find((item) => item.id === script.id);
  assert(regenerated?.state === "awaiting_approval", "regenerated script should wait for approval");
  assert(JSON.stringify(regenerated?.payload) !== before, "regenerate should change the script");
  await api.approveArtefact(script.id);
  for (let step = 0; step < 20; step += 1) {
    await pump();
    const snap = await api.getVideo(opened.videoId);
    if (snap.video.stage === "prompts") {
      const prompt = snap.artefacts.find((item) => item.kind === "prompt");
      const imagePrompt = prompt?.payload.imagePrompt;
      assert(typeof imagePrompt === "string" && imagePrompt.includes("(v2)"), "later prompts must use the regenerated narration");
      return;
    }
  }
  throw new Error("prompts did not open after the regenerated script");
}

main()
  .then(() => briefEdges())
  .then(() => mediaTicks())
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
