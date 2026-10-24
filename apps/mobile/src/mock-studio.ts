import type {
  ApprovalCardMessage,
  ArtefactKind,
  ArtefactState,
  ArtefactSummary,
  Brief,
  ChatMessage,
  Genre,
  Language,
  QuestionMessage,
  Resolution,
  Scene,
  SseEvent,
  Stage,
  TextMessage,
  User,
  VideoSummary,
} from "@chotu/shared";
import type { StudioClient } from "./studio-client";
import {
  CAST,
  CAST_BUNDLES,
  INTAKE,
  PACKS,
  REGEN_COST,
  STARTER_CREDITS,
  VOICES,
  buildScenes,
  castById,
  defaultsFor,
  styleLabel,
  styleTraits,
  voiceLabel,
  type IntakeQuestion,
} from "./mock-fixtures";

export class StudioMockError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "StudioMockError";
    this.code = code;
  }
}

const STAGE_KINDS: Partial<Record<Stage, readonly ArtefactKind[]>> = {
  cast: ["identity", "sheet", "anchor", "voice_sample"],
  script: ["script"],
  prompts: ["prompt"],
  images: ["image"],
  clips: ["clip"],
  audio: ["audio"],
  final: ["final"],
};

const NEXT_STAGE: Partial<Record<Stage, Stage>> = {
  brief: "cast",
  cast: "script",
  script: "prompts",
  prompts: "images",
  images: "clips",
  clips: "audio",
  audio: "final",
  final: "done",
};

interface VideoBundle {
  video: VideoSummary;
  scenes: Scene[];
  artefacts: ArtefactSummary[];
}

interface ChatRuntime {
  id: string;
  videoId: string;
  messages: ChatMessage[];
  listeners: Set<(event: SseEvent) => void>;
  answers: Record<string, string>;
  assumed: string[];
  qIndex: number;
  topic: string;
  phase: "brief" | "producing" | "done";
  advanceTimer: ReturnType<typeof setTimeout> | null;
  advancing: boolean;
  approvalMessageIds: Map<string, string>;
}

type Listener = (event: SseEvent) => void;

function stageKinds(stage: Stage): readonly ArtefactKind[] {
  return STAGE_KINDS[stage] ?? [];
}

export function createMockStudio(options?: {
  delayMs?: number;
  starterCredits?: number;
}): StudioClient {
  const delayMs = options?.delayMs ?? 650;
  const starterCredits = options?.starterCredits ?? STARTER_CREDITS;

  let user: User | null = null;
  let clock = Date.now();
  let seq = 0;
  const chats = new Map<string, ChatRuntime>();
  const videos = new Map<string, VideoBundle>();

  function now(): string {
    clock = Math.max(Date.now(), clock + 1);
    return new Date(clock).toISOString();
  }

  function nid(prefix: string): string {
    seq += 1;
    return `${prefix}_${String(seq).padStart(4, "0")}`;
  }

  function wait(): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  function mustUser(): User {
    if (!user) throw new StudioMockError("no_user", "Pehle naam aur email se shuru karo.");
    return user;
  }

  function mustChat(chatId: string): ChatRuntime {
    const chat = chats.get(chatId);
    if (!chat) throw new StudioMockError("no_chat", "Yeh chat nahi mili.");
    return chat;
  }

  function mustVideo(videoId: string): VideoBundle {
    const bundle = videos.get(videoId);
    if (!bundle) throw new StudioMockError("no_video", "Yeh video nahi mili.");
    return bundle;
  }

  function mustArtefact(artefactId: string): { bundle: VideoBundle; artefact: ArtefactSummary; chat: ChatRuntime } {
    for (const bundle of videos.values()) {
      const artefact = bundle.artefacts.find((item) => item.id === artefactId);
      if (!artefact) continue;
      const chat = mustChat(bundle.video.chatId);
      return { bundle, artefact, chat };
    }
    throw new StudioMockError("no_artefact", "Yeh card nahi mila.");
  }

  function emit(chat: ChatRuntime, event: Parameters<Listener>[0]): void {
    if (event.type === "message") {
      const index = chat.messages.findIndex((item) => item.id === event.message.id);
      if (index === -1) chat.messages.push(event.message);
      else chat.messages[index] = event.message;
    }
    for (const listener of chat.listeners) listener(event);
  }

  function emitText(chat: ChatRuntime, role: "user" | "assistant", text: string): TextMessage {
    const message: TextMessage = {
      id: nid("msg"),
      chatId: chat.id,
      role,
      kind: "text",
      text,
      createdAt: now(),
    };
    emit(chat, { type: "message", message });
    return message;
  }

  function emitQuestion(chat: ChatRuntime, question: IntakeQuestion): void {
    const message: QuestionMessage = {
      id: nid("msg"),
      chatId: chat.id,
      role: "assistant",
      kind: "question",
      field: question.field,
      prompt: question.prompt,
      options: question.options,
      allowFreeText: question.allowFreeText,
      allowSkip: question.allowSkip,
      allowDefaults: question.allowDefaults,
      createdAt: now(),
    };
    emit(chat, { type: "message", message });
  }

  function emitError(chat: ChatRuntime, error: unknown): void {
    const message = error instanceof Error ? error.message : "Kuch gadbad ho gayi.";
    const code = error instanceof StudioMockError ? error.code : "error";
    emit(chat, { type: "error", code, message });
  }

  function patchApproval(chat: ChatRuntime, artefact: ArtefactSummary): void {
    const messageId = chat.approvalMessageIds.get(artefact.id);
    const current = chat.messages.find((item) => item.id === messageId);
    if (!current || current.kind !== "approval") return;
    const legal: ApprovalCardMessage["state"] | null =
      artefact.state === "awaiting_approval" || artefact.state === "approved" || artefact.state === "rejected"
        ? artefact.state
        : null;
    const next: ApprovalCardMessage = {
      ...current,
      preview: { ...artefact.payload },
      regenerateCreditCost: artefact.creditCost,
      state: legal ?? current.state,
    };
    emit(chat, { type: "message", message: next });
  }

  function publishArtefact(chat: ChatRuntime, artefact: ArtefactSummary, title: string): void {
    const message: ApprovalCardMessage = {
      id: nid("msg"),
      chatId: chat.id,
      role: "assistant",
      kind: "approval",
      artefactId: artefact.id,
      artefactKind: artefact.kind,
      stage: mustVideo(artefact.videoId).video.stage,
      sceneId: artefact.sceneId,
      title,
      preview: { ...artefact.payload },
      regenerateCreditCost: artefact.creditCost,
      state: "awaiting_approval",
      createdAt: now(),
    };
    chat.approvalMessageIds.set(artefact.id, message.id);
    emit(chat, { type: "message", message });
    emit(chat, { type: "artefact", artefact: { ...artefact } });
  }

  function addArtefact(
    bundle: VideoBundle,
    input: {
      kind: ArtefactKind;
      sceneId?: string;
      payload: Record<string, unknown>;
      state?: ArtefactState;
    },
  ): ArtefactSummary {
    const artefact: ArtefactSummary = {
      id: nid("art"),
      videoId: bundle.video.id,
      sceneId: input.sceneId,
      kind: input.kind,
      state: input.state ?? "awaiting_approval",
      payload: { ...input.payload, version: 1 },
      creditCost: REGEN_COST[input.kind],
      version: 1,
      updatedAt: now(),
    };
    bundle.artefacts.push(artefact);
    return artefact;
  }

  function currentArtefacts(bundle: VideoBundle): ArtefactSummary[] {
    const kinds = new Set(stageKinds(bundle.video.stage));
    return bundle.artefacts.filter((item) => kinds.has(item.kind));
  }

  function stageSettled(bundle: VideoBundle): boolean {
    const items = currentArtefacts(bundle);
    return items.length > 0 && items.every((item) => item.state === "approved");
  }

  function scheduleAdvance(chat: ChatRuntime): void {
    if (chat.advanceTimer || chat.advancing || chat.phase === "done") return;
    chat.advanceTimer = setTimeout(() => {
      chat.advanceTimer = null;
      chat.advancing = true;
      void maybeAdvance(chat)
        .catch((error: unknown) => emitError(chat, error))
        .finally(() => {
          chat.advancing = false;
        });
    }, delayMs);
  }

  async function maybeAdvance(chat: ChatRuntime): Promise<void> {
    const bundle = mustVideo(chat.videoId);
    if (!stageSettled(bundle)) return;
    const next = NEXT_STAGE[bundle.video.stage];
    if (!next || next === bundle.video.stage) return;
    if (next === "done") {
      await complete(chat, bundle);
      return;
    }
    await beginStage(chat, bundle, next);
  }

  async function complete(chat: ChatRuntime, bundle: VideoBundle): Promise<void> {
    bundle.video.stage = "done";
    bundle.video.status = "done";
    bundle.video.outputUrl = `mock://videos/${bundle.video.id}.mp4`;
    bundle.video.updatedAt = now();
    chat.phase = "done";
    const durationMs = bundle.scenes.reduce((sum, scene) => sum + (scene.durationMs ?? 0), 0);
    emit(chat, { type: "stage", videoId: bundle.video.id, stage: "done" });
    emit(chat, {
      type: "message",
      message: {
        id: nid("msg"),
        chatId: chat.id,
        role: "assistant",
        kind: "progress",
        stage: "done",
        agent: "Edit",
        text: "Final cut lock ho gaya.",
        createdAt: now(),
      },
    });
    emitText(chat, "assistant", "Ho gaya. Player neeche hai. Yeh mock preview hai — file download server se aayegi.");
    emit(chat, {
      type: "message",
      message: {
        id: nid("msg"),
        chatId: chat.id,
        role: "assistant",
        kind: "video",
        videoId: bundle.video.id,
        url: bundle.video.outputUrl,
        durationMs,
        createdAt: now(),
      },
    });
  }

  async function beginStage(chat: ChatRuntime, bundle: VideoBundle, stage: Stage): Promise<void> {
    bundle.video.stage = stage;
    bundle.video.updatedAt = now();
    chat.phase = "producing";
    emit(chat, { type: "stage", videoId: bundle.video.id, stage });
    emit(chat, {
      type: "message",
      message: {
        id: nid("msg"),
        chatId: chat.id,
        role: "assistant",
        kind: "progress",
        stage,
        agent: agentFor(stage),
        text: progressLine(stage),
        percent: 40,
        createdAt: now(),
      },
    });
    await wait();
    const cards = cardsForStage(bundle, stage);
    for (const card of cards) {
      const artefact = addArtefact(bundle, card);
      publishArtefact(chat, artefact, card.title);
    }
    emitText(chat, "assistant", "Dekho. Theek lage to Approve, note ke saath Reject, ya Regenerate.");
  }

  function cardsForStage(
    bundle: VideoBundle,
    stage: Stage,
  ): Array<{ kind: ArtefactKind; sceneId?: string; title: string; payload: Record<string, unknown> }> {
    const brief = bundle.video.brief;
    const members = (brief.castIds ?? []).map((id) => castById(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const onScreen = members.filter((member) => member.role !== "narrator");
    if (stage === "cast") {
      const cards: Array<{ kind: ArtefactKind; title: string; payload: Record<string, unknown> }> = [
        {
          kind: "identity",
          title: "Cast identity",
          payload: {
            members: members.map((member) => ({
              name: member.name,
              role: member.role,
              identityText: member.identityText,
              dnaChips: member.dnaChips,
              voiceLabel: voiceLabel(member.voiceId),
            })),
          },
        },
      ];
      if (onScreen.length > 0) {
        cards.push(
          {
            kind: "sheet",
            title: "Character sheet",
            payload: {
              names: onScreen.map((member) => member.name),
              views: ["Front", "Three-quarter", "Profile", "Back", "Face close-up"],
              swatch: "marigold",
            },
          },
          {
            kind: "anchor",
            title: "Face anchor",
            payload: {
              names: onScreen.map((member) => member.name),
              note: "Ek saaf front portrait. Neutral background, even light, haath mein kuch nahi.",
              swatch: "indigo",
            },
          },
        );
      }
      cards.push({
        kind: "voice_sample",
        title: "Voice sample",
        payload: {
          samples: members.map((member) => ({
            name: member.name,
            voiceLabel: voiceLabel(member.voiceId),
            line: sampleLine(bundle.video.language, member.name),
            durationMs: 2400,
          })),
        },
      });
      return cards;
    }
    if (stage === "script") {
      const draft = buildScenes({
        genre: bundle.video.genre,
        language: bundle.video.language,
        topic: chatTopic(bundle),
        targetSeconds: bundle.video.targetSeconds,
        castIds: brief.castIds ?? [],
      });
      bundle.scenes = draft.scenes.map((scene) => ({
        id: nid("scn"),
        videoId: bundle.video.id,
        idx: scene.idx,
        title: scene.title,
        narration: scene.narration,
        durationMs: scene.durationMs,
        doubts: scene.doubts,
        castIds: scene.castIds,
      }));
      return [
        {
          kind: "script",
          title: `Script · ${draft.title}`,
          payload: {
            title: draft.title,
            scenes: bundle.scenes.map((scene) => ({
              idx: scene.idx,
              title: scene.title ?? "",
              narration: scene.narration ?? "",
              doubts: scene.doubts,
            })),
          },
        },
      ];
    }
    if (stage === "final") {
      const durationMs = bundle.scenes.reduce((sum, scene) => sum + (scene.durationMs ?? 0), 0);
      return [
        {
          kind: "final",
          title: "Final cut",
          payload: {
            title: chatTopic(bundle),
            durationMs,
            caption: "Captions scene narration se aati hain. Yeh mock frame hai.",
            swatch: "clay",
          },
        },
      ];
    }
    if (stage === "prompts" || stage === "images" || stage === "clips" || stage === "audio") {
      return bundle.scenes.map((scene) => sceneCard(bundle, stage, scene));
    }
    return [];
  }

  function sceneCard(
    bundle: VideoBundle,
    stage: Stage,
    scene: Scene,
  ): { kind: ArtefactKind; sceneId: string; title: string; payload: Record<string, unknown> } {
    const swatches = ["marigold", "indigo", "sage", "clay"] as const;
    const swatch = swatches[(scene.idx - 1) % swatches.length] ?? "marigold";
    const title = scene.title ?? `Scene ${scene.idx}`;
    const narration = scene.narration ?? "";
    const members = scene.castIds.map((id) => castById(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
    const tokens = members
      .map((member) => member.higgsfieldElementId)
      .filter((id): id is string => Boolean(id))
      .map((id) => `<<<${id}>>>`);
    const traits =
      bundle.video.brief.artStyleTraits && bundle.video.brief.artStyleTraits.length > 0
        ? bundle.video.brief.artStyleTraits
        : styleTraits(bundle.video.brief.artStyle ?? "bright_2d");
    if (stage === "prompts") {
      return {
        kind: "prompt",
        sceneId: scene.id,
        title: `Prompt · Scene ${scene.idx}`,
        payload: {
          idx: scene.idx,
          sceneTitle: title,
          imagePrompt: `${traits.join(", ")}. ${narration} ${tokens.join(" ")} Neutral light, no logos, no readable text.`.trim(),
          videoPrompt: `Slow push-in, same clothes, same face. ${narration} No camera brand names.`,
        },
      };
    }
    if (stage === "images") {
      return {
        kind: "image",
        sceneId: scene.id,
        title: `Image · Scene ${scene.idx}`,
        payload: { idx: scene.idx, sceneTitle: title, swatch, caption: narration },
      };
    }
    if (stage === "clips") {
      return {
        kind: "clip",
        sceneId: scene.id,
        title: `Clip · Scene ${scene.idx}`,
        payload: { idx: scene.idx, sceneTitle: title, swatch, durationMs: scene.durationMs ?? 4000, caption: narration },
      };
    }
    const speaker = members[0];
    return {
      kind: "audio",
      sceneId: scene.id,
      title: `Audio · Scene ${scene.idx}`,
      payload: {
        idx: scene.idx,
        speaker: speaker?.name ?? "Narrator",
        voiceLabel: voiceLabel(speaker?.voiceId),
        line: narration,
        durationMs: scene.durationMs ?? 4000,
      },
    };
  }

  function chatTopic(bundle: VideoBundle): string {
    const chat = chats.get(bundle.video.chatId);
    return chat?.topic || bundle.video.brief.notes || "aaj ka topic";
  }

  async function finishBrief(chat: ChatRuntime): Promise<void> {
    const bundle = mustVideo(chat.videoId);
    const genre = (asGenre(chat.answers.genre) ?? "kids") satisfies Genre;
    const preset = defaultsFor(genre);
    const aspectRatio = chat.answers.aspect_ratio || preset.aspectRatio;
    const resolution = (chat.answers.resolution as Resolution | undefined) || preset.resolution;
    const language = (asLanguage(chat.answers.language) ?? preset.language) satisfies Language;
    const seconds = Number.parseInt(chat.answers.target_seconds ?? "", 10);
    const targetSeconds = Number.isFinite(seconds) ? seconds : preset.targetSeconds;
    const audience = chat.answers.audience || preset.audience;
    const artStyle = chat.answers.art_style || preset.artStyle;
    const castIds = resolveCastIds(chat.answers.cast, genre);
    if (!chat.answers.genre) chat.assumed.push("genre kids");
    if (!chat.answers.aspect_ratio) chat.assumed.push(aspectRatio);
    if (!chat.answers.resolution) chat.assumed.push(resolution);
    if (!chat.answers.target_seconds) chat.assumed.push(`${targetSeconds}s`);
    if (!chat.answers.language) chat.assumed.push(language);
    if (!chat.answers.audience) chat.assumed.push(audience);
    if (!chat.answers.art_style) chat.assumed.push(styleLabel(artStyle));
    if (!chat.answers.cast) chat.assumed.push(castIds.join(","));

    const brief: Brief = {
      genre,
      language,
      aspectRatio,
      resolution,
      targetSeconds,
      audience,
      artStyle: styleLabel(artStyle),
      artStyleTraits: styleTraits(artStyle),
      castIds,
      notes: chat.topic,
    };
    bundle.video = {
      ...bundle.video,
      genre,
      language,
      aspectRatio,
      resolution,
      targetSeconds,
      artStyle: styleLabel(artStyle),
      brief,
      updatedAt: now(),
    };
    const names = castIds.map((id) => castById(id)?.name).filter(Boolean).join(", ");
    const assumed = chat.assumed.length ? ` Assume kiya: ${chat.assumed.join(", ")}.` : "";
    emitText(
      chat,
      "assistant",
      `Brief lock. ${resolution} · ${aspectRatio} · ${targetSeconds}s · ${language}. Art style: ${styleLabel(artStyle)}. Cast: ${names}.${assumed}`,
    );
    await beginStage(chat, bundle, "cast");
  }

  async function askNext(chat: ChatRuntime): Promise<void> {
    await wait();
    const question = INTAKE[chat.qIndex];
    if (!question) {
      await finishBrief(chat);
      return;
    }
    emitQuestion(chat, question);
  }

  function reask(chat: ChatRuntime, note: string): void {
    emitText(chat, "assistant", note);
    const question = INTAKE[chat.qIndex];
    if (question) emitQuestion(chat, question);
  }

  function applyAnswer(chat: ChatRuntime, field: string, raw: string | undefined, skipped: boolean): string | null {
    const question = INTAKE[chat.qIndex];
    if (!question || question.field !== field) return "Yeh sawal ab active nahi hai.";
    if (skipped) {
      if (!question.allowSkip) return "Is sawal ko skip nahi kar sakte. Option chuno, ya Use defaults dabao.";
      chat.qIndex += 1;
      return null;
    }
    if (!raw) return "Jawab khali hai.";
    if (field === "target_seconds") {
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) return "Seconds mein number likho, jaise 45.";
      chat.answers[field] = String(Math.min(60, Math.max(10, parsed)));
      chat.qIndex += 1;
      return null;
    }
    if (field === "genre" && !asGenre(raw)) return "Kids, ad, ya faceless chuno.";
    if (field === "language" && !asLanguage(raw)) return "Hindi, Hinglish, ya English chuno.";
    if (field === "resolution" && raw !== "720p" && raw !== "1080p") return "720p ya 1080p chuno.";
    if (field === "cast") {
      const castIds = resolveCastIds(raw, asGenre(chat.answers.genre) ?? "kids");
      if (castIds.length < 1 || castIds.length > 2) {
        return "Cast mein 1 ya 2 members chuno.";
      }
      if (castIds.some((id) => !castById(id))) {
        return "Cast option pehle se bank mein hona chahiye.";
      }
      chat.answers[field] = castIds.join(",");
      chat.qIndex += 1;
      return null;
    }
    chat.answers[field] = raw;
    chat.qIndex += 1;
    return null;
  }

  function answerLabel(question: IntakeQuestion, raw: string): string {
    if (raw.includes(",")) {
      return raw
        .split(",")
        .map((id) => question.options?.find((option) => option.id === id.trim())?.label ?? id.trim())
        .filter(Boolean)
        .join(" + ");
    }
    return question.options?.find((option) => option.id === raw)?.label ?? raw;
  }

  async function continueBrief(
    chat: ChatRuntime,
    input: {
      field: string;
      raw?: string;
      skipped?: boolean;
      usedDefaults?: boolean;
      echo: string;
    },
  ): Promise<void> {
    if (input.usedDefaults) {
      const question = INTAKE[chat.qIndex];
      if (!question?.allowDefaults || question.field !== input.field) {
        emitText(chat, "user", input.echo);
        reask(chat, "Is sawal pe defaults nahi hain.");
        return;
      }
      const genre = asGenre(chat.answers.genre) ?? "kids";
      const preset = defaultsFor(genre);
      const value = defaultValue(input.field, preset);
      const label = answerLabel(question, value);
      emitText(chat, "user", label);
      chat.answers[input.field] = value;
      chat.assumed.push(label);
      chat.qIndex += 1;
    } else {
      emitText(chat, "user", input.echo);
      const problem = applyAnswer(chat, input.field, input.raw, Boolean(input.skipped));
      if (problem) {
        reask(chat, problem);
        return;
      }
    }
    await askNext(chat);
  }

  function bumpPayload(kind: ArtefactKind, payload: Record<string, unknown>, version: number): Record<string, unknown> {
    const next: Record<string, unknown> = { ...payload, version };
    delete next.rejectionNote;
    if (kind === "identity" && Array.isArray(next.members)) {
      next.members = next.members.map((item) => {
        if (!item || typeof item !== "object") return item;
        const member = item as Record<string, unknown>;
        const text = typeof member.identityText === "string" ? member.identityText : "";
        return { ...member, identityText: `${text} Version ${version}.` };
      });
    }
    if (typeof next.imagePrompt === "string") next.imagePrompt = `${next.imagePrompt} Version ${version}.`;
    if (typeof next.caption === "string") next.caption = `${next.caption} (v${version})`;
    if (typeof next.line === "string") next.line = `${next.line} (v${version})`;
    if (Array.isArray(next.scenes)) {
      next.scenes = next.scenes.map((item) => {
        if (!item || typeof item !== "object") return item;
        const scene = item as Record<string, unknown>;
        const narration = typeof scene.narration === "string" ? scene.narration : "";
        return { ...scene, narration: `${narration} (v${version})` };
      });
    }
    return next;
  }

  const api: StudioClient = {
    async createUser(body) {
      const name = body.displayName.trim();
      if (!name) throw new StudioMockError("name", "Naam likho.");
      const email = body.phoneOrEmail?.trim();
      if (email && !email.includes("@")) throw new StudioMockError("email", "Email mein @ hona chahiye.");
      user = {
        id: nid("usr"),
        displayName: name,
        phoneOrEmail: email,
        creditBalance: starterCredits,
        createdAt: now(),
      };
      return user;
    },

    async getMe() {
      return mustUser();
    },

    async createChat(body) {
      const current = mustUser();
      const chatId = nid("chat");
      const videoId = nid("vid");
      const created = now();
      const topic = body.initialMessage?.trim() || "aaj ka topic";
      const video: VideoSummary = {
        id: videoId,
        userId: current.id,
        chatId,
        genre: "kids",
        language: "hinglish",
        aspectRatio: "9:16",
        resolution: "720p",
        targetSeconds: 45,
        brief: {},
        stage: "brief",
        status: "active",
        reservedCredits: 0,
        createdAt: created,
        updatedAt: created,
      };
      videos.set(videoId, { video, scenes: [], artefacts: [] });
      const chat: ChatRuntime = {
        id: chatId,
        videoId,
        messages: [],
        listeners: new Set(),
        answers: {},
        assumed: [],
        qIndex: 0,
        topic,
        phase: "brief",
        advanceTimer: null,
        advancing: false,
        approvalMessageIds: new Map(),
      };
      chats.set(chatId, chat);
      if (body.initialMessage?.trim()) {
        emitText(chat, "user", body.initialMessage.trim());
      }
      void (async () => {
        await wait();
        const heard = body.initialMessage?.trim();
        emitText(
          chat,
          "assistant",
          heard
            ? `Suna: ${heard}. Main Chotu hoon. Pehle brief saaf karte hain — ek sawal ek baar.`
            : "Namaste. Main Chotu hoon, aapki chhoti production team. Hindi, Hinglish, ya English — pehle brief, phir video.",
        );
        emit(chat, { type: "stage", videoId, stage: "brief" });
        const first = INTAKE[0];
        if (first) emitQuestion(chat, first);
      })().catch((error: unknown) => emitError(chat, error));
      return { chatId, videoId, stage: "brief" };
    },

    async listMessages(chatId) {
      return { messages: [...mustChat(chatId).messages] };
    },

    async getChat(chatId) {
      await wait();
      const chat = mustChat(chatId);
      const bundle = mustVideo(chat.videoId);
      return {
        chatId: chat.id,
        videoId: chat.videoId,
        stage: bundle.video.stage,
        messages: [...chat.messages],
        artefacts: bundle.artefacts.map((item) => ({ ...item, payload: { ...item.payload } })),
      };
    },

    async postMessage(chatId, body) {
      const chat = mustChat(chatId);
      if (chat.phase !== "brief") {
        const message = emitText(chat, "user", body.text?.trim() || "…");
        emitText(chat, "assistant", nudge(mustVideo(chat.videoId).video.stage));
        return { accepted: true, message };
      }
      const question = INTAKE[chat.qIndex];
      if (!question) {
        const message = emitText(chat, "user", body.text?.trim() || "…");
        return { accepted: true, message };
      }
      if (body.answer) {
        if (body.answer.field !== question.field) {
          throw new StudioMockError("stale_question", "Yeh sawal ab active nahi hai.");
        }
        let echo = body.text?.trim() || "";
        if (body.answer.useDefaults) {
          echo = echo || "Use defaults";
          void continueBrief(chat, { field: question.field, usedDefaults: true, echo }).catch((error: unknown) =>
            emitError(chat, error),
          );
          const message = chat.messages[chat.messages.length - 1];
          return { accepted: true, message: message?.role === "user" ? message : undefined };
        }
        if (body.answer.skip) {
          echo = echo || "Skip";
          void continueBrief(chat, { field: question.field, skipped: true, echo }).catch((error: unknown) =>
            emitError(chat, error),
          );
          const message = chat.messages[chat.messages.length - 1];
          return { accepted: true, message: message?.role === "user" ? message : undefined };
        }
        let raw: string | undefined;
        if (body.answer.optionIds !== undefined) {
          if (question.field !== "cast") {
            throw new StudioMockError("answer", "optionIds sirf cast ke liye hain; single choice pe optionId use karo.");
          }
          const optionIds = body.answer.optionIds.map((id) => id.trim()).filter(Boolean);
          if (optionIds.length < 1 || optionIds.length > 2) {
            throw new StudioMockError("cast", "Cast mein 1 ya 2 members chuno.");
          }
          raw = optionIds.join(",");
        } else {
          raw = body.answer.optionId ?? body.answer.freeText;
        }
        if (!raw && body.text?.trim() && question.allowFreeText) raw = body.text.trim();
        echo = echo || (raw ? answerLabel(question, raw) : "…");
        void continueBrief(chat, { field: question.field, raw, echo }).catch((error: unknown) => emitError(chat, error));
        const message = chat.messages[chat.messages.length - 1];
        return { accepted: true, message: message?.role === "user" ? message : undefined };
      }
      const text = body.text?.trim() ?? "";
      if (question.allowFreeText && text) {
        void continueBrief(chat, { field: question.field, raw: text, echo: text }).catch((error: unknown) =>
          emitError(chat, error),
        );
        const message = chat.messages[chat.messages.length - 1];
        return { accepted: true, message: message?.role === "user" ? message : undefined };
      }
      if (text && isChipQuestion(question)) {
        const picked = fuzzyOptionIds(question, text);
        if (picked.length > 0) {
          const raw = picked.join(",");
          void continueBrief(chat, { field: question.field, raw, echo: answerLabel(question, raw) }).catch(
            (error: unknown) => emitError(chat, error),
          );
        } else if (question.allowDefaults) {
          void continueBrief(chat, { field: question.field, usedDefaults: true, echo: "Use defaults" }).catch(
            (error: unknown) => emitError(chat, error),
          );
        } else {
          emitText(chat, "assistant", "Neeche option chuno, ya Use defaults dabao.");
          return { accepted: true, message: undefined };
        }
        const message = chat.messages[chat.messages.length - 1];
        return { accepted: true, message: message?.role === "user" ? message : undefined };
      }
      if (!text) {
        emitText(chat, "assistant", "Neeche option chuno, ya Use defaults dabao.");
        return { accepted: true, message: undefined };
      }
      const message = emitText(chat, "user", text);
      emitText(chat, "assistant", "Neeche option chuno, ya Use defaults dabao.");
      return { accepted: true, message };
    },

    subscribe(chatId, onEvent) {
      const chat = mustChat(chatId);
      chat.listeners.add(onEvent);
      const timer = setInterval(() => {
        onEvent({ type: "heartbeat", ts: now() });
      }, 20000);
      return () => {
        clearInterval(timer);
        chat.listeners.delete(onEvent);
      };
    },

    async approveArtefact(artefactId) {
      const { artefact, chat } = mustArtefact(artefactId);
      if (artefact.state !== "awaiting_approval") {
        throw new StudioMockError("bad_state", "Yeh card ab approve nahi ho sakta.");
      }
      artefact.state = "approved";
      artefact.updatedAt = now();
      patchApproval(chat, artefact);
      const snapshot = { ...artefact, payload: { ...artefact.payload } };
      emit(chat, { type: "artefact", artefact: snapshot });
      scheduleAdvance(chat);
      return { artefact: snapshot };
    },

    async rejectArtefact(artefactId, body) {
      const note = body.rejectNote.trim();
      if (!note) throw new StudioMockError("note", "Reject ke saath note chahiye.");
      const { artefact, chat } = mustArtefact(artefactId);
      if (artefact.state !== "awaiting_approval" && artefact.state !== "rejected") {
        throw new StudioMockError("bad_state", "Yeh card reject nahi ho sakta.");
      }
      artefact.state = "rejected";
      artefact.payload = { ...artefact.payload, rejectionNote: note };
      artefact.updatedAt = now();
      patchApproval(chat, artefact);
      const snapshot = { ...artefact, payload: { ...artefact.payload } };
      emit(chat, { type: "artefact", artefact: snapshot });
      emitText(chat, "assistant", `Note le liya: ${note}. Regenerate dabao, tab naya version aayega.`);
      return { artefact: snapshot };
    },

    async regenerateArtefact(artefactId, confirm) {
      const current = mustUser();
      const { artefact, chat } = mustArtefact(artefactId);
      if (confirm === 0) {
        return {
          artefactId,
          creditCost: artefact.creditCost,
          balance: current.creditBalance,
          canAfford: current.creditBalance >= artefact.creditCost,
        };
      }
      if (current.creditBalance < artefact.creditCost) {
        throw new StudioMockError("credits", "Credits kam hain. Regenerate nahi chala.");
      }
      current.creditBalance -= artefact.creditCost;
      const charged = artefact.creditCost;
      artefact.state = "generating";
      artefact.updatedAt = now();
      const snapshot = { ...artefact, payload: { ...artefact.payload } };
      emit(chat, { type: "artefact", artefact: snapshot });
      emit(chat, {
        type: "message",
        message: {
          id: nid("msg"),
          chatId: chat.id,
          role: "assistant",
          kind: "progress",
          stage: mustVideo(artefact.videoId).video.stage,
          agent: agentFor(mustVideo(artefact.videoId).video.stage),
          text: `Dobara bana rahe hain · ${charged} credits.`,
          percent: 55,
          createdAt: now(),
        },
      });
      void (async () => {
        await wait();
        artefact.version += 1;
        artefact.state = "awaiting_approval";
        artefact.payload = bumpPayload(artefact.kind, artefact.payload, artefact.version);
        artefact.updatedAt = now();
        patchApproval(chat, artefact);
        emit(chat, { type: "artefact", artefact: { ...artefact, payload: { ...artefact.payload } } });
      })().catch((error: unknown) => emitError(chat, error));
      return {
        artefactId,
        state: "generating" as const,
        charged,
        balance: current.creditBalance,
        artefact: snapshot,
      };
    },

    async approveAllRemaining(videoId) {
      const bundle = mustVideo(videoId);
      const chat = mustChat(bundle.video.chatId);
      const approvedIds: string[] = [];
      if (bundle.video.stage === "brief" || bundle.video.stage === "done") {
        return { videoId, stage: bundle.video.stage, approvedIds };
      }
      for (const artefact of currentArtefacts(bundle)) {
        if (artefact.state !== "awaiting_approval") continue;
        artefact.state = "approved";
        artefact.updatedAt = now();
        approvedIds.push(artefact.id);
        patchApproval(chat, artefact);
        emit(chat, { type: "artefact", artefact: { ...artefact } });
      }
      const rejected = currentArtefacts(bundle).filter((item) => item.state === "rejected");
      if (rejected.length > 0) {
        emitText(chat, "assistant", "Kuch cards reject hain. Unhe Regenerate karo, tab agla stage khulega.");
      } else if (approvedIds.length > 0) {
        emitText(chat, "assistant", "Is stage ke waiting cards approve ho gaye.");
        scheduleAdvance(chat);
      }
      return { videoId, stage: bundle.video.stage, approvedIds };
    },

    async listCast() {
      return { items: CAST.map((item) => ({ ...item, dnaChips: [...item.dnaChips] })) };
    },

    async listVoices() {
      return { items: VOICES.map((item) => ({ ...item })) };
    },

    async getVideo(videoId) {
      const bundle = mustVideo(videoId);
      return {
        video: { ...bundle.video, brief: { ...bundle.video.brief } },
        scenes: bundle.scenes.map((scene) => ({ ...scene, doubts: [...scene.doubts], castIds: [...scene.castIds] })),
        artefacts: bundle.artefacts.map((item) => ({ ...item, payload: { ...item.payload } })),
      };
    },

    async listPacks() {
      return { packs: PACKS.map((pack) => ({ ...pack })) };
    },

    async checkout(body) {
      const current = mustUser();
      const pack = PACKS.find((item) => item.id === body.packId);
      if (!pack) throw new StudioMockError("pack", "Yeh pack nahi mila.");
      current.creditBalance += pack.credits;
      return {
        paymentId: nid("pay"),
        status: "mocked",
        creditsGranted: pack.credits,
      };
    },
  };

  return api;
}

const CHIP_FIELDS = new Set(["genre", "aspect_ratio", "resolution", "language", "cast"]);

function normalizeChoice(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9:+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mentionsChoice(hay: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${hay} `.includes(` ${needle} `);
}

function isChipQuestion(question: IntakeQuestion): boolean {
  return CHIP_FIELDS.has(question.field) && Boolean(question.options?.length) && !question.allowFreeText;
}

/** Match typed composer text to chip ids. Cast may return two ids. */
function fuzzyOptionIds(question: IntakeQuestion, text: string): string[] {
  const hay = normalizeChoice(text);
  if (!hay || !question.options?.length) return [];
  const tokens = hay.split(" ").filter(Boolean);
  const hits: string[] = [];
  for (const option of question.options) {
    const idNorm = normalizeChoice(option.id);
    const labelNorm = normalizeChoice(option.label);
    const idStem = idNorm.replace(/p$/, "");
    const labelTokens = labelNorm.split(" ").filter((token) => token.length > 2);
    const matched =
      hay === idNorm ||
      hay === labelNorm ||
      mentionsChoice(hay, idNorm) ||
      mentionsChoice(hay, labelNorm) ||
      tokens.some((token) => token === idNorm || (idStem.length >= 3 && token === idStem) || token === labelNorm) ||
      labelTokens.some((token) => mentionsChoice(hay, token));
    if (matched) hits.push(option.id);
  }
  return question.field === "cast" ? hits.slice(0, 2) : hits.slice(0, 1);
}

function asGenre(value: string | undefined): Genre | undefined {
  if (value === "kids" || value === "ad" || value === "faceless") return value;
  return undefined;
}

function asLanguage(value: string | undefined): Language | undefined {
  if (value === "hi" || value === "hinglish" || value === "en") return value;
  return undefined;
}

function presetCast(genre: Genre): string[] {
  if (genre === "ad") return CAST_BUNDLES.riya ?? [];
  if (genre === "faceless") return CAST_BUNDLES.narrator ?? [];
  return CAST_BUNDLES.kids_pair ?? [];
}

/** Accepts a bundle key, a single cast id, or comma-joined cast ids (from optionIds). */
function resolveCastIds(raw: string | undefined, genre: Genre): string[] {
  if (!raw?.trim()) return presetCast(genre);
  const trimmed = raw.trim();
  if (CAST_BUNDLES[trimmed]) return [...(CAST_BUNDLES[trimmed] ?? [])];
  const parts = trimmed.split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length > 0) return parts.slice(0, 2);
  return presetCast(genre);
}

function defaultValue(
  field: string,
  preset: ReturnType<typeof defaultsFor>,
): string {
  switch (field) {
    case "genre":
      return "kids";
    case "aspect_ratio":
      return preset.aspectRatio;
    case "resolution":
      return preset.resolution;
    case "target_seconds":
      return String(preset.targetSeconds);
    case "language":
      return preset.language;
    case "audience":
      return preset.audience;
    case "art_style":
      return preset.artStyle;
    case "cast":
      return (CAST_BUNDLES[preset.castBundle] ?? presetCast("kids")).join(",");
    default:
      return "";
  }
}

function sampleLine(language: Language, name: string): string {
  if (language === "hi") return `${name} bolta hai: चलो, एक बात साफ करते हैं.`;
  if (language === "en") return `${name} says: let us make one thing clear.`;
  return `${name} kehta hai: chalo, ek baat seedhi rakhte hain.`;
}

function agentFor(stage: Stage): string {
  switch (stage) {
    case "cast":
      return "Cast";
    case "script":
      return "Script";
    case "prompts":
      return "Prompts";
    case "images":
      return "Images";
    case "clips":
      return "Clips";
    case "audio":
      return "Voice";
    case "final":
      return "Edit";
    default:
      return "Chotu";
  }
}

function progressLine(stage: Stage): string {
  switch (stage) {
    case "cast":
      return "Cast ki pehchan, sheet, aur voice bana rahe hain.";
    case "script":
      return "Scene aur narration likh rahe hain.";
    case "prompts":
      return "Har scene ka image aur video prompt likh rahe hain.";
    case "images":
      return "Keyframe bana rahe hain.";
    case "clips":
      return "Clip bana rahe hain.";
    case "audio":
      return "Har scene ki awaaz bana rahe hain.";
    case "final":
      return "Final cut jod rahe hain, captions ke saath.";
    default:
      return "Aage badh rahe hain.";
  }
}

function nudge(stage: Stage): string {
  if (stage === "done") return "Video taiyar hai. Player se dekho.";
  if (stage === "brief") return "Neeche wale sawal ka jawab do.";
  return "Card pe Approve, Reject, ya Regenerate dabao. Agla stage usi ke baad khulega.";
}
