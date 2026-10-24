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
import type { RegenerateSceneRequest, StudioEvent } from "./media-contract";

/**
 * Client surface for docs/14 REST + SSE.
 * Approve / reject / regenerate return the updated artefact; SSE still broadcasts.
 */
export interface StudioClient {
  createUser(body: CreateUserRequest): Promise<CreateUserResponse>;
  getMe(): Promise<GetMeResponse>;
  createChat(body: CreateChatRequest): Promise<CreateChatResponse>;
  getChat(chatId: string): Promise<GetChatResponse>;
  listMessages(chatId: string): Promise<ListMessagesResponse>;
  postMessage(chatId: string, body: PostMessageRequest): Promise<PostMessageResponse>;
  /** In-process stand-in for GET /v1/chats/:id/events. No socket is opened. */
  subscribe(chatId: string, onEvent: (event: StudioEvent) => void): () => void;
  approveArtefact(artefactId: string): Promise<ApproveArtefactResponse>;
  rejectArtefact(artefactId: string, body: RejectArtefactRequest): Promise<RejectArtefactResponse>;
  regenerateArtefact(
    artefactId: string,
    confirm: 0 | 1,
    feedback?: string,
    scope?: RegenerateSceneRequest,
  ): Promise<RegeneratePreviewResponse | RegenerateConfirmResponse>;
  approveAllRemaining(videoId: string): Promise<ApproveAllRemainingResponse>;
  listCast(): Promise<ListCastResponse>;
  listVoices(): Promise<ListVoicesResponse>;
  getVideo(videoId: string): Promise<GetVideoResponse>;
  listPacks(): Promise<ListPacksResponse>;
  checkout(body: CheckoutRequest): Promise<CheckoutResponse>;
}
