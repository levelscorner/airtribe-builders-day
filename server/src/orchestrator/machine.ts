import { randomUUID } from "node:crypto";
import type {
  AgentReview,
  ApprovalCardMessage,
  ArtefactKind,
  ArtefactSummary,
  Brief,
  CastMember,
  ChatMessage,
  Genre,
  Language,
  ProgressMessage,
  QuestionMessage,
  RegenerateConfirmResponse,
  RegeneratePreviewResponse,
  Scene,
  ScriptGenOutput,
  Stage,
  TextMessage,
  VideoMessage,
} from "@chotu/shared";
import {
  applyAnswer,
  applyDefaults,
  briefFromMessage,
  createPromptGen,
  createScriptGen,
  getGenre,
  getPresetCast,
  nextQuestion,
  PromptGenOutputSchema,
  ScriptGenOutputSchema,
  toQuestionMessage,
} from "../creative/index.js";
import type { IntakeAnswer } from "../creative/index.js";
import { claudeIntakeEnabled, claudeOpeningBrief, claudeParseFreeText, claudeQuestion } from "../llm/intake.js";
import { PROMPT_JSON_HINT, SCRIPT_JSON_HINT, creativeGenEnv } from "../llm/wire.js";
import { artefactCreditCost, debitRegenerate } from "../credits/stub.js";
import type { SqlClient } from "../db/client.js";
import { createMediaPorts } from "../media/index.js";
import { mockAssets } from "../media/placeholders.js";
import { ensureBlockingWarning, scriptArtefactState } from "../integrations/agenticorg/parse.js";
import { runScriptReview, type ScriptReviewInput } from "../integrations/agenticorg/run.js";
import { chatBus } from "./bus.js";
import * as store from "./store.js";

const STAGE_ORDER: Stage[] = [
  "brief",
  "cast",
  "script",
  "prompts",
  "images",
  "clips",
  "audio",
  "final",
  "done",
];

function now(): string {
  return new Date().toISOString();
}

function nid(_prefix?: string): string {
  // messages.id / artefacts use uuid columns (docs/14).
  return randomUUID();
}

export type OrchestratorContext = {
  db: SqlClient;
  mock: boolean;
  /** Active brief being filled during intake, keyed by chatId */
  briefs: Map<string, Brief>;
  /** Test seam. Production uses the AgenticOrg client. */
  reviewScript?: (input: ScriptReviewInput) => Promise<AgentReview>;
};

export function createOrchestratorContext(db: SqlClient, mock = true): OrchestratorContext {
  return { db, mock, briefs: new Map() };
}

async function publishMessage<T extends ChatMessage>(ctx: OrchestratorContext, message: T): Promise<T> {
  await store.appendMessage(ctx.db, message);
  chatBus.publish(message.chatId, { type: "message", message });
  return message;
}

async function publishArtefact(chatId: string, artefact: ArtefactSummary): Promise<void> {
  chatBus.publish(chatId, { type: "artefact", artefact });
}

async function text(
  ctx: OrchestratorContext,
  chatId: string,
  role: "user" | "assistant",
  value: string,
): Promise<TextMessage> {
  const message: TextMessage = {
    id: nid("msg"),
    chatId,
    role,
    kind: "text",
    text: value,
    createdAt: now(),
  };
  return publishMessage(ctx, message);
}

async function progress(
  ctx: OrchestratorContext,
  chatId: string,
  stage: Stage,
  value: string,
  agent?: string,
): Promise<ProgressMessage> {
  const message: ProgressMessage = {
    id: nid("msg"),
    chatId,
    role: "assistant",
    kind: "progress",
    stage,
    agent,
    text: value,
    createdAt: now(),
  };
  return publishMessage(ctx, message);
}

async function askQuestion(ctx: OrchestratorContext, chatId: string, brief: Brief): Promise<QuestionMessage | null> {
  let q = nextQuestion(brief);
  if (!q) return null;
  if (claudeIntakeEnabled()) {
    try {
      q = await claudeQuestion(brief, q);
    } catch {
      // Fixed question list still streams over SSE.
    }
  }
  const message = toQuestionMessage(q, {
    id: nid("msg"),
    chatId,
    createdAt: now(),
  });
  return publishMessage(ctx, message);
}

async function approvalCard(
  ctx: OrchestratorContext,
  chatId: string,
  stage: Stage,
  artefact: ArtefactSummary,
  title: string,
): Promise<ApprovalCardMessage> {
  const message: ApprovalCardMessage = {
    id: nid("msg"),
    chatId,
    role: "assistant",
    kind: "approval",
    artefactId: artefact.id,
    artefactKind: artefact.kind,
    stage,
    sceneId: artefact.sceneId,
    title,
    preview: { ...artefact.payload },
    regenerateCreditCost: artefact.creditCost,
    state:
      artefact.state === "approved" ||
      artefact.state === "rejected" ||
      artefact.state === "failed"
        ? artefact.state
        : "awaiting_approval",
    createdAt: now(),
  };
  return publishMessage(ctx, message);
}

async function patchApprovalCard(
  ctx: OrchestratorContext,
  chatId: string,
  artefact: ArtefactSummary,
): Promise<void> {
  const messages = await store.listMessages(ctx.db, chatId);
  const card = [...messages].reverse().find(
    (item): item is ApprovalCardMessage =>
      item.kind === "approval" && item.artefactId === artefact.id,
  );
  if (!card) return;
  const next: ApprovalCardMessage = {
    ...card,
    state:
      artefact.state === "approved" ||
      artefact.state === "rejected" ||
      artefact.state === "failed"
        ? artefact.state
        : "awaiting_approval",
    preview: { ...artefact.payload },
    regenerateCreditCost: artefact.creditCost,
  };
  await store.updateMessageBody(ctx.db, card.id, next);
  chatBus.publish(chatId, { type: "message", message: next });
}

function assertVideoOwner(video: { userId: string }, userId: string): void {
  if (video.userId !== userId) throw new Error("forbidden");
}

function primaryKind(stage: Stage): ArtefactKind | null {
  const kinds = stageKinds(stage);
  return kinds[0] ?? null;
}

async function markStageFailed(
  ctx: OrchestratorContext,
  chatId: string,
  videoId: string,
  stage: Stage,
  error: unknown,
): Promise<void> {
  const kind = primaryKind(stage);
  if (!kind) return;
  const message = error instanceof Error ? error.message : "stage_failed";
  const artefact = await store.insertArtefact(ctx.db, {
    videoId,
    kind,
    state: "failed",
    creditCost: artefactCreditCost(kind),
    payload: { generationFailed: true, error: message },
  });
  await approvalCard(ctx, chatId, stage, artefact, `Failed · ${stage}`);
  await progress(ctx, chatId, stage, `Generation fail: ${message}. Regenerate dabao.`, "Error");
  await store.logEvent(ctx.db, {
    videoId,
    kind: "agent_activity",
    payload: { stage, error: message, artefactId: artefact.id },
  });
}

function stageKinds(stage: Stage): ArtefactKind[] {
  switch (stage) {
    case "cast":
      return ["identity", "sheet", "anchor", "voice_sample"];
    case "script":
      return ["script"];
    case "prompts":
      return ["prompt"];
    case "images":
      return ["image"];
    case "clips":
      return ["clip"];
    case "audio":
      return ["audio"];
    case "final":
      return ["final"];
    default:
      return [];
  }
}

async function stageSettled(ctx: OrchestratorContext, videoId: string, stage: Stage): Promise<boolean> {
  const kinds = new Set(stageKinds(stage));
  if (kinds.size === 0) return true;
  const artefacts = (await store.listArtefacts(ctx.db, videoId)).filter((item) => kinds.has(item.kind));
  if (artefacts.length === 0) return false;
  return artefacts.every((item) => item.state === "approved");
}

async function attachCast(ctx: OrchestratorContext, videoId: string, castIds: string[]): Promise<CastMember[]> {
  const members = await store.listCastMembers(ctx.db, castIds);
  // Fall back to Venus fixtures if seed missing in odd test order.
  const found = members.length > 0 ? members : getPresetCast().filter((m) => castIds.includes(m.id));
  await store.setVideoCast(ctx.db, videoId, found.map((m) => m.id));
  return found;
}

async function beginCast(ctx: OrchestratorContext, chatId: string, videoId: string, cast: CastMember[]): Promise<void> {
  await progress(ctx, chatId, "cast", "Cast bank se characters lock kar rahe hain…", "Cast");
  for (const member of cast) {
    const identity = await store.insertArtefact(ctx.db, {
      videoId,
      kind: "identity",
      state: "awaiting_approval",
      creditCost: artefactCreditCost("identity"),
      payload: {
        castId: member.id,
        name: member.name,
        identityText: member.identityText,
        dnaChips: member.dnaChips,
      },
    });
    await approvalCard(ctx, chatId, "cast", identity, `${member.name} · identity`);

    if (member.role !== "narrator") {
      const sheet = await store.insertArtefact(ctx.db, {
        videoId,
        kind: "sheet",
        state: "awaiting_approval",
        creditCost: artefactCreditCost("sheet"),
        payload: { castId: member.id, url: mockAssets.keyframe, note: "Multi-angle sheet (mock)" },
      });
      await approvalCard(ctx, chatId, "cast", sheet, `${member.name} · sheet`);

      const anchor = await store.insertArtefact(ctx.db, {
        videoId,
        kind: "anchor",
        state: "awaiting_approval",
        creditCost: artefactCreditCost("anchor"),
        payload: {
          castId: member.id,
          url: mockAssets.anchor,
          higgsfieldElementId: member.higgsfieldElementId,
        },
      });
      await approvalCard(ctx, chatId, "cast", anchor, `${member.name} · face anchor`);
    }

    const voice = await store.insertArtefact(ctx.db, {
      videoId,
      kind: "voice_sample",
      state: "awaiting_approval",
      creditCost: artefactCreditCost("voice_sample"),
      payload: {
        castId: member.id,
        voiceId: member.voiceId,
        url: mockAssets.voice,
        line: `${member.name} sample line`,
      },
    });
    await approvalCard(ctx, chatId, "cast", voice, `${member.name} · voice`);
  }
}

async function beginScript(ctx: OrchestratorContext, chatId: string, videoId: string): Promise<void> {
  const video = (await store.getVideoRow(ctx.db, videoId))!;
  const castIds = video.brief.castIds ?? [];
  const cast = await attachCast(ctx, videoId, castIds);
  await progress(ctx, chatId, "script", "Script likh rahe hain…", "Script");
  // Payload stays { scenes, sceneIds } so a script critic can add agentReview beside it.
  const gen = createScriptGen(creativeGenEnv(ScriptGenOutputSchema, SCRIPT_JSON_HINT));
  const output = await gen.generate({
    videoId,
    brief: video.brief,
    cast,
    genre: video.genre,
    language: video.language,
    targetSeconds: video.targetSeconds,
  });
  const scenes = await store.replaceScenes(ctx.db, videoId, output.scenes);
  const review = await reviewScriptSafely(ctx, {
    genre: video.genre,
    brief: video.brief,
    scriptText: scriptTextOf(output),
  });
  if (review.warning) {
    await progress(ctx, chatId, "script", review.warning, "AgenticOrg");
  }
  const artefact = await store.insertArtefact(ctx.db, {
    videoId,
    kind: "script",
    state: scriptArtefactState(review),
    creditCost: artefactCreditCost("script"),
    payload: {
      scenes: output.scenes,
      sceneIds: scenes.map((s) => s.id),
      agentReview: review,
    },
  });
  await approvalCard(ctx, chatId, "script", artefact, "Script");
}

function scriptTextOf(output: ScriptGenOutput): string {
  if (output.rawMarkdown?.trim()) return output.rawMarkdown;
  return output.scenes.map((scene) => `${scene.idx}. ${scene.title}\n${scene.narration}`).join("\n\n");
}

/** Agent failures stay on the script card. The error text is never copied through. */
async function reviewScriptSafely(ctx: OrchestratorContext, input: ScriptReviewInput): Promise<AgentReview> {
  try {
    const review = ctx.reviewScript ? await ctx.reviewScript(input) : await runScriptReview(input);
    return ensureBlockingWarning(review);
  } catch {
    return { status: "failed", output: "", warning: "AgenticOrg review could not be reached" };
  }
}

async function beginPrompts(ctx: OrchestratorContext, chatId: string, videoId: string): Promise<void> {
  const video = (await store.getVideoRow(ctx.db, videoId))!;
  const scenes = await store.listScenes(ctx.db, videoId);
  const cast = await store.listCastMembers(ctx.db, video.brief.castIds);
  const members = cast.length ? cast : getPresetCast().filter((m) => (video.brief.castIds ?? []).includes(m.id));
  await progress(ctx, chatId, "prompts", "Image/video prompts…", "Prompts");
  const gen = createPromptGen(creativeGenEnv(PromptGenOutputSchema, PROMPT_JSON_HINT));
  for (const scene of scenes) {
    const sceneCast = members.filter((m) => scene.castIds.includes(m.id));
    const output = await gen.generate({
      videoId,
      scene,
      brief: video.brief,
      cast: sceneCast,
      artStyle: video.artStyle,
    });
    const artefact = await store.insertArtefact(ctx.db, {
      videoId,
      sceneId: scene.id,
      kind: "prompt",
      state: "awaiting_approval",
      creditCost: artefactCreditCost("prompt"),
      payload: { ...output, sceneIdx: scene.idx, title: scene.title },
    });
    await approvalCard(ctx, chatId, "prompts", artefact, `Prompt · ${scene.title ?? scene.idx}`);
  }
}

async function beginImages(ctx: OrchestratorContext, chatId: string, videoId: string): Promise<void> {
  const video = (await store.getVideoRow(ctx.db, videoId))!;
  const media = createMediaPorts({ MOCK: ctx.mock ? "1" : "0" });
  const prompts = (await store.listArtefacts(ctx.db, videoId)).filter(
    (a) => a.kind === "prompt" && a.state === "approved",
  );
  await progress(ctx, chatId, "images", "Keyframes…", "Images");
  for (const prompt of prompts) {
    // Venus embeds <<<el_*>>> tokens; Neptune REST mock expects ref: URLs.
    // Strip tokens for MOCK text-to-image; identity text stays in the prompt.
    const imagePrompt = String(prompt.payload.imagePrompt ?? "").replace(/<<<[^>]+>>>/g, " ").trim();
    const generated = await media.images.generate({
      prompt: imagePrompt,
      elementIds: [],
      aspectRatio: video.aspectRatio,
      resolution: video.resolution,
    });
    const artefact = await store.insertArtefact(ctx.db, {
      videoId,
      sceneId: prompt.sceneId,
      kind: "image",
      state: "awaiting_approval",
      creditCost: artefactCreditCost("image"),
      payload: { url: generated.url, provider: generated.provider, promptId: prompt.id },
    });
    await approvalCard(ctx, chatId, "images", artefact, `Image · scene`);
  }
}

async function beginClips(ctx: OrchestratorContext, chatId: string, videoId: string): Promise<void> {
  const video = (await store.getVideoRow(ctx.db, videoId))!;
  const media = createMediaPorts({ MOCK: ctx.mock ? "1" : "0" });
  const images = (await store.listArtefacts(ctx.db, videoId)).filter(
    (a) => a.kind === "image" && a.state === "approved",
  );
  const prompts = (await store.listArtefacts(ctx.db, videoId)).filter((a) => a.kind === "prompt");
  await progress(ctx, chatId, "clips", "Clips…", "Clips");
  for (const image of images) {
    const prompt = prompts.find((p) => p.id === image.payload.promptId || p.sceneId === image.sceneId);
    const videoPrompt = String(prompt?.payload.videoPrompt ?? "gentle motion")
      .replace(/<<<[^>]+>>>/g, " ")
      .trim();
    const scene = image.sceneId
      ? (await store.listScenes(ctx.db, videoId)).find((s) => s.id === image.sceneId)
      : undefined;
    const generated = await media.clips.generate({
      imageUrl: String(image.payload.url ?? mockAssets.keyframe),
      videoPrompt,
      elementIds: [],
      durationMs: scene?.durationMs ?? 3000,
      aspectRatio: video.aspectRatio,
    });
    const artefact = await store.insertArtefact(ctx.db, {
      videoId,
      sceneId: image.sceneId,
      kind: "clip",
      state: "awaiting_approval",
      creditCost: artefactCreditCost("clip"),
      payload: { url: generated.url, provider: generated.provider, imageId: image.id },
    });
    await approvalCard(ctx, chatId, "clips", artefact, `Clip · scene`);
  }
}

async function beginAudio(ctx: OrchestratorContext, chatId: string, videoId: string): Promise<void> {
  const video = (await store.getVideoRow(ctx.db, videoId))!;
  const scenes = await store.listScenes(ctx.db, videoId);
  const cast = await store.listCastMembers(ctx.db, video.brief.castIds);
  const media = createMediaPorts({ MOCK: ctx.mock ? "1" : "0" });
  await progress(ctx, chatId, "audio", "Voice lines…", "Voice");
  for (const scene of scenes) {
    const speaker = cast.find((m) => scene.castIds.includes(m.id)) ?? cast[0];
    const voiceId = speaker?.voiceId ?? "deep_storyteller_male";
    const generated = await media.voice.generate({
      text: scene.narration ?? "",
      voiceId,
      language: video.language,
    });
    const artefact = await store.insertArtefact(ctx.db, {
      videoId,
      sceneId: scene.id,
      kind: "audio",
      state: "awaiting_approval",
      creditCost: artefactCreditCost("audio"),
      payload: {
        url: generated.url,
        durationMs: generated.durationMs,
        provider: generated.provider,
        voiceId,
        narration: scene.narration,
      },
    });
    await approvalCard(ctx, chatId, "audio", artefact, `Audio · ${scene.title ?? scene.idx}`);
  }
}

async function beginFinal(ctx: OrchestratorContext, chatId: string, videoId: string): Promise<void> {
  await progress(ctx, chatId, "final", "Final cut assemble (mock)…", "Render");
  const scenes = await store.listScenes(ctx.db, videoId);
  const durationMs = scenes.reduce((sum, scene) => sum + (scene.durationMs ?? 0), 0);
  const url = `mock://videos/${videoId}.mp4`;
  const artefact = await store.insertArtefact(ctx.db, {
    videoId,
    kind: "final",
    state: "awaiting_approval",
    creditCost: artefactCreditCost("final"),
    payload: { url, durationMs, captions: true },
  });
  await store.updateVideo(ctx.db, videoId, { outputUrl: url });
  await approvalCard(ctx, chatId, "final", artefact, "Final cut");
}

async function runStageWork(
  ctx: OrchestratorContext,
  chatId: string,
  videoId: string,
  stage: Stage,
): Promise<void> {
  chatBus.publish(chatId, { type: "stage", videoId, stage });
  await store.logEvent(ctx.db, {
    videoId,
    kind: "stage_enter",
    payload: { stage },
  });

  if (stage === "done") {
    const video = (await store.getVideoRow(ctx.db, videoId))!;
    const scenes = await store.listScenes(ctx.db, videoId);
    const durationMs = scenes.reduce((sum, scene) => sum + (scene.durationMs ?? 0), 0);
    const message: VideoMessage = {
      id: nid("msg"),
      chatId,
      role: "assistant",
      kind: "video",
      videoId,
      url: video.outputUrl ?? `mock://videos/${videoId}.mp4`,
      durationMs,
      createdAt: now(),
    };
    await publishMessage(ctx, message);
    await store.logEvent(ctx.db, { videoId, kind: "render_done", payload: { url: message.url } });
    return;
  }

  try {
    const video = (await store.getVideoRow(ctx.db, videoId))!;
    const castIds = video.brief.castIds ?? getGenre(video.genre).defaultCastIds;
    const cast = await attachCast(ctx, videoId, castIds);

    switch (stage) {
      case "cast":
        await beginCast(ctx, chatId, videoId, cast);
        break;
      case "script":
        await beginScript(ctx, chatId, videoId);
        break;
      case "prompts":
        await beginPrompts(ctx, chatId, videoId);
        break;
      case "images":
        await beginImages(ctx, chatId, videoId);
        break;
      case "clips":
        await beginClips(ctx, chatId, videoId);
        break;
      case "audio":
        await beginAudio(ctx, chatId, videoId);
        break;
      case "final":
        await beginFinal(ctx, chatId, videoId);
        break;
      default:
        break;
    }
  } catch (error) {
    await markStageFailed(ctx, chatId, videoId, stage, error);
  }
}

/** Enter `stage` only if CAS from `from` succeeds (prevents double-advance). */
async function enterStageFrom(
  ctx: OrchestratorContext,
  chatId: string,
  videoId: string,
  from: Stage,
  stage: Stage,
): Promise<boolean> {
  const moved = await store.tryTransitionStage(ctx.db, videoId, from, stage);
  if (!moved) return false;
  await runStageWork(ctx, chatId, videoId, stage);
  return true;
}

async function advanceIfSettled(ctx: OrchestratorContext, chatId: string, videoId: string): Promise<void> {
  const video = await store.getVideoRow(ctx.db, videoId);
  if (!video || video.stage === "done" || video.stage === "brief") return;
  if (!(await stageSettled(ctx, videoId, video.stage))) return;
  const idx = STAGE_ORDER.indexOf(video.stage);
  const next = STAGE_ORDER[idx + 1];
  if (!next) return;
  await enterStageFrom(ctx, chatId, videoId, video.stage, next);
}

function lockBrief(brief: Brief): Brief {
  const genre = (brief.genre ?? "kids") as Genre;
  const filled = applyDefaults({ ...brief, genre });
  const config = getGenre(filled.genre ?? genre);
  return {
    ...filled,
    genre: filled.genre ?? genre,
    language: filled.language ?? config.defaultLanguage,
    aspectRatio: filled.aspectRatio ?? config.defaultAspectRatio,
    resolution: filled.resolution ?? config.defaultResolution,
    targetSeconds: filled.targetSeconds ?? config.defaultTargetSeconds,
    audience: filled.audience ?? config.defaultAudience,
    artStyle: filled.artStyle ?? config.defaultArtStyle,
    castIds: filled.castIds ?? config.defaultCastIds,
  };
}

export async function startChat(
  ctx: OrchestratorContext,
  input: { userId: string; title?: string; initialMessage?: string },
): Promise<{ chatId: string; videoId: string; stage: Stage }> {
  const { chatId, videoId } = await store.createChatVideo(ctx.db, {
    userId: input.userId,
    title: input.title,
  });
  await store.logEvent(ctx.db, {
    userId: input.userId,
    videoId,
    kind: "chat_started",
    payload: {},
  });

  let brief: Brief = {};
  if (input.initialMessage?.trim()) {
    const opening = input.initialMessage.trim();
    brief = briefFromMessage(opening);
    if (claudeIntakeEnabled()) {
      try {
        brief = await claudeOpeningBrief(opening, brief);
      } catch {
        // Keep the heuristic topic and genre guess.
      }
    }
    await text(ctx, chatId, "user", opening);
  }
  ctx.briefs.set(chatId, brief);
  chatBus.publish(chatId, { type: "stage", videoId, stage: "brief" });
  await askQuestion(ctx, chatId, brief);
  return { chatId, videoId, stage: "brief" };
}

export async function handleAnswer(
  ctx: OrchestratorContext,
  chatId: string,
  answer: IntakeAnswer,
  echo?: string,
): Promise<ChatMessage | undefined> {
  const meta = await store.getChatMeta(ctx.db, chatId);
  if (!meta) throw new Error("chat not found");
  const videoRow = await store.getVideoRow(ctx.db, meta.videoId);
  if (!videoRow) throw new Error("video not found");

  // Intake already finished — never re-enter cast on a retry.
  if (videoRow.stage !== "brief") {
    return text(ctx, chatId, "assistant", "Brief already locked — cast stage chalu hai.");
  }

  const brief = ctx.briefs.get(chatId) ?? {};
  const freeText =
    Boolean(answer.freeText?.trim()) &&
    !answer.optionId &&
    !(answer.optionIds && answer.optionIds.length > 0) &&
    !answer.skip &&
    !answer.useDefaults;
  let result: { brief: Brief; error?: string };
  if (freeText && claudeIntakeEnabled()) {
    try {
      result = await claudeParseFreeText(brief, answer);
    } catch {
      result = applyAnswer(brief, answer);
    }
  } else {
    result = applyAnswer(brief, answer);
  }
  if (result.error) {
    await text(ctx, chatId, "assistant", result.error);
    throw new Error(result.error);
  }
  ctx.briefs.set(chatId, result.brief);
  const userMsg = await text(
    ctx,
    chatId,
    "user",
    echo || answer.optionId || answer.optionIds?.join(", ") || answer.freeText || (answer.skip ? "Skip" : "Use defaults"),
  );

  const question = nextQuestion(result.brief);
  if (question) {
    await askQuestion(ctx, chatId, result.brief);
    return userMsg;
  }

  const locked = lockBrief(result.brief);
  ctx.briefs.set(chatId, locked);
  await store.updateVideo(ctx.db, meta.videoId, {
    genre: locked.genre as Genre,
    language: locked.language as Language,
    aspectRatio: locked.aspectRatio,
    resolution: locked.resolution,
    targetSeconds: locked.targetSeconds,
    artStyle: locked.artStyle,
    brief: locked,
  });
  await text(
    ctx,
    chatId,
    "assistant",
    `Brief lock · ${locked.genre} · ${locked.language} · ${locked.targetSeconds}s · cast ${(locked.castIds ?? []).join(", ")}`,
  );
  // CAS brief→cast so a duplicated final answer cannot spawn cast twice.
  await enterStageFrom(ctx, chatId, meta.videoId, "brief", "cast");
  return userMsg;
}

export async function approveArtefact(
  ctx: OrchestratorContext,
  input: { artefactId: string; userId: string },
): Promise<ArtefactSummary> {
  const artefact = await store.getArtefact(ctx.db, input.artefactId);
  if (!artefact) throw new Error("artefact not found");
  if (artefact.state !== "awaiting_approval") throw new Error("bad_state");
  const video = (await store.getVideoRow(ctx.db, artefact.videoId))!;
  assertVideoOwner(video, input.userId);
  const updated = await store.updateArtefact(ctx.db, artefact.id, { state: "approved" });
  await store.recordApproval(ctx.db, {
    artefactId: artefact.id,
    userId: input.userId,
    action: "approve",
  });
  await store.logEvent(ctx.db, {
    userId: input.userId,
    videoId: artefact.videoId,
    kind: "approval",
    payload: { artefactId: artefact.id, kind: artefact.kind },
  });
  await patchApprovalCard(ctx, video.chatId, updated);
  await publishArtefact(video.chatId, updated);
  await advanceIfSettled(ctx, video.chatId, artefact.videoId);
  return updated;
}

export async function rejectArtefact(
  ctx: OrchestratorContext,
  input: { artefactId: string; userId: string; rejectNote: string },
): Promise<ArtefactSummary> {
  const artefact = await store.getArtefact(ctx.db, input.artefactId);
  if (!artefact) throw new Error("artefact not found");
  const video = (await store.getVideoRow(ctx.db, artefact.videoId))!;
  assertVideoOwner(video, input.userId);
  const updated = await store.updateArtefact(ctx.db, artefact.id, {
    state: "rejected",
    payload: { ...artefact.payload, rejectionNote: input.rejectNote },
  });
  await store.recordApproval(ctx.db, {
    artefactId: artefact.id,
    userId: input.userId,
    action: "reject",
    note: input.rejectNote,
  });
  await store.logEvent(ctx.db, {
    userId: input.userId,
    videoId: artefact.videoId,
    kind: "reject",
    payload: { artefactId: artefact.id, note: input.rejectNote },
  });
  await patchApprovalCard(ctx, video.chatId, updated);
  await publishArtefact(video.chatId, updated);
  await text(ctx, video.chatId, "assistant", `Note: ${input.rejectNote}. Regenerate dabao.`);
  return updated;
}

async function buildRegenPayload(
  ctx: OrchestratorContext,
  video: NonNullable<Awaited<ReturnType<typeof store.getVideoRow>>>,
  artefact: ArtefactSummary,
  feedback: string | undefined,
  current: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (artefact.kind === "script") {
    const cast = await attachCast(ctx, video.id, video.brief.castIds ?? []);
    const output = await createScriptGen(creativeGenEnv(ScriptGenOutputSchema, SCRIPT_JSON_HINT)).generate({
      videoId: video.id,
      brief: video.brief,
      cast,
      genre: video.genre,
      language: video.language,
      targetSeconds: video.targetSeconds,
      feedback,
    });
    const scenes = await store.replaceScenes(ctx.db, video.id, output.scenes);
    return {
      ...current,
      scenes: output.scenes,
      sceneIds: scenes.map((scene) => scene.id),
      feedback,
      regenerated: true,
      generationFailed: false,
      error: undefined,
    };
  }
  if (artefact.kind === "prompt" && artefact.sceneId) {
    const scene = (await store.listScenes(ctx.db, video.id)).find((item) => item.id === artefact.sceneId);
    if (scene) {
      const cast = await store.listCastMembers(ctx.db, video.brief.castIds);
      const members = cast.length
        ? cast
        : getPresetCast().filter((member) => (video.brief.castIds ?? []).includes(member.id));
      const output = await createPromptGen(creativeGenEnv(PromptGenOutputSchema, PROMPT_JSON_HINT)).generate({
        videoId: video.id,
        scene,
        brief: video.brief,
        cast: members.filter((member) => scene.castIds.includes(member.id)),
        artStyle: video.artStyle,
        feedback,
      });
      return {
        ...current,
        ...output,
        sceneIdx: scene.idx,
        title: scene.title,
        feedback,
        regenerated: true,
        generationFailed: false,
        error: undefined,
      };
    }
  }
  return {
    ...current,
    regenerated: true,
    url: typeof current.url === "string" ? current.url : mockAssets.keyframe,
  };
}

export async function regenerateArtefact(
  ctx: OrchestratorContext,
  input: { artefactId: string; userId: string; confirm: boolean; feedback?: string },
): Promise<RegeneratePreviewResponse | RegenerateConfirmResponse> {
  const artefact = await store.getArtefact(ctx.db, input.artefactId);
  if (!artefact) throw new Error("artefact not found");
  const video = (await store.getVideoRow(ctx.db, artefact.videoId))!;
  assertVideoOwner(video, input.userId);
  const user = await store.getUser(ctx.db, input.userId);
  if (!user) throw new Error("user not found");
  const cost = artefact.creditCost;
  if (!input.confirm) {
    return {
      artefactId: artefact.id,
      creditCost: cost,
      balance: user.creditBalance,
      canAfford: user.creditBalance >= cost,
    };
  }
  if (
    artefact.state !== "rejected" &&
    artefact.state !== "failed" &&
    artefact.state !== "awaiting_approval"
  ) {
    throw new Error("bad_state");
  }
  const nextVersion = artefact.version + 1;
  const balance = await debitRegenerate(ctx.db, {
    userId: input.userId,
    videoId: artefact.videoId,
    amount: cost,
    ref: `regen:${artefact.id}:v${nextVersion}`,
  });
  let updated = await store.updateArtefact(ctx.db, artefact.id, {
    state: "generating",
    version: nextVersion,
    payload: {
      ...artefact.payload,
      feedback: input.feedback,
      version: nextVersion,
      generationFailed: false,
      error: undefined,
    },
  });
  await store.recordApproval(ctx.db, {
    artefactId: artefact.id,
    userId: input.userId,
    action: "regenerate",
    note: input.feedback,
    creditCharged: cost,
  });
  await store.logEvent(ctx.db, {
    userId: input.userId,
    videoId: artefact.videoId,
    kind: "regenerate",
    payload: { artefactId: artefact.id, charged: cost },
  });
  await publishArtefact(video.chatId, updated);
  await progress(ctx, video.chatId, video.stage, `Dobara bana rahe hain · ${cost} credits.`, "Regen");

  try {
    updated = await store.updateArtefact(ctx.db, artefact.id, {
      state: "awaiting_approval",
      payload: await buildRegenPayload(ctx, video, artefact, input.feedback, updated.payload),
    });
  } catch (error) {
    updated = await store.updateArtefact(ctx.db, artefact.id, {
      state: "failed",
      payload: {
        ...updated.payload,
        generationFailed: true,
        error: error instanceof Error ? error.message : "regen_failed",
      },
    });
  }
  await patchApprovalCard(ctx, video.chatId, updated);
  await publishArtefact(video.chatId, updated);

  return {
    artefactId: artefact.id,
    state: updated.state,
    charged: cost,
    balance,
    artefact: updated,
  };
}

export async function approveAllRemaining(
  ctx: OrchestratorContext,
  input: { videoId: string; userId: string },
): Promise<{ videoId: string; stage: Stage; approvedIds: string[] }> {
  const video = await store.getVideoRow(ctx.db, input.videoId);
  if (!video) throw new Error("video not found");
  assertVideoOwner(video, input.userId);
  const kinds = new Set(stageKinds(video.stage));
  const approvedIds: string[] = [];
  for (const artefact of await store.listArtefacts(ctx.db, input.videoId)) {
    if (!kinds.has(artefact.kind) || artefact.state !== "awaiting_approval") continue;
    const updated = await store.updateArtefact(ctx.db, artefact.id, { state: "approved" });
    approvedIds.push(updated.id);
    await store.recordApproval(ctx.db, {
      artefactId: updated.id,
      userId: input.userId,
      action: "approve_all_remaining",
    });
    await patchApprovalCard(ctx, video.chatId, updated);
    await publishArtefact(video.chatId, updated);
  }
  await advanceIfSettled(ctx, video.chatId, input.videoId);
  const after = (await store.getVideoRow(ctx.db, input.videoId))!;
  return { videoId: input.videoId, stage: after.stage, approvedIds };
}

/** Test hook: force a stage begin failure path. */
export async function __testEnterStageFrom(
  ctx: OrchestratorContext,
  chatId: string,
  videoId: string,
  from: Stage,
  stage: Stage,
): Promise<boolean> {
  return enterStageFrom(ctx, chatId, videoId, from, stage);
}

export async function __testMarkStageFailed(
  ctx: OrchestratorContext,
  chatId: string,
  videoId: string,
  stage: Stage,
  error: unknown,
): Promise<void> {
  return markStageFailed(ctx, chatId, videoId, stage, error);
}

export type { Scene };
