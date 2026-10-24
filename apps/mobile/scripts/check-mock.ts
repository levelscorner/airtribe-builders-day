import type { ArtefactKind, ChatMessage, QuestionMessage } from "@chotu/shared";
import { openQuestion } from "../src/chat/open-question";
import { createMockStudio } from "../src/mock-studio";

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
  const opened = await api.createChat({});
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

async function main(): Promise<void> {
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
      assert(card.preview.rejectionNote === "Sheet ka pose badlo", "note should sit on the preview");
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
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
