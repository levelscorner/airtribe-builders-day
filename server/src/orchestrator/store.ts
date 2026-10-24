import type {
  ArtefactKind,
  ArtefactState,
  ArtefactSummary,
  Brief,
  CastMember,
  ChatMessage,
  Genre,
  Language,
  MediaProviderName,
  Resolution,
  Scene,
  Stage,
  User,
  VideoSummary,
  VoicePreset,
} from "@chotu/shared";
import type { SqlClient } from "../db/client.js";
import { readAgentReview } from "../integrations/agenticorg/parse.js";

export const STARTER_CREDITS = Number(process.env.STARTER_CREDITS || 80);

function asJson(value: unknown): string {
  return JSON.stringify(value ?? {});
}

export async function insertUser(
  db: SqlClient,
  input: { displayName: string; phoneOrEmail?: string },
): Promise<User> {
  const result = await db.query<{
    id: string;
    display_name: string;
    phone_or_email: string | null;
    credit_balance: number;
    created_at: Date | string;
  }>(
    `INSERT INTO users (display_name, phone_or_email, credit_balance)
     VALUES ($1, $2, 0)
     RETURNING id, display_name, phone_or_email, credit_balance, created_at`,
    [input.displayName, input.phoneOrEmail ?? null],
  );
  const row = result.rows[0]!;
  return {
    id: row.id,
    displayName: row.display_name,
    phoneOrEmail: row.phone_or_email ?? undefined,
    creditBalance: row.credit_balance,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function getUser(db: SqlClient, userId: string): Promise<User | null> {
  const result = await db.query<{
    id: string;
    display_name: string;
    phone_or_email: string | null;
    credit_balance: number;
    created_at: Date | string;
  }>("SELECT id, display_name, phone_or_email, credit_balance, created_at FROM users WHERE id = $1", [
    userId,
  ]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    phoneOrEmail: row.phone_or_email ?? undefined,
    creditBalance: row.credit_balance,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function createChatVideo(
  db: SqlClient,
  input: { userId: string; title?: string },
): Promise<{ chatId: string; videoId: string }> {
  const chat = await db.query<{ id: string }>(
    `INSERT INTO chats (user_id, title) VALUES ($1, $2) RETURNING id`,
    [input.userId, input.title ?? null],
  );
  const chatId = chat.rows[0]!.id;
  const video = await db.query<{ id: string }>(
    `INSERT INTO videos (user_id, chat_id, genre, language, stage, status, brief)
     VALUES ($1, $2, 'kids', 'hinglish', 'brief', 'active', '{}'::jsonb)
     RETURNING id`,
    [input.userId, chatId],
  );
  const videoId = video.rows[0]!.id;
  await db.query("UPDATE chats SET video_id = $1 WHERE id = $2", [videoId, chatId]);
  return { chatId, videoId };
}

export async function appendMessage(
  db: SqlClient,
  message: ChatMessage,
): Promise<ChatMessage> {
  await db.query(
    `INSERT INTO messages (id, chat_id, role, kind, body, created_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
    [
      message.id,
      message.chatId,
      message.role,
      message.kind,
      asJson(message),
      message.createdAt,
    ],
  );
  return message;
}

export async function listMessages(db: SqlClient, chatId: string): Promise<ChatMessage[]> {
  const result = await db.query<{ body: ChatMessage }>(
    "SELECT body FROM messages WHERE chat_id = $1 ORDER BY created_at ASC",
    [chatId],
  );
  return result.rows.map((row) => row.body);
}

export async function updateMessageBody(
  db: SqlClient,
  messageId: string,
  body: ChatMessage,
): Promise<void> {
  await db.query("UPDATE messages SET body = $1::jsonb WHERE id = $2", [asJson(body), messageId]);
}

export async function getVideoRow(db: SqlClient, videoId: string): Promise<VideoSummary | null> {
  const result = await db.query<{
    id: string;
    user_id: string;
    chat_id: string;
    genre: Genre;
    language: Language;
    aspect_ratio: string;
    resolution: Resolution;
    target_seconds: number;
    art_style: string | null;
    brief: Brief;
    stage: Stage;
    status: VideoSummary["status"];
    output_url: string | null;
    reserved_credits: number;
    created_at: Date | string;
    updated_at: Date | string;
  }>("SELECT * FROM videos WHERE id = $1", [videoId]);
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    chatId: row.chat_id,
    genre: row.genre,
    language: row.language,
    aspectRatio: row.aspect_ratio,
    resolution: row.resolution,
    targetSeconds: row.target_seconds,
    artStyle: row.art_style ?? undefined,
    brief: row.brief ?? {},
    stage: row.stage,
    status: row.status,
    outputUrl: row.output_url ?? undefined,
    reservedCredits: row.reserved_credits,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export async function getChatMeta(
  db: SqlClient,
  chatId: string,
): Promise<{ chatId: string; videoId: string; userId: string } | null> {
  const result = await db.query<{ id: string; video_id: string | null; user_id: string }>(
    "SELECT id, video_id, user_id FROM chats WHERE id = $1",
    [chatId],
  );
  const row = result.rows[0];
  if (!row?.video_id) return null;
  return { chatId: row.id, videoId: row.video_id, userId: row.user_id };
}

/**
 * CAS stage transition. Returns false if another worker already moved the stage.
 */
export async function tryTransitionStage(
  db: SqlClient,
  videoId: string,
  from: Stage,
  to: Stage,
): Promise<boolean> {
  const status = to === "done" ? "done" : "active";
  const result = await db.query(
    `UPDATE videos SET stage = $2, status = $3, updated_at = now()
     WHERE id = $1 AND stage = $4
     RETURNING id`,
    [videoId, to, status, from],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function updateVideo(
  db: SqlClient,
  videoId: string,
  patch: Partial<{
    genre: Genre;
    language: Language;
    aspectRatio: string;
    resolution: Resolution;
    targetSeconds: number;
    artStyle: string | null;
    brief: Brief;
    stage: Stage;
    status: VideoSummary["status"];
    outputUrl: string | null;
  }>,
): Promise<VideoSummary> {
  const current = await getVideoRow(db, videoId);
  if (!current) throw new Error(`video ${videoId} missing`);
  const next = {
    genre: patch.genre ?? current.genre,
    language: patch.language ?? current.language,
    aspectRatio: patch.aspectRatio ?? current.aspectRatio,
    resolution: patch.resolution ?? current.resolution,
    targetSeconds: patch.targetSeconds ?? current.targetSeconds,
    artStyle: patch.artStyle === undefined ? current.artStyle ?? null : patch.artStyle,
    brief: patch.brief ?? current.brief,
    stage: patch.stage ?? current.stage,
    status: patch.status ?? current.status,
    outputUrl: patch.outputUrl === undefined ? current.outputUrl ?? null : patch.outputUrl,
  };
  await db.query(
    `UPDATE videos SET
       genre = $2, language = $3, aspect_ratio = $4, resolution = $5,
       target_seconds = $6, art_style = $7, brief = $8::jsonb, stage = $9,
       status = $10, output_url = $11, updated_at = now()
     WHERE id = $1`,
    [
      videoId,
      next.genre,
      next.language,
      next.aspectRatio,
      next.resolution,
      next.targetSeconds,
      next.artStyle,
      asJson(next.brief),
      next.stage,
      next.status,
      next.outputUrl,
    ],
  );
  return (await getVideoRow(db, videoId))!;
}

export async function replaceScenes(
  db: SqlClient,
  videoId: string,
  scenes: Array<{
    idx: number;
    title: string;
    narration: string;
    durationMs: number;
    doubts: string[];
    castIds: string[];
  }>,
): Promise<Scene[]> {
  await db.query("DELETE FROM scenes WHERE video_id = $1", [videoId]);
  const out: Scene[] = [];
  for (const scene of scenes) {
    const result = await db.query<{ id: string }>(
      `INSERT INTO scenes (video_id, idx, title, narration, duration_ms, doubts)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb) RETURNING id`,
      [videoId, scene.idx, scene.title, scene.narration, scene.durationMs, asJson(scene.doubts)],
    );
    const id = result.rows[0]!.id;
    for (const castId of scene.castIds) {
      await db.query(
        `INSERT INTO scene_cast (scene_id, cast_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [id, castId],
      );
    }
    out.push({
      id,
      videoId,
      idx: scene.idx,
      title: scene.title,
      narration: scene.narration,
      durationMs: scene.durationMs,
      doubts: scene.doubts,
      castIds: scene.castIds,
    });
  }
  return out;
}

export async function listScenes(db: SqlClient, videoId: string): Promise<Scene[]> {
  const result = await db.query<{
    id: string;
    video_id: string;
    idx: number;
    title: string | null;
    narration: string | null;
    duration_ms: number | null;
    doubts: string[];
  }>("SELECT * FROM scenes WHERE video_id = $1 ORDER BY idx ASC", [videoId]);
  const scenes: Scene[] = [];
  for (const row of result.rows) {
    const cast = await db.query<{ cast_id: string }>(
      "SELECT cast_id FROM scene_cast WHERE scene_id = $1",
      [row.id],
    );
    scenes.push({
      id: row.id,
      videoId: row.video_id,
      idx: row.idx,
      title: row.title ?? undefined,
      narration: row.narration ?? undefined,
      durationMs: row.duration_ms ?? undefined,
      doubts: row.doubts ?? [],
      castIds: cast.rows.map((item) => item.cast_id),
    });
  }
  return scenes;
}

export async function insertArtefact(
  db: SqlClient,
  input: {
    videoId: string;
    sceneId?: string;
    kind: ArtefactKind;
    state: ArtefactState;
    payload: Record<string, unknown>;
    creditCost: number;
    version?: number;
  },
): Promise<ArtefactSummary> {
  const result = await db.query<{
    id: string;
    video_id: string;
    scene_id: string | null;
    kind: ArtefactKind;
    state: ArtefactState;
    payload: Record<string, unknown>;
    credit_cost: number;
    version: number;
    updated_at: Date | string;
  }>(
    `INSERT INTO artefacts (video_id, scene_id, kind, state, payload, credit_cost, version)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     RETURNING *`,
    [
      input.videoId,
      input.sceneId ?? null,
      input.kind,
      input.state,
      asJson(input.payload),
      input.creditCost,
      input.version ?? 1,
    ],
  );
  return mapArtefact(result.rows[0]!);
}

export async function getArtefact(db: SqlClient, artefactId: string): Promise<ArtefactSummary | null> {
  const result = await db.query(
    "SELECT * FROM artefacts WHERE id = $1",
    [artefactId],
  );
  const row = result.rows[0] as
    | {
        id: string;
        video_id: string;
        scene_id: string | null;
        kind: ArtefactKind;
        state: ArtefactState;
        payload: Record<string, unknown>;
        credit_cost: number;
        version: number;
        updated_at: Date | string;
      }
    | undefined;
  return row ? mapArtefact(row) : null;
}

export async function updateArtefact(
  db: SqlClient,
  artefactId: string,
  patch: Partial<{ state: ArtefactState; payload: Record<string, unknown>; version: number; creditCost: number }>,
): Promise<ArtefactSummary> {
  const current = await getArtefact(db, artefactId);
  if (!current) throw new Error(`artefact ${artefactId} missing`);
  const state = patch.state ?? current.state;
  const payload = patch.payload ?? current.payload;
  const version = patch.version ?? current.version;
  const creditCost = patch.creditCost ?? current.creditCost;
  const result = await db.query(
    `UPDATE artefacts SET state = $2, payload = $3::jsonb, version = $4, credit_cost = $5, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [artefactId, state, asJson(payload), version, creditCost],
  );
  return mapArtefact(result.rows[0] as never);
}

export async function listArtefacts(db: SqlClient, videoId: string): Promise<ArtefactSummary[]> {
  const result = await db.query("SELECT * FROM artefacts WHERE video_id = $1 ORDER BY created_at ASC", [
    videoId,
  ]);
  return result.rows.map((row) => mapArtefact(row as never));
}

function mapArtefact(row: {
  id: string;
  video_id: string;
  scene_id: string | null;
  kind: ArtefactKind;
  state: ArtefactState;
  payload: Record<string, unknown>;
  credit_cost: number;
  version: number;
  updated_at: Date | string;
}): ArtefactSummary {
  const payload = row.payload ?? {};
  const artefact: ArtefactSummary = {
    id: row.id,
    videoId: row.video_id,
    sceneId: row.scene_id ?? undefined,
    kind: row.kind,
    state: row.state,
    payload,
    creditCost: row.credit_cost,
    version: row.version,
    updatedAt: new Date(row.updated_at).toISOString(),
    ...readMediaFields(payload),
    ...readOutputFields(payload),
  };
  if (artefact.kind !== "script") return artefact;
  const agentReview = readAgentReview(payload.agentReview);
  return agentReview ? { ...artefact, agentReview } : artefact;
}

function readOutputFields(payload: Record<string, unknown>): Pick<ArtefactSummary, "url" | "downloadUrl"> {
  const url = typeof payload.url === "string" && payload.url ? payload.url : undefined;
  const downloadUrl = typeof payload.downloadUrl === "string" && payload.downloadUrl ? payload.downloadUrl : undefined;
  return {
    ...(url ? { url } : {}),
    ...(downloadUrl ? { downloadUrl } : {}),
  };
}

const MEDIA_PROVIDERS = new Set<MediaProviderName>(["openai", "ark", "higgsfield", "elevenlabs", "mock"]);

function readMediaFields(payload: Record<string, unknown>): Pick<ArtefactSummary, "provider" | "model" | "providerLabel"> {
  const provider = typeof payload.provider === "string" && MEDIA_PROVIDERS.has(payload.provider as MediaProviderName)
    ? (payload.provider as MediaProviderName)
    : undefined;
  const model = typeof payload.model === "string" ? payload.model : undefined;
  const providerLabel = typeof payload.providerLabel === "string" ? payload.providerLabel : undefined;
  return {
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    ...(providerLabel ? { providerLabel } : {}),
  };
}

export async function recordApproval(
  db: SqlClient,
  input: {
    artefactId: string;
    userId: string;
    action: "approve" | "reject" | "regenerate" | "approve_all_remaining";
    note?: string;
    creditCharged?: number;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO approvals (artefact_id, user_id, action, note, credit_charged)
     VALUES ($1, $2, $3, $4, $5)`,
    [input.artefactId, input.userId, input.action, input.note ?? null, input.creditCharged ?? 0],
  );
}

export async function logEvent(
  db: SqlClient,
  input: {
    userId?: string;
    videoId?: string;
    kind: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await db.query(
    `INSERT INTO events (user_id, video_id, kind, payload) VALUES ($1, $2, $3, $4::jsonb)`,
    [input.userId ?? null, input.videoId ?? null, input.kind, asJson(input.payload ?? {})],
  );
}

export async function setVideoCast(
  db: SqlClient,
  videoId: string,
  castIds: string[],
): Promise<void> {
  await db.query("DELETE FROM video_cast WHERE video_id = $1", [videoId]);
  for (const castId of castIds) {
    const version = await db.query<{ version: number }>(
      "SELECT version FROM cast_members WHERE id = $1",
      [castId],
    );
    await db.query(
      `INSERT INTO video_cast (video_id, cast_id, cast_version) VALUES ($1, $2, $3)`,
      [videoId, castId, version.rows[0]?.version ?? 1],
    );
  }
}

export async function listCastMembers(db: SqlClient, ids?: string[]): Promise<CastMember[]> {
  const result = ids?.length
    ? await db.query("SELECT * FROM cast_members WHERE id = ANY($1::text[])", [ids])
    : await db.query("SELECT * FROM cast_members WHERE is_preset = true OR owner_user_id IS NOT NULL ORDER BY name");
  return result.rows.map((row) => mapCast(row as never));
}

export async function listVoices(db: SqlClient): Promise<VoicePreset[]> {
  const result = await db.query("SELECT * FROM voices ORDER BY id");
  return result.rows.map((row) => {
    const r = row as {
      id: string;
      elevenlabs_voice_id: string;
      label: string;
      language_hint: string;
      stability: number;
      style: number;
      default_cast_name: string | null;
      is_preset: boolean;
    };
    return {
      id: r.id,
      elevenlabsVoiceId: r.elevenlabs_voice_id,
      label: r.label,
      languageHint: r.language_hint,
      stability: r.stability,
      style: r.style,
      defaultCastName: r.default_cast_name ?? undefined,
      isPreset: true as const,
    };
  });
}

function mapCast(row: {
  id: string;
  owner_user_id: string | null;
  name: string;
  role: CastMember["role"];
  identity_text: string;
  dna_chips: string[];
  art_style: string | null;
  sheet_url: string | null;
  anchor_url: string | null;
  higgsfield_element_id: string | null;
  voice_id: string | null;
  version: number;
  status: CastMember["status"];
  is_preset: boolean;
}): CastMember {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id ?? undefined,
    name: row.name,
    role: row.role,
    identityText: row.identity_text,
    dnaChips: row.dna_chips ?? [],
    artStyle: row.art_style ?? undefined,
    sheetUrl: row.sheet_url ?? undefined,
    anchorUrl: row.anchor_url ?? undefined,
    higgsfieldElementId: row.higgsfield_element_id ?? undefined,
    voiceId: row.voice_id ?? undefined,
    version: row.version,
    status: row.status,
    isPreset: row.is_preset,
  };
}

