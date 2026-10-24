import { ApiPaths } from "@chotu/shared";
import type {
  ApproveAllRemainingResponse,
  ApproveArtefactResponse,
  CheckoutRequest,
  CheckoutResponse,
  CreateChatRequest,
  CreateChatResponse,
  CreateUserRequest,
  CreateUserResponse,
  GetChatResponse,
  GetMeResponse,
  GetVideoResponse,
  ListCastResponse,
  ListMessagesResponse,
  ListPacksResponse,
  ListVoicesResponse,
  PostMessageRequest,
  PostMessageResponse,
  RegenerateConfirmResponse,
  RegeneratePreviewResponse,
  RejectArtefactRequest,
  RejectArtefactResponse,
} from "@chotu/shared";
import { parseMediaProgress, type RegenerateSceneRequest, type StudioEvent } from "./media-contract";
import type { StudioRuntime } from "./web/generation";
import type { StudioClient } from "./studio-client";

export class StudioHttpError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.name = "StudioHttpError";
    this.code = code;
    this.status = status;
  }
}

function joinUrl(base: string, path: string): string {
  if (!base) return path;
  return `${base.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { error: text };
    }
  }
  if (!response.ok) {
    const err = body as { error?: string };
    throw new StudioHttpError(
      err.error || "http_error",
      err.error || `HTTP ${response.status}`,
      response.status,
    );
  }
  return body as T;
}

/**
 * Live StudioClient against Saturn /v1 (same-origin when baseUrl is "").
 * Cookies carry the per-browser session (credentials: include).
 * On every EventSource open/reconnect, hydrates via GET /v1/chats/:id.
 */
export function createHttpStudio(baseUrl = ""): StudioClient {
  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(joinUrl(baseUrl, path), {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    return readJson<T>(response);
  }

  async function hydrateChat(
    chatId: string,
    onEvent: (event: StudioEvent) => void,
  ): Promise<void> {
    try {
      const chat = await api<GetChatResponse>(ApiPaths.chat(chatId));
      onEvent({ type: "stage", videoId: chat.videoId, stage: chat.stage });
      for (const message of chat.messages) {
        onEvent({ type: "message", message });
      }
      for (const artefact of chat.artefacts) {
        onEvent({ type: "artefact", artefact });
      }
    } catch (error) {
      onEvent({
        type: "error",
        code: "hydrate_failed",
        message: error instanceof Error ? error.message : "Chat sync fail.",
      });
    }
  }

  return {
    getRuntime() {
      return api<StudioRuntime>("/api/health");
    },
    async createUser(body: CreateUserRequest) {
      const response = await fetch(joinUrl(baseUrl, ApiPaths.users), {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const user = await readJson<CreateUserResponse>(response);
      // 201 is a new demo profile. 200 signs in an email that already exists.
      // The Set-Cookie on either response is the session the browser keeps.
      if (response.status !== 200 && response.status !== 201) {
        throw new StudioHttpError("unexpected_status", `HTTP ${response.status}`, response.status);
      }
      return user;
    },
    getMe() {
      return api<GetMeResponse>(ApiPaths.me);
    },
    createChat(body: CreateChatRequest) {
      return api<CreateChatResponse>(ApiPaths.chats, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    getChat(chatId: string) {
      return api<GetChatResponse>(ApiPaths.chat(chatId));
    },
    listMessages(chatId: string) {
      return api<ListMessagesResponse>(ApiPaths.chatMessages(chatId));
    },
    postMessage(chatId: string, body: PostMessageRequest) {
      return api<PostMessageResponse>(ApiPaths.chatMessages(chatId), {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    subscribe(chatId: string, onEvent: (event: StudioEvent) => void) {
      let stopped = false;
      let source: EventSource | null = null;
      let poll: ReturnType<typeof setInterval> | null = null;
      let retry: ReturnType<typeof setTimeout> | null = null;
      let attempt = 0;

      const stopPoll = () => {
        if (!poll) return;
        clearInterval(poll);
        poll = null;
      };
      const startPoll = () => {
        if (poll || stopped) return;
        void hydrateChat(chatId, onEvent);
        poll = setInterval(() => {
          void hydrateChat(chatId, onEvent);
        }, 3000);
      };
      const connect = () => {
        if (stopped) return;
        if (typeof EventSource === "undefined") {
          startPoll();
          return;
        }
        source = new EventSource(joinUrl(baseUrl, ApiPaths.chatEvents(chatId)), {
          withCredentials: true,
        });
        source.onopen = () => {
          attempt = 0;
          stopPoll();
          void hydrateChat(chatId, onEvent);
        };
        source.onmessage = (message) => {
          try {
            const parsed: unknown = JSON.parse(message.data);
            const progress = parseMediaProgress(parsed);
            onEvent(progress ?? (parsed as StudioEvent));
          } catch {
            /* ignore malformed frames */
          }
        };
        source.onerror = () => {
          source?.close();
          source = null;
          if (stopped) return;
          startPoll();
          const delay = Math.min(1000 * 2 ** attempt, 8000);
          attempt += 1;
          retry = setTimeout(connect, delay);
        };
      };

      void hydrateChat(chatId, onEvent);
      connect();
      return () => {
        stopped = true;
        stopPoll();
        if (retry) clearTimeout(retry);
        source?.close();
      };
    },
    approveArtefact(artefactId: string) {
      return api<ApproveArtefactResponse>(
        ApiPaths.artefactApprove(artefactId),
        {
          method: "POST",
          body: "{}",
        },
      );
    },
    rejectArtefact(artefactId: string, body: RejectArtefactRequest) {
      return api<RejectArtefactResponse>(ApiPaths.artefactReject(artefactId), {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    regenerateArtefact(artefactId: string, confirm: 0 | 1, feedback?: string, scope?: RegenerateSceneRequest) {
      const note = (scope?.feedback ?? feedback)?.trim();
      let body = "{}";
      if (scope) {
        const payload: RegenerateSceneRequest = { sceneId: scope.sceneId, target: scope.target };
        if (note) payload.feedback = note;
        body = JSON.stringify(payload);
      } else if (confirm === 1 && note) {
        body = JSON.stringify({ feedback: note, confirm: true });
      }
      return api<RegeneratePreviewResponse | RegenerateConfirmResponse>(
        `${ApiPaths.artefactRegenerate(artefactId)}?confirm=${confirm}`,
        { method: "POST", body },
      );
    },
    approveAllRemaining(videoId: string) {
      return api<ApproveAllRemainingResponse>(
        ApiPaths.approveAllRemaining(videoId),
        {
          method: "POST",
          body: "{}",
        },
      );
    },
    listCast() {
      return api<ListCastResponse>(ApiPaths.cast);
    },
    listVoices() {
      return api<ListVoicesResponse>(ApiPaths.voices);
    },
    getVideo(videoId: string) {
      return api<GetVideoResponse>(ApiPaths.video(videoId));
    },
    listPacks() {
      return api<ListPacksResponse>(ApiPaths.packs);
    },
    async checkout(_body: CheckoutRequest): Promise<CheckoutResponse> {
      throw new StudioHttpError(
        "not_implemented",
        "Packs checkout abhi Mars pe pending hai.",
      );
    },
  };
}
