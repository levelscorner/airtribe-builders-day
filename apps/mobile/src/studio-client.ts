import type {
  ApproveAllRemainingResponse,
  CheckoutRequest,
  CheckoutResponse,
  CreateChatRequest,
  CreateChatResponse,
  CreateUserRequest,
  CreateUserResponse,
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
  SseEvent,
} from "@chotu/shared";

/**
 * Client surface for docs/14 REST + SSE.
 * Response bodies are the shared types. Approve and reject have no response
 * body in the contract, so those methods resolve void and the UI reads SSE.
 */
export interface StudioClient {
  createUser(body: CreateUserRequest): Promise<CreateUserResponse>;
  getMe(): Promise<GetMeResponse>;
  createChat(body: CreateChatRequest): Promise<CreateChatResponse>;
  listMessages(chatId: string): Promise<ListMessagesResponse>;
  postMessage(chatId: string, body: PostMessageRequest): Promise<PostMessageResponse>;
  /** In-process stand-in for GET /v1/chats/:id/events. No socket is opened. */
  subscribe(chatId: string, onEvent: (event: SseEvent) => void): () => void;
  approveArtefact(artefactId: string): Promise<void>;
  rejectArtefact(artefactId: string, body: RejectArtefactRequest): Promise<void>;
  regenerateArtefact(
    artefactId: string,
    confirm: 0 | 1,
  ): Promise<RegeneratePreviewResponse | RegenerateConfirmResponse>;
  approveAllRemaining(videoId: string): Promise<ApproveAllRemainingResponse>;
  listCast(): Promise<ListCastResponse>;
  listVoices(): Promise<ListVoicesResponse>;
  getVideo(videoId: string): Promise<GetVideoResponse>;
  listPacks(): Promise<ListPacksResponse>;
  checkout(body: CheckoutRequest): Promise<CheckoutResponse>;
}
