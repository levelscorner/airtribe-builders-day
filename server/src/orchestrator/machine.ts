import { randomUUID } from "node:crypto";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  AgentReview,
  ApprovalCardMessage,
  ArtefactKind,
  ArtefactSummary,
  Brief,
  CastMember,
  PlannedScene,
  ChatMessage,
  Genre,
  Language,
  MediaProgressEvent,
  MediaProviderName,
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
  ScenePlanSchema,
  ScriptGenOutputSchema,
  createScenePlan,
  toQuestionMessage,
} from "../creative/index.js";
import type { IntakeAnswer } from "../creative/index.js";
import { claudeIntakeEnabled, claudeOpeningBrief, claudeParseFreeText, claudeQuestion } from "../llm/intake.js";
import { PROMPT_JSON_HINT, SCENE_PLAN_HINT, SCRIPT_JSON_HINT, creativeGenEnv } from "../llm/wire.js";
import { artefactCreditCost, debitRegenerate } from "../credits/stub.js";
import type { SqlClient } from "../db/client.js";
import { createMediaPorts } from "../media/index.js";
import { retainReferences } from "../creative/prompts/create.js";
import { elementIdForAnchor } from "../media/cast/reference.js";
import { resolveLlmProvider } from "../llm/provider.js";
import { DEFAULT_CLAUDE_MODEL } from "../llm/claude.js";
import { mediaRoot } from "../media/files.js";
import { mockAssets, publicUrl } from "../media/placeholders.js";
import {
  castAnchorIds,
  mapWithConcurrency,
  regenScope,
  sceneConcurrency,
  sceneDurationSec,
} from "../media/scenes.js";
import { assembleWithFfmpeg, renderOutputPath } from "../render/ffmpeg.js";
import type { RendererInput } from "../render/types.js";
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

function readScenePlan(payload: Record<string, unknown> | undefined): PlannedScene[] {
  const plan = payload?.scenePlan;
  if (!plan || typeof plan !== "object" || !("scenes" in plan)) return [];
  const scenes = (plan as { scenes?: unknown }).scenes;
  return Array.isArray(scenes) ? (scenes as PlannedScene[]) : [];
}

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

export function createOrchestratorContext(
  db: SqlClient,
  mock = true,
): OrchestratorContext {
  return { db, mock, briefs: new Map() };
}

async function publishMessage<T extends ChatMessage>(
  ctx: OrchestratorContext,
  message: T,
): Promise<T> {
  await store.appendMessage(ctx.db, message);
  chatBus.publish(message.chatId, { type: "message", message });
  return message;
}

async function publishArtefact(
  chatId: string,
  artefact: ArtefactSummary,
): Promise<void> {
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

async function askQuestion(
  ctx: OrchestratorContext,
  chatId: string,
  brief: Brief,
): Promise<QuestionMessage | null> {
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
  const card = [...messages]
    .reverse()
    .find(
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
    payload: { generationFailed: true, error: message, failedStage: stage },
  });
  await approvalCard(ctx, chatId, stage, artefact, `Failed · ${stage}`);
  await progress(
    ctx,
    chatId,
    stage,
    `Generation fail: ${message}. Regenerate dabao.`,
    "Error",
  );
  await store.logEvent(ctx.db, {
    videoId,
    kind: "agent_activity",
    payload: { stage, error: message, artefactId: artefact.id },
  });
}

function stageKinds(
  stage: Stage,
  experience?: Brief["experience"],
): ArtefactKind[] {
  switch (stage) {
    case "cast":
      return experience === "chat_canvas"
        ? ["identity", "sheet", "anchor", "voice_sample", "image"]
        : ["identity", "sheet", "anchor", "voice_sample"];
    case "script":
      return ["script"];
    case "prompts":
      return ["prompt"];
    case "images":
      return ["image"];
    case "clips":
      return ["clip"];
    case "audio":
      return ["audio", "voice"];
    case "final":
      return ["final"];
    default:
      return [];
  }
}

async function stageSettled(
  ctx: OrchestratorContext,
  videoId: string,
  stage: Stage,
): Promise<boolean> {
  const video = await store.getVideoRow(ctx.db, videoId);
  const kinds = new Set(stageKinds(stage, video?.brief.experience));
  if (kinds.size === 0) return true;
  const artefacts = (await store.listArtefacts(ctx.db, videoId)).filter(
    (item) => kinds.has(item.kind),
  );
  if (artefacts.length === 0) return false;
  if (video?.brief.experience === "chat_canvas" && stage === "cast") {
    // SSE exposes references as they finish. A second browser must not be able
    // to approve the first item and advance while the rest are still generating.
    const members = getPresetCast().filter((member) =>
      video.brief.castIds?.includes(member.id),
    );
    const visible = members.filter((member) => member.role !== "narrator");
    const scenes = await store.listScenes(ctx.db, videoId);
    const expected: Partial<Record<ArtefactKind, number>> = {
      identity: members.length,
      voice_sample: members.length,
      sheet: visible.length,
      anchor: visible.length,
      image: scenes.length,
    };
    if (!scenes.length || !members.length) return false;
    for (const [kind, count] of Object.entries(expected)) {
      if (artefacts.filter((item) => item.kind === kind).length < count)
        return false;
    }
  }
  return artefacts.every((item) => item.state === "approved");
}

async function attachCast(
  ctx: OrchestratorContext,
  videoId: string,
  castIds: string[],
): Promise<CastMember[]> {
  const members = await store.listCastMembers(ctx.db, castIds);
  // Fall back to Venus fixtures if seed missing in odd test order.
  const found =
    members.length > 0
      ? members
      : getPresetCast().filter((m) => castIds.includes(m.id));
  await store.setVideoCast(
    ctx.db,
    videoId,
    found.map((m) => m.id),
  );
  if (ctx.mock) return found;
  const anchors = (await store.listArtefacts(ctx.db, videoId)).filter(
    (a) => a.kind === "anchor",
  );
  return found.map((member) => {
    const anchor = anchors.find((a) => a.payload.castId === member.id);
    return anchor &&
      typeof anchor.payload.url === "string" &&
      !anchor.payload.url.includes("/mock/")
      ? {
          ...member,
          anchorUrl: anchor.payload.url,
          higgsfieldElementId: elementIdForAnchor(anchor.payload.url),
        }
      : member;
  });
}

async function characterReference(
  ctx: OrchestratorContext,
  videoId: string,
  member: CastMember,
  feedback?: string,
) {
  const video = (await store.getVideoRow(ctx.db, videoId))!;
  const media = createMediaPorts(imageMediaEnv(ctx));
  const generated = await media.images.generate({
    prompt: [
      video.artStyle,
      ...(video.brief.artStyleTraits ?? []),
      member.identityText,
      "One clean full-body character reference, entirely in frame with feet and head visible, plain neutral background, no text or labels.",
      feedback,
    ]
      .filter(Boolean)
      .join(". "),
    aspectRatio: "2:3",
    resolution: video.resolution,
    elementIds: [],
  });
  const reference = await media.cast.createReference({
    castId: member.id,
    name: member.name,
    identityText: member.identityText,
    anchorUrl: generated.url,
  });
  if (reference.status !== "completed")
    throw new Error(reference.error || "Character reference generation failed");
  return {
    url: generated.url,
    provider: generated.provider,
    model: generated.model,
    higgsfieldElementId: reference.higgsfieldElementId,
  };
}

async function beginCast(
  ctx: OrchestratorContext,
  chatId: string,
  videoId: string,
  cast: CastMember[],
): Promise<void> {
  await progress(
    ctx,
    chatId,
    "cast",
    "Cast bank se characters lock kar rahe hain…",
    "Cast",
  );
  for (const member of cast) {
    const existing = (await store.listArtefacts(ctx.db, videoId)).filter(
      (a) => a.payload.castId === member.id,
    );
    const required: ArtefactKind[] =
      member.role === "narrator"
        ? ["identity", "voice_sample"]
        : ["identity", "sheet", "anchor", "voice_sample"];
    if (
      required.every((kind) =>
        existing.some((a) => a.kind === kind && a.state !== "failed"),
      )
    )
      continue;
    const identity =
      existing.find((a) => a.kind === "identity" && a.state !== "failed") ??
      (await store.insertArtefact(ctx.db, {
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
      }));
    await approvalCard(
      ctx,
      chatId,
      "cast",
      identity,
      `${member.name} · identity`,
    );

    if (member.role !== "narrator") {
      const reference = ctx.mock
        ? undefined
        : await characterReference(ctx, videoId, member);
      const sheet = await store.insertArtefact(ctx.db, {
        videoId,
        kind: "sheet",
        state: "awaiting_approval",
        creditCost: artefactCreditCost("sheet"),
        payload: {
          castId: member.id,
          ...(reference ?? { url: mockAssets.keyframe, provider: "mock" }),
          note: reference ? "Character reference" : "Multi-angle sheet (mock)",
        },
      });
      await approvalCard(ctx, chatId, "cast", sheet, `${member.name} · sheet`);

      const anchor = await store.insertArtefact(ctx.db, {
        videoId,
        kind: "anchor",
        state: "awaiting_approval",
        creditCost: artefactCreditCost("anchor"),
        payload: {
          castId: member.id,
          ...(reference ?? {
            url: mockAssets.anchor,
            provider: "mock",
            higgsfieldElementId: member.higgsfieldElementId,
          }),
        },
      });
      await approvalCard(
        ctx,
        chatId,
        "cast",
        anchor,
        `${member.name} · face anchor`,
      );
    }

    const voicePreview = ctx.mock
      ? { url: mockAssets.voice, provider: "mock" }
      : process.env.ELEVENLABS_API_KEY
        ? await createMediaPorts({ ...process.env, MOCK: "0" }).voice.sample({
            text: `${member.name} is ready to tell your story.`,
            voiceId: member.voiceId || "voice_narrator",
            language: (await store.getVideoRow(ctx.db, videoId))!.language,
          })
        : {
            url: "",
            provider: "unavailable",
            note: "Voice previews need an ElevenLabs connection.",
          };
    const voice = await store.insertArtefact(ctx.db, {
      videoId,
      kind: "voice_sample",
      state: "awaiting_approval",
      creditCost: artefactCreditCost("voice_sample"),
      payload: {
        castId: member.id,
        voiceId: member.voiceId,
        ...voicePreview,
        line: `${member.name} sample line`,
      },
    });
    await approvalCard(ctx, chatId, "cast", voice, `${member.name} · voice`);
  }
}

function scriptProvider() {
  return resolveLlmProvider() === "claude"
    ? {
        provider: "anthropic",
        model: process.env.CLAUDE_MODEL || DEFAULT_CLAUDE_MODEL,
        providerLabel: "Claude",
      }
    : { provider: "mock", providerLabel: "Sample" };
}

async function beginScript(
  ctx: OrchestratorContext,
  chatId: string,
  videoId: string,
): Promise<void> {
  const video = (await store.getVideoRow(ctx.db, videoId))!;
  const castIds = video.brief.castIds ?? [];
  const cast = await attachCast(ctx, videoId, castIds);
  await progress(ctx, chatId, "script", "Script likh rahe hain…", "Script");
  // Payload stays { scenes, sceneIds } so a script critic can add agentReview beside it.
  const gen = createScriptGen(
    creativeGenEnv(ScriptGenOutputSchema, SCRIPT_JSON_HINT),
  );
  const output = await gen.generate({
    videoId,
    brief: video.brief,
    cast,
    genre: video.genre,
    language: video.language,
    targetSeconds: video.targetSeconds,
  });
  const scenes = await store.replaceScenes(ctx.db, videoId, output.scenes);
  const scenePlan = await createScenePlan(creativeGenEnv(ScenePlanSchema, SCENE_PLAN_HINT)).generate({
    videoId,
    brief: video.brief,
    cast,
    genre: video.genre,
    language: video.language,
    targetSeconds: video.targetSeconds,
  });
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
      scenePlan,
      agentReview: review,
      ...scriptProvider(),
    },
  });
  await approvalCard(ctx, chatId, "script", artefact, "Script");
}

function scriptTextOf(output: ScriptGenOutput): string {
  if (output.rawMarkdown?.trim()) return output.rawMarkdown;
  return output.scenes
    .map((scene) => `${scene.idx}. ${scene.title}\n${scene.narration}`)
    .join("\n\n");
}

/** Agent failures stay on the script card. The error text is never copied through. */
async function reviewScriptSafely(
  ctx: OrchestratorContext,
  input: ScriptReviewInput,
): Promise<AgentReview> {
  try {
    const review = ctx.reviewScript
      ? await ctx.reviewScript(input)
      : await runScriptReview(input);
    return ensureBlockingWarning(review);
  } catch {
    return {
      status: "failed",
      output: "",
      warning: "AgenticOrg review could not be reached",
    };
  }
}

async function beginPrompts(
  ctx: OrchestratorContext,
  chatId: string,
  videoId: string,
  review = true,
): Promise<void> {
  const video = (await store.getVideoRow(ctx.db, videoId))!;
  const scenes = await store.listScenes(ctx.db, videoId);
  const members = await attachCast(ctx, videoId, video.brief.castIds ?? []);
  await progress(ctx, chatId, "prompts", "Image/video prompts…", "Prompts");
  const gen = createPromptGen(creativeGenEnv(PromptGenOutputSchema, PROMPT_JSON_HINT));
  const planned = readScenePlan(
    (await store.listArtefacts(ctx.db, videoId)).find((item) => item.kind === "script")?.payload,
  );
  for (const scene of scenes) {
    if (
      (await store.listArtefacts(ctx.db, videoId)).some(
        (a) =>
          a.kind === "prompt" && a.sceneId === scene.id && a.state !== "failed",
      )
    )
      continue;
    const sceneCast = members.filter((m) => scene.castIds.includes(m.id));
    const fromPlan = planned[scene.idx];
    const output = fromPlan ? retainReferences({ videoId, scene, brief: video.brief, cast: sceneCast, artStyle: video.artStyle }, { imagePrompt: fromPlan.imagePrompt, videoPrompt: fromPlan.motionPrompt, elementIds: [] }) : await gen.generate({
      videoId, scene, brief: video.brief, cast: sceneCast, artStyle: video.artStyle,
    });
    const direction = fromPlan ? retainReferences({ videoId, scene, brief: video.brief, cast: sceneCast, artStyle: video.artStyle }, { imagePrompt: fromPlan.imagePrompt, videoPrompt: fromPlan.motionPrompt, elementIds: output.elementIds }) : output;
    const artefact = await store.insertArtefact(ctx.db, {
      videoId,
      sceneId: scene.id,
      kind: "prompt",
      state: review ? "awaiting_approval" : "approved",
      creditCost: artefactCreditCost("prompt"),
      payload: {
        ...output,
        imagePrompt: direction.imagePrompt,
        videoPrompt: direction.videoPrompt,
        motionPrompt: fromPlan?.motionPrompt ?? output.videoPrompt,
        durationSec: fromPlan?.durationSec,
        vo: fromPlan?.vo,
        voiceId: fromPlan?.voiceId,
        sceneIdx: scene.idx,
        title: scene.title,
      },
    });
    if (review)
      await approvalCard(
        ctx,
        chatId,
        "prompts",
        artefact,
        `Prompt · ${scene.title ?? scene.idx}`,
      );
  }
}

function mediaEnv(ctx: OrchestratorContext): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, MOCK: ctx.mock ? "1" : "0" };
  // The live SLB2 flow explicitly requests Seedance rather than a slideshow.
  if (!ctx.mock && !env.CLIP_MOCK?.trim()) env.CLIP_MOCK = "0";
  return env;
}

/** The scene pipeline opts into gpt-image-2. A blank IMAGE_PROVIDER elsewhere stays on Ark. */
function imageMediaEnv(ctx: OrchestratorContext): NodeJS.ProcessEnv {
  const env = mediaEnv(ctx);
  if (env.MOCK === "1" || env.IMAGE_PROVIDER?.trim().toLowerCase() === "mock") return env;
  return { ...env, IMAGE_PROVIDER: "openai" };
}

function sceneLimit(): number {
  return sceneConcurrency(process.env);
}

function renderWorkDir(): string {
  return process.env.RENDER_WORK_DIR?.trim() || join(dirname(fileURLToPath(import.meta.url)), "../../data/renders");
}

function latestOf(artefacts: ArtefactSummary[], sceneId: string, kinds: string[]): ArtefactSummary | undefined {
  return [...artefacts].reverse().find((item) => item.sceneId === sceneId && kinds.includes(item.kind));
}

function asMediaProvider(value: string | undefined): MediaProviderName {
  if (value === "openai" || value === "ark" || value === "higgsfield" || value === "elevenlabs" || value === "mock") {
    return value;
  }
  return "mock";
}

function publishMedia(chatId: string, event: Omit<MediaProgressEvent, "type">): void {
  chatBus.publish(chatId, { type: "media.progress", ...event });
}

async function beginImages(ctx: OrchestratorContext, chatId: string, videoId: string): Promise<void> {
  const video = (await store.getVideoRow(ctx.db, videoId))!;
  const media = createMediaPorts(imageMediaEnv(ctx));
  const artefacts = await store.listArtefacts(ctx.db, videoId);
  const prompts = artefacts.filter((a) => a.kind === "prompt" && a.state === "approved");
  const planned = readScenePlan(artefacts.find((item) => item.kind === "script")?.payload);
  const scenes = await store.listScenes(ctx.db, videoId);
  const cast = await attachCast(ctx, videoId, video.brief.castIds ?? []);
  await progress(ctx, chatId, "images", "Keyframes…", "Images");
  await mapWithConcurrency(prompts, sceneLimit(), async (prompt) => {
    const scene = scenes.find((item) => item.id === prompt.sceneId);
    const plan = scene ? planned[scene.idx] : undefined;
    // Venus embeds <<<el_*>>> tokens. Only http(s) and ref: anchors go to edits.
    const imagePrompt = String(plan?.imagePrompt ?? prompt.payload.imagePrompt ?? "")
      .replace(/<<<[^>]+>>>/g, " ")
      .trim();
    const rawIds = Array.isArray(prompt.payload.elementIds) ? prompt.payload.elementIds : [];
    const sceneCast = cast.filter((member) => scene?.castIds.includes(member.id));
    const elementIds = castAnchorIds(
      sceneCast,
      rawIds.filter((id): id is string => typeof id === "string"),
    );
    const pending = await store.insertArtefact(ctx.db, {
      videoId,
      sceneId: prompt.sceneId,
      kind: "image",
      state: "generating",
      creditCost: artefactCreditCost("image"),
      payload: { promptId: prompt.id },
    });
    publishMedia(chatId, {
      jobId: pending.id,
      artefactId: pending.id,
      kind: "image",
      status: "generating",
      percent: 10,
      sceneId: prompt.sceneId,
      provider: "mock",
      model: "",
    });
    try {
      const generated = await media.images.generate({
        prompt: imagePrompt,
        elementIds,
        aspectRatio: video.aspectRatio,
        resolution: video.resolution,
      });
      const provider = asMediaProvider(generated.provider);
      const model = generated.model ?? "";
      const providerLabel = generated.providerLabel ?? (provider === "mock" ? "Mock" : provider);
      const artefact = await store.updateArtefact(ctx.db, pending.id, {
        state: "awaiting_approval",
        payload: { url: generated.url, provider, model, providerLabel, promptId: prompt.id },
      });
      publishMedia(chatId, {
        jobId: pending.id,
        artefactId: artefact.id,
        kind: "image",
        status: "done",
        percent: 100,
        url: generated.url,
        sceneId: prompt.sceneId,
        provider,
        model,
      });
      await approvalCard(ctx, chatId, "images", artefact, `Image · scene`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "image failed";
      await store.updateArtefact(ctx.db, pending.id, {
        state: "failed",
        payload: { promptId: prompt.id, error: message, provider: "mock" },
      });
      publishMedia(chatId, {
        jobId: pending.id,
        artefactId: pending.id,
        kind: "image",
        status: "failed",
        error: message,
        sceneId: prompt.sceneId,
        provider: "mock",
        model: "",
      });
      throw error;
    }
  });
}

async function beginClips(
  ctx: OrchestratorContext,
  chatId: string,
  videoId: string,
): Promise<void> {
  const video = (await store.getVideoRow(ctx.db, videoId))!;
  const media = createMediaPorts(mediaEnv(ctx));
  const artefacts = await store.listArtefacts(ctx.db, videoId);
  const images = artefacts.filter((a) => a.kind === "image" && a.state === "approved");
  const prompts = artefacts.filter((a) => a.kind === "prompt");
  const planned = readScenePlan(artefacts.find((item) => item.kind === "script")?.payload);
  const scenes = await store.listScenes(ctx.db, videoId);
  await progress(ctx, chatId, "clips", "Clips…", "Clips");
  await mapWithConcurrency(images, sceneLimit(), async (image) => {
    const scene = image.sceneId ? scenes.find((item) => item.id === image.sceneId) : undefined;
    const plan = scene ? planned[scene.idx] : undefined;
    const prompt = prompts.find((p) => p.id === image.payload.promptId || p.sceneId === image.sceneId);
    const videoPrompt = String(plan?.motionPrompt ?? prompt?.payload.motionPrompt ?? prompt?.payload.videoPrompt ?? "gentle motion")
      .replace(/<<<[^>]+>>>/g, " ")
      .trim();
    const durationMs = sceneDurationSec(plan?.durationSec ?? prompt?.payload.durationSec, scene?.durationMs) * 1000;
    const pending = await store.insertArtefact(ctx.db, {
      videoId,
      sceneId: image.sceneId,
      kind: "clip",
      state: "generating",
      creditCost: artefactCreditCost("clip"),
      payload: { imageId: image.id },
    });
    publishMedia(chatId, {
      jobId: pending.id,
      artefactId: pending.id,
      kind: "clip",
      status: "generating",
      percent: 10,
      sceneId: image.sceneId,
      provider: "mock",
      model: "",
    });
    try {
      const generated = await media.clips.generate({
        imageUrl: String(image.payload.url ?? mockAssets.keyframe),
        videoPrompt,
        elementIds: [],
        durationMs,
        aspectRatio: video.aspectRatio,
      });
      const provider = asMediaProvider(generated.provider);
      const model = generated.model ?? "";
      const providerLabel = generated.providerLabel ?? (provider === "mock" ? "Mock" : provider);
      const artefact = await store.updateArtefact(ctx.db, pending.id, {
        state: "awaiting_approval",
        payload: { url: generated.url, provider, model, providerLabel, imageId: image.id },
      });
      publishMedia(chatId, {
        jobId: pending.id,
        artefactId: artefact.id,
        kind: "clip",
        status: "done",
        percent: 100,
        url: generated.url,
        sceneId: image.sceneId,
        provider,
        model,
      });
      await approvalCard(ctx, chatId, "clips", artefact, `Clip · scene`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "clip failed";
      console.error(`[media] clip generate failed: ${message}`, error);
      await store.updateArtefact(ctx.db, pending.id, {
        state: "failed",
        payload: { imageId: image.id, error: message, provider: "mock" },
      });
      publishMedia(chatId, {
        jobId: pending.id,
        artefactId: pending.id,
        kind: "clip",
        status: "failed",
        error: message,
        sceneId: image.sceneId,
        provider: "mock",
        model: "",
      });
      throw error;
    }
  });
}

async function beginAudio(
  ctx: OrchestratorContext,
  chatId: string,
  videoId: string,
): Promise<void> {
  const video = (await store.getVideoRow(ctx.db, videoId))!;
  const scenes = await store.listScenes(ctx.db, videoId);
  const cast = await store.listCastMembers(ctx.db, video.brief.castIds);
  const artefacts = await store.listArtefacts(ctx.db, videoId);
  const planned = readScenePlan(artefacts.find((item) => item.kind === "script")?.payload);
  const prompts = artefacts.filter((item) => item.kind === "prompt");
  const media = createMediaPorts(mediaEnv(ctx));
  await progress(ctx, chatId, "audio", "Voice lines…", "Voice");
  await mapWithConcurrency(scenes, sceneLimit(), async (scene) => {
    const plan = planned[scene.idx];
    const prompt = prompts.find((item) => item.sceneId === scene.id);
    const speaker = cast.find((m) => scene.castIds.includes(m.id)) ?? cast[0];
    const voiceId = plan?.voiceId || textOf(prompt?.payload.voiceId) || speaker?.voiceId || "deep_storyteller_male";
    const spoken = plan?.vo || textOf(prompt?.payload.vo) || scene.narration || "";
    const pending = await store.insertArtefact(ctx.db, {
      videoId,
      sceneId: scene.id,
      kind: "voice",
      state: "generating",
      creditCost: artefactCreditCost("voice"),
      payload: { voiceId, narration: spoken },
    });
    publishMedia(chatId, {
      jobId: pending.id,
      artefactId: pending.id,
      kind: "voice",
      status: "generating",
      percent: 10,
      sceneId: scene.id,
      provider: "mock",
      model: "",
    });
    try {
      const generated = await media.voice.generate({
        text: spoken,
        voiceId,
        language: video.language,
      });
      const provider = asMediaProvider(generated.provider);
      const model = generated.model ?? "";
      const providerLabel = generated.providerLabel ?? (provider === "elevenlabs" ? "ElevenLabs" : "Mock");
      const artefact = await store.updateArtefact(ctx.db, pending.id, {
        state: "awaiting_approval",
        payload: {
          url: generated.url,
          durationMs: generated.durationMs,
          provider,
          model,
          providerLabel,
          voiceId,
          narration: spoken,
        },
      });
      publishMedia(chatId, {
        jobId: pending.id,
        artefactId: artefact.id,
        kind: "voice",
        status: "done",
        percent: 100,
        url: generated.url,
        sceneId: scene.id,
        provider,
        model,
      });
      await approvalCard(ctx, chatId, "audio", artefact, `Voice · ${scene.title ?? scene.idx}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "voice failed";
      console.error(`[media] voice generate failed: ${message}`, error);
      await store.updateArtefact(ctx.db, pending.id, {
        state: "failed",
        payload: { voiceId, narration: spoken, error: message, provider: "mock" },
      });
      publishMedia(chatId, {
        jobId: pending.id,
        artefactId: pending.id,
        kind: "voice",
        status: "failed",
        error: message,
        sceneId: scene.id,
        provider: "mock",
        model: "",
      });
      throw error;
    }
  });
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function beginFinal(ctx: OrchestratorContext, chatId: string, videoId: string): Promise<void> {
  await progress(ctx, chatId, "final", ctx.mock ? "Final cut assemble (mock)…" : "Final cut…", "Render");
  const scenes = await store.listScenes(ctx.db, videoId);
  const durationMs = scenes.reduce((sum, scene) => sum + (scene.durationMs ?? 0), 0);
  const downloadUrl = publicUrl(process.env, `/v1/videos/${videoId}/download`);
  if (!ctx.mock) {
    const rendered = await renderCut(ctx, videoId);
    const artefact = await store.insertArtefact(ctx.db, {
      videoId,
      kind: "final",
      state: "awaiting_approval",
      creditCost: artefactCreditCost("final"),
      payload: {
        url: rendered.url,
        downloadUrl,
        durationMs: rendered.durationMs || durationMs,
        captions: true,
        provider: "ffmpeg",
        model: "libx264",
        providerLabel: "ffmpeg",
      },
    });
    await store.updateVideo(ctx.db, videoId, { outputUrl: rendered.url });
    await approvalCard(ctx, chatId, "final", artefact, "Final cut");
    return;
  }
  const url = `mock://videos/${videoId}.mp4`;
  const artefact = await store.insertArtefact(ctx.db, {
    videoId,
    kind: "final",
    state: "awaiting_approval",
    creditCost: artefactCreditCost("final"),
    payload: { url, downloadUrl, durationMs, captions: true, provider: "mock", model: "concat", providerLabel: "Mock" },
  });
  await store.updateVideo(ctx.db, videoId, { outputUrl: url });
  await approvalCard(ctx, chatId, "final", artefact, "Final cut");
}

async function renderCut(ctx: OrchestratorContext, videoId: string): Promise<{ url: string; durationMs: number }> {
  const video = (await store.getVideoRow(ctx.db, videoId))!;
  const scenes = await store.listScenes(ctx.db, videoId);
  const artefacts = await store.listArtefacts(ctx.db, videoId);
  const input: RendererInput = {
    videoId,
    aspectRatio: video.aspectRatio || "9:16",
    resolution: video.resolution === "1080p" ? "1080p" : "720p",
    musicUrl: process.env.BACKGROUND_MUSIC_URL?.trim() || undefined,
    scenes: scenes.map((scene) => {
      const clip = latestOf(artefacts, scene.id, ["clip"]);
      const image = latestOf(artefacts, scene.id, ["image"]);
      const voice = latestOf(artefacts, scene.id, ["voice", "audio"]);
      const durationMs = typeof voice?.payload.durationMs === "number" ? voice.payload.durationMs : scene.durationMs ?? 5000;
      return {
        idx: scene.idx,
        clipUrl: textOf(clip?.payload.url) || undefined,
        imageUrl: textOf(image?.payload.url) || undefined,
        audioUrl: textOf(voice?.payload.url),
        narration: textOf(voice?.payload.narration) || scene.narration || "",
        durationMs,
      };
    }),
  };
  const workDir = renderWorkDir();
  const rendered = await assembleWithFfmpeg(input, {
    workDir,
    publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || "http://localhost:8787",
  });
  const destDir = join(mediaRoot(process.env), videoId);
  await mkdir(destDir, { recursive: true });
  await copyFile(renderOutputPath(workDir, videoId), join(destDir, "final.mp4"));
  return { url: publicUrl(process.env, `/media/${videoId}/final.mp4`), durationMs: rendered.durationMs };
}

async function reconcatIfPresent(ctx: OrchestratorContext, videoId: string): Promise<void> {
  const artefacts = await store.listArtefacts(ctx.db, videoId);
  const final = [...artefacts].reverse().find((item) => item.kind === "final");
  if (!final) return;
  if (ctx.mock) {
    await store.updateArtefact(ctx.db, final.id, {
      payload: {
        ...final.payload,
        url: textOf(final.payload.url) || `mock://videos/${videoId}.mp4`,
        downloadUrl: textOf(final.payload.downloadUrl) || publicUrl(process.env, `/v1/videos/${videoId}/download`),
        provider: "mock",
        model: "concat",
        providerLabel: "Mock",
        reconcat: true,
      },
    });
    return;
  }
  const rendered = await renderCut(ctx, videoId);
  const downloadUrl = publicUrl(process.env, `/v1/videos/${videoId}/download`);
  await store.updateArtefact(ctx.db, final.id, {
    payload: {
      ...final.payload,
      url: rendered.url,
      downloadUrl,
      durationMs: rendered.durationMs,
      provider: "ffmpeg",
      model: "libx264",
      providerLabel: "ffmpeg",
      reconcat: true,
    },
  });
  await store.updateVideo(ctx.db, videoId, { outputUrl: rendered.url });
}

/** Image regen invalidates that scene's clip. Other scenes stay cached. */
async function rerunDownstreamClip(
  ctx: OrchestratorContext,
  video: { id: string; chatId: string; aspectRatio: string },
  scene: Scene,
  image: ArtefactSummary,
): Promise<void> {
  const scope = regenScope("image");
  if (!scope.rerun.includes("clip")) return;
  const artefacts = await store.listArtefacts(ctx.db, video.id);
  const clip = latestOf(artefacts, scene.id, ["clip"]);
  if (!clip) return;
  const planned = readScenePlan(artefacts.find((item) => item.kind === "script")?.payload);
  const prompt = artefacts.find((item) => item.kind === "prompt" && item.sceneId === scene.id);
  const plan = planned[scene.idx];
  const motion = String(plan?.motionPrompt ?? prompt?.payload.motionPrompt ?? prompt?.payload.videoPrompt ?? "gentle motion")
    .replace(/<<<[^>]+>>>/g, " ")
    .trim();
  publishMedia(video.chatId, {
    jobId: clip.id,
    artefactId: clip.id,
    kind: "clip",
    status: "generating",
    percent: 10,
    sceneId: scene.id,
    provider: "mock",
    model: "",
  });
  try {
    const generated = await createMediaPorts(mediaEnv(ctx)).clips.generate({
      imageUrl: textOf(image.payload.url) || mockAssets.keyframe,
      videoPrompt: motion || "gentle motion",
      elementIds: [],
      durationMs: sceneDurationSec(plan?.durationSec ?? prompt?.payload.durationSec, scene.durationMs) * 1000,
      aspectRatio: video.aspectRatio,
    });
    const provider = asMediaProvider(generated.provider);
    const model = generated.model ?? "";
    const providerLabel = generated.providerLabel ?? (provider === "mock" ? "Mock" : provider);
    const updated = await store.updateArtefact(ctx.db, clip.id, {
      state: "awaiting_approval",
      version: clip.version + 1,
      payload: {
        ...clip.payload,
        url: generated.url,
        provider,
        model,
        providerLabel,
        imageId: image.id,
        regeneratedFrom: "image",
      },
    });
    publishMedia(video.chatId, {
      jobId: clip.id,
      artefactId: clip.id,
      kind: "clip",
      status: "done",
      percent: 100,
      url: generated.url,
      sceneId: scene.id,
      provider,
      model,
    });
    await publishArtefact(video.chatId, updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "clip regen failed";
    await store.updateArtefact(ctx.db, clip.id, {
      state: "failed",
      payload: { ...clip.payload, error: message, stale: true },
    });
    publishMedia(video.chatId, {
      jobId: clip.id,
      artefactId: clip.id,
      kind: "clip",
      status: "failed",
      error: message,
      sceneId: scene.id,
      provider: "mock",
      model: "",
    });
  }
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
    const durationMs = scenes.reduce(
      (sum, scene) => sum + (scene.durationMs ?? 0),
      0,
    );
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
    await store.logEvent(ctx.db, {
      videoId,
      kind: "render_done",
      payload: { url: message.url },
    });
    return;
  }

  try {
    const video = (await store.getVideoRow(ctx.db, videoId))!;
    const castIds = video.brief.castIds ?? getGenre(video.genre).defaultCastIds;
    const cast = await attachCast(ctx, videoId, castIds);

    switch (stage) {
      case "cast":
        await beginCast(ctx, chatId, videoId, cast);
        if (video.brief.experience === "chat_canvas") {
          // Script approval authorizes preparing visuals. Prompts are internal inputs;
          // the resulting images and character references still require approval.
          await beginPrompts(ctx, chatId, videoId, false);
          await beginImages(ctx, chatId, videoId);
        }
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

async function advanceIfSettled(
  ctx: OrchestratorContext,
  chatId: string,
  videoId: string,
): Promise<void> {
  const video = await store.getVideoRow(ctx.db, videoId);
  if (!video || video.stage === "done" || video.stage === "brief") return;
  if (!(await stageSettled(ctx, videoId, video.stage))) return;
  const order: Stage[] =
    video.brief.experience === "chat_canvas"
      ? ["brief", "script", "cast", "clips", "audio", "final", "done"]
      : STAGE_ORDER;
  const idx = order.indexOf(video.stage);
  const next = order[idx + 1];
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
  input: {
    userId: string;
    title?: string;
    initialMessage?: string;
    experience?: Brief["experience"];
  },
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
        brief = {
          ...brief,
          ...(await claudeOpeningBrief(opening, brief)),
          experience: input.experience,
        };
      } catch {
        // Keep the heuristic topic and genre guess.
      }
    }
    await text(ctx, chatId, "user", opening);
  }
  brief.experience = input.experience;
  await store.updateVideo(ctx.db, videoId, { brief });
  ctx.briefs.set(chatId, brief);
  chatBus.publish(chatId, { type: "stage", videoId, stage: "brief" });
  if (nextQuestion(brief)) await askQuestion(ctx, chatId, brief);
  else
    await handleAnswer(
      ctx,
      chatId,
      { field: "__defaults", useDefaults: true },
      "Use the details in my prompt",
    );
  const current = await store.getVideoRow(ctx.db, videoId);
  return { chatId, videoId, stage: current?.stage ?? "brief" };
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
    return text(
      ctx,
      chatId,
      "assistant",
      "Brief already locked — cast stage chalu hai.",
    );
  }

  const brief = ctx.briefs.get(chatId) ?? videoRow.brief;
  const defaultBrief =
    brief.experience === "chat_canvas"
      ? ({
          ...brief,
          targetSeconds: brief.targetSeconds ?? 45,
          aspectRatio: brief.aspectRatio ?? "9:16",
          language:
            brief.language ??
            (/[\u0900-\u097f]/.test(brief.topic ?? "") ? "hi" : "en"),
        } as Brief)
      : brief;
  const freeText =
    Boolean(answer.freeText?.trim()) &&
    !answer.optionId &&
    !(answer.optionIds && answer.optionIds.length > 0) &&
    !answer.skip &&
    !answer.useDefaults;
  let result: { brief: Brief; error?: string };
  if (answer.field === "__defaults" && answer.useDefaults) {
    result = { brief: applyDefaults(defaultBrief) };
  } else if (freeText && claudeIntakeEnabled()) {
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
  await store.updateVideo(ctx.db, meta.videoId, { brief: result.brief });
  const userMsg =
    echo === "Use the details in my prompt"
      ? undefined
      : await text(
          ctx,
          chatId,
          "user",
          echo ||
            answer.optionId ||
            answer.optionIds?.join(", ") ||
            answer.freeText ||
            (answer.skip ? "Skip" : "Use defaults"),
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
    locked.experience === "chat_canvas"
      ? [
          "Your video is set:",
          `Video type: ${{ kids: "Educational explainer", ad: "Product or brand ad", faceless: "Narrated story" }[locked.genre ?? "kids"]}`,
          `Duration: ${locked.targetSeconds} seconds`,
          `Aspect ratio: ${locked.aspectRatio} (${{ "9:16": "vertical", "16:9": "landscape", "1:1": "square" }[locked.aspectRatio ?? "9:16"] ?? "custom"})`,
          `Language: ${{ en: "English", hi: "Hindi", hinglish: "Hinglish" }[locked.language ?? "en"]}`,
          `Visual style: ${getGenre(locked.genre ?? "kids").artStylePresets.find((style) => style.id === locked.artStyle)?.label ?? locked.artStyle ?? "Illustrated"}`,
          `Resolution: ${locked.resolution}`,
          `Audience: ${locked.audience}`,
          `Characters: ${
            getPresetCast()
              .filter((member) => locked.castIds?.includes(member.id))
              .map((member) => member.name)
              .join(", ") || "Narrator"
          }`,
        ].join("\n")
      : `Brief lock · ${locked.genre} · ${locked.language} · ${locked.targetSeconds}s · cast ${(locked.castIds ?? []).join(", ")}`,
  );
  // CAS brief→cast so a duplicated final answer cannot spawn cast twice.
  await enterStageFrom(
    ctx,
    chatId,
    meta.videoId,
    "brief",
    locked.experience === "chat_canvas" ? "script" : "cast",
  );
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
  if (
    video.brief.experience === "chat_canvas" &&
    !stageKinds(video.stage, video.brief.experience).includes(artefact.kind)
  )
    throw new Error(
      "This review is already complete. Refresh to see the current step.",
    );
  const updated = await store.updateArtefact(ctx.db, artefact.id, {
    state: "approved",
  });
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
  if (
    video.brief.experience === "chat_canvas" &&
    (artefact.state === "approved" ||
      !stageKinds(video.stage, video.brief.experience).includes(artefact.kind))
  )
    throw new Error(
      "This review is already complete. Refresh to see the current step.",
    );
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
  await text(
    ctx,
    video.chatId,
    "assistant",
    `Note: ${input.rejectNote}. Regenerate dabao.`,
  );
  return updated;
}

export async function regenerateArtefact(
  ctx: OrchestratorContext,
  input: {
    artefactId: string;
    userId: string;
    confirm: boolean;
    feedback?: string;
  },
): Promise<RegeneratePreviewResponse | RegenerateConfirmResponse> {
  const artefact = await store.getArtefact(ctx.db, input.artefactId);
  if (!artefact) throw new Error("artefact not found");
  const video = (await store.getVideoRow(ctx.db, artefact.videoId))!;
  assertVideoOwner(video, input.userId);
  const user = await store.getUser(ctx.db, input.userId);
  if (!user) throw new Error("user not found");
  const cost = artefact.creditCost;
  if (
    video.brief.experience === "chat_canvas" &&
    !stageKinds(video.stage, video.brief.experience).includes(artefact.kind)
  )
    throw new Error(
      "This review is already complete. Refresh to see the current step.",
    );
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
  const feedback =
    input.feedback?.trim().slice(0, 2000) ??
    (typeof artefact.payload.rejectionNote === "string"
      ? artefact.payload.rejectionNote
      : undefined);
  if (
    typeof artefact.payload.failedStage === "string" &&
    artefact.kind !== "script"
  ) {
    const stage = artefact.payload.failedStage as Stage;
    await runStageWork(ctx, video.chatId, video.id, stage);
    const failures = (await store.listArtefacts(ctx.db, video.id)).filter(
      (a) =>
        a.id !== artefact.id &&
        a.payload.failedStage === stage &&
        a.state === "failed",
    );
    const updated = await store.updateArtefact(ctx.db, artefact.id, {
      state: "approved",
      payload: {
        ...artefact.payload,
        generationFailed: false,
        superseded: true,
      },
    });
    await patchApprovalCard(ctx, video.chatId, updated);
    await publishArtefact(video.chatId, updated);
    if (failures.length)
      throw new Error(
        String(
          failures[failures.length - 1]!.payload.error ||
            "Visual preparation could not finish",
        ),
      );
    return {
      artefactId: updated.id,
      state: updated.state,
      charged: 0,
      balance: user.creditBalance,
      artefact: updated,
    };
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
      feedback,
      version: nextVersion,
      generationFailed: false,
      error: undefined,
    },
  });
  await store.recordApproval(ctx.db, {
    artefactId: artefact.id,
    userId: input.userId,
    action: "regenerate",
    note: feedback,
    creditCharged: cost,
  });
  await store.logEvent(ctx.db, {
    userId: input.userId,
    videoId: artefact.videoId,
    kind: "regenerate",
    payload: { artefactId: artefact.id, charged: cost },
  });
  await publishArtefact(video.chatId, updated);
  await progress(
    ctx,
    video.chatId,
    video.stage,
    `Dobara bana rahe hain · ${cost} credits.`,
    "Regen",
  );

  try {
    let generatedPayload: Record<string, unknown> = {};
    if (artefact.kind === "script") {
      const cast = await attachCast(ctx, video.id, video.brief.castIds ?? []);
      const output = await createScriptGen(
        creativeGenEnv(ScriptGenOutputSchema, SCRIPT_JSON_HINT),
      ).generate({
        videoId: video.id,
        brief: video.brief,
        cast,
        genre: video.genre,
        language: video.language,
        targetSeconds: video.targetSeconds,
        feedback,
      });
      const scenes = await store.replaceScenes(ctx.db, video.id, output.scenes);
      const agentReview = await reviewScriptSafely(ctx, {
        genre: video.genre,
        brief: video.brief,
        scriptText: scriptTextOf(output),
      });
      const history = Array.isArray(artefact.payload.previousVersions)
        ? artefact.payload.previousVersions
        : [];
      generatedPayload = {
        scenes: output.scenes,
        sceneIds: scenes.map((scene) => scene.id),
        agentReview,
        ...scriptProvider(),
        previousVersions: [
          ...history,
          { version: artefact.version, scenes: artefact.payload.scenes },
        ],
      };
    }
    if (artefact.kind === "image") {
      const prompt = (await store.listArtefacts(ctx.db, video.id)).find(
        (a) => a.id === artefact.payload.promptId,
      );
      const scene = (await store.listScenes(ctx.db, video.id)).find(
        (s) => s.id === artefact.sceneId,
      );
      if (!prompt || !scene)
        throw new Error(
          "Scene direction unavailable. Please restart visual generation.",
        );
      const cast = await attachCast(ctx, video.id, video.brief.castIds ?? []);
      const direction = await createPromptGen(
        creativeGenEnv(PromptGenOutputSchema, PROMPT_JSON_HINT),
      ).generate({
        videoId: video.id,
        scene,
        brief: video.brief,
        cast: cast.filter((member) => scene.castIds.includes(member.id)),
        artStyle: video.artStyle,
        feedback,
      });
      const generated = await createMediaPorts(imageMediaEnv(ctx)).images.generate({
        prompt: ctx.mock
          ? direction.imagePrompt.replace(/<<<[^>]+>>>/g, " ").trim()
          : direction.imagePrompt,
        elementIds: ctx.mock ? [] : direction.elementIds,
        aspectRatio: video.aspectRatio,
        resolution: video.resolution,
      });
      await store.updateArtefact(ctx.db, prompt.id, {
        payload: { ...prompt.payload, ...direction },
      });
      generatedPayload = {
        url: generated.url,
        provider: generated.provider,
        model: generated.model,
        needsRegeneration: false,
      };
    }
    if (["identity", "sheet", "anchor"].includes(artefact.kind) && feedback) {
      generatedPayload = { directionNote: feedback };
      if (!ctx.mock) {
        const cast = await attachCast(ctx, video.id, video.brief.castIds ?? []);
        const member = cast.find(
          (member) => member.id === artefact.payload.castId,
        );
        if (!member || member.role === "narrator")
          throw new Error(
            "This character has no visual reference to regenerate.",
          );
        const reference = await characterReference(
          ctx,
          video.id,
          member,
          feedback,
        );
        const scenes = await store.listScenes(ctx.db, video.id);
        for (const related of await store.listArtefacts(ctx.db, video.id)) {
          if (related.id === artefact.id) continue;
          if (
            ["sheet", "anchor"].includes(related.kind) &&
            related.payload.castId === member.id
          ) {
            const changed = await store.updateArtefact(ctx.db, related.id, {
              state: "awaiting_approval",
              version: related.version + 1,
              payload: { ...related.payload, ...reference },
            });
            await patchApprovalCard(ctx, video.chatId, changed);
            await publishArtefact(video.chatId, changed);
          }
          if (
            related.kind === "image" &&
            scenes
              .find((scene) => scene.id === related.sceneId)
              ?.castIds.includes(member.id)
          ) {
            const changed = await store.updateArtefact(ctx.db, related.id, {
              state: "rejected",
              payload: { ...related.payload, needsRegeneration: true },
            });
            await patchApprovalCard(ctx, video.chatId, changed);
            await publishArtefact(video.chatId, changed);
          }
        }
        generatedPayload = { ...generatedPayload, ...reference };
        await text(
          ctx,
          video.chatId,
          "assistant",
          "The character reference has changed. Regenerate the affected scenes before approving the visuals.",
        );
      }
    }
    updated = await store.updateArtefact(ctx.db, artefact.id, {
      state: "awaiting_approval",
      payload: {
        ...updated.payload,
        regenerated: true,
        failedStage: undefined,
        url:
          typeof artefact.payload.url === "string"
            ? artefact.payload.url
            : ctx.mock
              ? mockAssets.keyframe
              : undefined,
        ...generatedPayload,
      },
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

const SCENE_TARGET_KIND = {
  image: ["image"],
  clip: ["clip"],
  voice: ["voice", "audio"],
} as const;

/** Rebuild one scene's still, clip, or voice line. POST /v1/videos/:id/regenerate. */
export async function regenerateScene(
  ctx: OrchestratorContext,
  input: {
    videoId: string;
    userId: string;
    sceneId: string;
    target: "image" | "clip" | "voice";
    feedback?: string;
  },
): Promise<ArtefactSummary> {
  const video = await store.getVideoRow(ctx.db, input.videoId);
  if (!video) throw new Error("video not found");
  assertVideoOwner(video, input.userId);
  const scenes = await store.listScenes(ctx.db, input.videoId);
  const scene = scenes.find((item) => item.id === input.sceneId);
  if (!scene) throw new Error("scene not found");
  const artefacts = await store.listArtefacts(ctx.db, input.videoId);
  const kinds = new Set<string>(SCENE_TARGET_KIND[input.target]);
  const current = [...artefacts].reverse().find((item) => item.sceneId === input.sceneId && kinds.has(item.kind));
  if (!current) throw new Error("scene artefact not found");

  const feedback = input.feedback?.trim();
  const cost = current.creditCost;
  const nextVersion = current.version + 1;
  const balance = await debitRegenerate(ctx.db, {
    userId: input.userId,
    videoId: input.videoId,
    amount: cost,
    ref: `regen:${current.id}:v${nextVersion}`,
  });
  void balance;
  let updated = await store.updateArtefact(ctx.db, current.id, {
    state: "generating",
    version: nextVersion,
    payload: { ...current.payload, feedback, version: nextVersion, error: undefined },
  });
  publishMedia(video.chatId, {
    jobId: current.id,
    artefactId: current.id,
    kind: input.target,
    status: "generating",
    percent: 10,
    sceneId: scene.id,
    provider: "mock",
    model: "",
  });

  try {
    const planned = readScenePlan(artefacts.find((item) => item.kind === "script")?.payload);
    const plan = planned[scene.idx];
    const media = createMediaPorts(input.target === "image" ? imageMediaEnv(ctx) : mediaEnv(ctx));
    const prompt = artefacts.find((item) => item.kind === "prompt" && item.sceneId === scene.id);
    let generatedUrl = "";
    let provider: MediaProviderName = "mock";
    let model = "";
    let providerLabel = "Mock";
    if (input.target === "image") {
      const imagePrompt = `${plan?.imagePrompt || textOf(prompt?.payload.imagePrompt) || textOf(current.payload.prompt)}${feedback ? `\n${feedback}` : ""}`
        .replace(/<<<[^>]+>>>/g, " ")
        .trim();
      const cast = await store.listCastMembers(ctx.db, scene.castIds);
      const generated = await media.images.generate({
        prompt: imagePrompt || "scene",
        elementIds: castAnchorIds(cast.filter((member) => scene.castIds.includes(member.id))),
        aspectRatio: video.aspectRatio,
        resolution: video.resolution,
      });
      generatedUrl = generated.url;
      provider = asMediaProvider(generated.provider);
      model = generated.model ?? "";
      providerLabel = generated.providerLabel ?? providerLabel;
    } else if (input.target === "clip") {
      const image = [...artefacts].reverse().find((item) => item.kind === "image" && item.sceneId === scene.id);
      const motion = `${plan?.motionPrompt || textOf(prompt?.payload.motionPrompt) || textOf(prompt?.payload.videoPrompt) || "gentle motion"}${feedback ? `\n${feedback}` : ""}`
        .replace(/<<<[^>]+>>>/g, " ")
        .trim();
      const generated = await media.clips.generate({
        imageUrl: String(image?.payload.url ?? current.payload.imageUrl ?? mockAssets.keyframe),
        videoPrompt: motion || "gentle motion",
        elementIds: [],
        durationMs: sceneDurationSec(plan?.durationSec ?? prompt?.payload.durationSec, scene.durationMs) * 1000,
        aspectRatio: video.aspectRatio,
      });
      generatedUrl = generated.url;
      provider = asMediaProvider(generated.provider);
      model = generated.model ?? "";
      providerLabel = generated.providerLabel ?? providerLabel;
    } else {
      const cast = await store.listCastMembers(ctx.db, scene.castIds);
      const speaker = cast.find((member) => member.voiceId) ?? cast[0];
      const voiceId = plan?.voiceId || textOf(current.payload.voiceId) || speaker?.voiceId || "deep_storyteller_male";
      const text = feedback || plan?.vo || scene.narration || textOf(current.payload.narration);
      const generated = await media.voice.generate({
        text,
        voiceId,
        language: video.language,
      });
      generatedUrl = generated.url;
      provider = asMediaProvider(generated.provider);
      model = generated.model ?? "";
      providerLabel = generated.providerLabel ?? (provider === "elevenlabs" ? "ElevenLabs" : "Mock");
      updated = await store.updateArtefact(ctx.db, current.id, {
        state: "awaiting_approval",
        payload: {
          ...updated.payload,
          url: generatedUrl,
          provider,
          model,
          providerLabel,
          voiceId,
          narration: text,
          regenerated: true,
        },
      });
      publishMedia(video.chatId, {
        jobId: current.id,
        artefactId: current.id,
        kind: "voice",
        status: "done",
        percent: 100,
        url: generatedUrl,
        sceneId: scene.id,
        provider,
        model,
      });
      await patchApprovalCard(ctx, video.chatId, updated);
      await publishArtefact(video.chatId, updated);
      await reconcatIfPresent(ctx, input.videoId);
      return updated;
    }
    updated = await store.updateArtefact(ctx.db, current.id, {
      state: "awaiting_approval",
      payload: {
        ...updated.payload,
        url: generatedUrl,
        provider,
        model,
        providerLabel,
        regenerated: true,
      },
    });
    publishMedia(video.chatId, {
      jobId: current.id,
      artefactId: current.id,
      kind: input.target,
      status: "done",
      percent: 100,
      url: generatedUrl,
      sceneId: scene.id,
      provider,
      model,
    });
    if (input.target === "image") await rerunDownstreamClip(ctx, video, scene, updated);
    await reconcatIfPresent(ctx, input.videoId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "regen_failed";
    updated = await store.updateArtefact(ctx.db, current.id, {
      state: "failed",
      payload: { ...updated.payload, generationFailed: true, error: message },
    });
    publishMedia(video.chatId, {
      jobId: current.id,
      artefactId: current.id,
      kind: input.target,
      status: "failed",
      error: message,
      sceneId: scene.id,
      provider: "mock",
      model: "",
    });
  }
  await patchApprovalCard(ctx, video.chatId, updated);
  await publishArtefact(video.chatId, updated);
  return updated;
}

export async function approveAllRemaining(
  ctx: OrchestratorContext,
  input: { videoId: string; userId: string },
): Promise<{ videoId: string; stage: Stage; approvedIds: string[] }> {
  const video = await store.getVideoRow(ctx.db, input.videoId);
  if (!video) throw new Error("video not found");
  assertVideoOwner(video, input.userId);
  const kinds = new Set(stageKinds(video.stage, video.brief.experience));
  const approvedIds: string[] = [];
  for (const artefact of await store.listArtefacts(ctx.db, input.videoId)) {
    if (!kinds.has(artefact.kind) || artefact.state !== "awaiting_approval")
      continue;
    const updated = await store.updateArtefact(ctx.db, artefact.id, {
      state: "approved",
    });
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
