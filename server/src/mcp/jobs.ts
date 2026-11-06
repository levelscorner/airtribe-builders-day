import type { Genre, Language } from "@chotu/shared";
import { GENRE_ORDER, getGenres } from "../creative/genres/load.js";
import { grantSignupCredits } from "../credits/stub.js";
import { requireMcpKey } from "./auth.js";
import type { SqlClient } from "../db/client.js";
import { createOrchestratorContext, handleAnswer, startChat } from "../orchestrator/machine.js";
import * as store from "../orchestrator/store.js";

export function listGenres(): Array<{
  id: Genre;
  label: string;
  who: string;
  tone: string;
  defaultLanguage: string;
  defaultTargetSeconds: number;
  defaultAspectRatio: string;
}> {
  const genres = getGenres();
  return GENRE_ORDER.map((id) => {
    const genre = genres[id];
    return {
      id: genre.id,
      label: genre.label,
      who: genre.who,
      tone: genre.tone,
      defaultLanguage: genre.defaultLanguage,
      defaultTargetSeconds: genre.defaultTargetSeconds,
      defaultAspectRatio: genre.defaultAspectRatio,
    };
  });
}

async function answerWhileBrief(
  ctx: ReturnType<typeof createOrchestratorContext>,
  chatId: string,
  videoId: string,
  answer: { field: string; optionId?: string; useDefaults?: boolean },
): Promise<void> {
  const video = await store.getVideoRow(ctx.db, videoId);
  if (!video || video.stage !== "brief") return;
  await handleAnswer(ctx, chatId, answer);
}

/** Start a chat through the orchestrator and return the video id as the job id. */
export async function createVideoBrief(
  deps: { db: SqlClient; mock: boolean },
  input: { idea: string; genre: Genre; language: Language },
): Promise<{ id: string; chatId: string; stage: string }> {
  requireMcpKey();
  const idea = input.idea.trim();
  if (!idea) throw new Error("idea is required");
  const ctx = createOrchestratorContext(deps.db, deps.mock);
  ctx.detachStageWork = true;
  const user = await store.insertUser(deps.db, { displayName: "AgenticOrg" });
  await grantSignupCredits(deps.db, {
    userId: user.id,
    amount: store.STARTER_CREDITS,
    ref: `signup:${user.id}`,
  });
  const opened = await startChat(ctx, {
    userId: user.id,
    title: idea.slice(0, 80),
    initialMessage: idea,
  });
  await answerWhileBrief(ctx, opened.chatId, opened.videoId, { field: "genre", optionId: input.genre });
  await answerWhileBrief(ctx, opened.chatId, opened.videoId, { field: "language", optionId: input.language });
  await answerWhileBrief(ctx, opened.chatId, opened.videoId, { field: "__defaults", useDefaults: true });
  const video = await store.getVideoRow(deps.db, opened.videoId);
  return { id: opened.videoId, chatId: opened.chatId, stage: video?.stage ?? opened.stage };
}

export async function getJobStatus(
  db: SqlClient,
  jobId: string,
): Promise<{
  id: string;
  chatId: string;
  stage: string;
  status: string;
  outputUrl?: string;
  artefacts: Array<{ id: string; kind: string; state: string; url?: string; downloadUrl?: string }>;
} | null> {
  const id = jobId.trim();
  let video = await store.getVideoRow(db, id);
  if (!video) {
    const meta = await store.getChatMeta(db, id);
    if (meta) video = await store.getVideoRow(db, meta.videoId);
  }
  if (!video) return null;
  const artefacts = await store.listArtefacts(db, video.id);
  return {
    id: video.id,
    chatId: video.chatId,
    stage: video.stage,
    status: video.status,
    outputUrl: video.outputUrl,
    artefacts: artefacts.map((item) => ({
      id: item.id,
      kind: item.kind,
      state: item.state,
      url: item.url,
      downloadUrl: item.downloadUrl,
    })),
  };
}
