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
  SseEvent,
} from "@chotu/shared";
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

  async function hydrateChat(chatId: string, onEvent: (event: SseEvent) => void): Promise<void> {
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
    createUser(body: CreateUserRequest) {
      return api<CreateUserResponse>(ApiPaths.users, {
        method: "POST",
        body: JSON.stringify(body),
      });
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
    subscribe(chatId: string, onEvent: (event: SseEvent) => void) {
      if (typeof EventSource === "undefined") {
        throw new StudioHttpError("sse", "EventSource unavailable in this runtime");
      }
      const source = new EventSource(joinUrl(baseUrl, ApiPaths.chatEvents(chatId)), {
        withCredentials: true,
      });
      let openedOnce = false;
      source.onopen = () => {
        // First open + every reconnect: pull authoritative chat state.
        void hydrateChat(chatId, onEvent);
        openedOnce = true;
      };
      // Some browsers fire the first open late; also hydrate immediately.
      if (!openedOnce) void hydrateChat(chatId, onEvent);
      source.onmessage = (message) => {
        try {
          onEvent(JSON.parse(message.data) as SseEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      source.onerror = () => {
        if (source.readyState === EventSource.CLOSED) {
          onEvent({ type: "error", code: "sse_closed", message: "Live updates ruk gayi." });
        }
        // CONNECTING: browser will reopen → onopen hydrates again.
      };
      return () => source.close();
    },
    approveArtefact(artefactId: string) {
      return api<ApproveArtefactResponse>(ApiPaths.artefactApprove(artefactId), {
        method: "POST",
        body: "{}",
      });
    },
    rejectArtefact(artefactId: string, body: RejectArtefactRequest) {
      return api<RejectArtefactResponse>(ApiPaths.artefactReject(artefactId), {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    regenerateArtefact(artefactId: string, confirm: 0 | 1, feedback?: string) {
      const note = feedback?.trim();
      const body = confirm === 1 && note ? JSON.stringify({ feedback: note, confirm: true }) : "{}";
      return api<RegeneratePreviewResponse | RegenerateConfirmResponse>(
        `${ApiPaths.artefactRegenerate(artefactId)}?confirm=${confirm}`,
        { method: "POST", body },
      );
    },
    approveAllRemaining(videoId: string) {
      return api<ApproveAllRemainingResponse>(ApiPaths.approveAllRemaining(videoId), {
        method: "POST",
        body: "{}",
      });
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
      throw new StudioHttpError("not_implemented", "Packs checkout abhi Mars pe pending hai.");
    },
  };
}
