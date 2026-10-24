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
 * Session is server-side for the MOCK demo (set on POST /v1/users).
 */
export function createHttpStudio(baseUrl = ""): StudioClient {
  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(joinUrl(baseUrl, path), {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
        ...(init?.headers ?? {}),
      },
    });
    return readJson<T>(response);
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
      const source = new EventSource(joinUrl(baseUrl, ApiPaths.chatEvents(chatId)));
      source.onmessage = (message) => {
        try {
          onEvent(JSON.parse(message.data) as SseEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      source.onerror = () => {
        // Browser reconnects; surface soft errors only if closed hard.
        if (source.readyState === EventSource.CLOSED) {
          onEvent({ type: "error", code: "sse_closed", message: "Live updates ruk gayi." });
        }
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
    regenerateArtefact(artefactId: string, confirm: 0 | 1) {
      return api<RegeneratePreviewResponse | RegenerateConfirmResponse>(
        `${ApiPaths.artefactRegenerate(artefactId)}?confirm=${confirm}`,
        { method: "POST", body: "{}" },
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
