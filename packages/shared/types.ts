/**
 * @chotu/shared — REST + SSE contract and module ports.
 * Source of truth for parallel teams (see docs/14-architecture.md).
 * Saturn owns this file; others implement against it.
 */

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export type Genre = 'kids' | 'ad' | 'faceless';
export type Language = 'hi' | 'hinglish' | 'en';
export type Resolution = '720p' | '1080p';

export type Stage =
  | 'brief'
  | 'cast'
  | 'script'
  | 'prompts'
  | 'images'
  | 'clips'
  | 'audio'
  | 'final'
  | 'done';

export type ArtefactKind =
  | 'identity'
  | 'sheet'
  | 'anchor'
  | 'voice_sample'
  | 'script'
  | 'prompt'
  | 'image'
  | 'clip'
  | 'audio'
  | 'final';

export type ArtefactState =
  | 'pending'
  | 'generating'
  | 'awaiting_approval'
  | 'approved'
  | 'rejected';

export type ApprovalAction =
  | 'approve'
  | 'reject'
  | 'regenerate'
  | 'approve_all_remaining';

export type CastRole = 'mascot' | 'presenter' | 'hero' | 'product' | 'narrator';
export type CastStatus = 'draft' | 'approved' | 'archived';

// ---------------------------------------------------------------------------
// Chat messages (persisted + SSE)
// ---------------------------------------------------------------------------

export type ChatRole = 'user' | 'assistant' | 'system';
export type ChatMessageKind = 'text' | 'question' | 'approval' | 'progress' | 'video';

export interface ChatMessageBase {
  id: string;
  chatId: string;
  role: ChatRole;
  createdAt: string; // ISO
}

export interface TextMessage extends ChatMessageBase {
  kind: 'text';
  text: string;
}

export interface QuestionOption {
  id: string;
  label: string;
}

export interface QuestionMessage extends ChatMessageBase {
  kind: 'question';
  /** Stable key, e.g. genre | aspect_ratio | art_style */
  field: string;
  prompt: string;
  options?: QuestionOption[];
  allowFreeText?: boolean;
  allowSkip?: boolean;
  allowDefaults?: boolean;
}

export interface ApprovalCardMessage extends ChatMessageBase {
  kind: 'approval';
  artefactId: string;
  artefactKind: ArtefactKind;
  stage: Stage;
  sceneId?: string;
  title: string;
  /** Preview payload for the card (urls, markdown, prompt text). */
  preview: Record<string, unknown>;
  /** Credits charged if the user regenerates (shown before confirm). */
  regenerateCreditCost: number;
  state: Extract<ArtefactState, 'awaiting_approval' | 'approved' | 'rejected'>;
}

export interface ProgressMessage extends ChatMessageBase {
  kind: 'progress';
  stage: Stage;
  agent?: string;
  text: string;
  percent?: number;
}

export interface VideoMessage extends ChatMessageBase {
  kind: 'video';
  videoId: string;
  url: string;
  durationMs?: number;
  thumbnailUrl?: string;
}

export type ChatMessage =
  | TextMessage
  | QuestionMessage
  | ApprovalCardMessage
  | ProgressMessage
  | VideoMessage;

/** SSE event frame (text/event-stream). */
export type SseEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'stage'; videoId: string; stage: Stage }
  | { type: 'artefact'; artefact: ArtefactSummary }
  | { type: 'heartbeat'; ts: string }
  | { type: 'error'; code: string; message: string };

// ---------------------------------------------------------------------------
// Core entities (API shapes)
// ---------------------------------------------------------------------------

export interface User {
  id: string;
  displayName: string;
  phoneOrEmail?: string;
  creditBalance: number;
  createdAt: string;
}

export interface Brief {
  /** Creator topic / subject line from chat intake. */
  topic?: string;
  genre?: Genre;
  language?: Language;
  aspectRatio?: string;
  resolution?: Resolution;
  targetSeconds?: number;
  audience?: string;
  artStyle?: string;
  artStyleTraits?: string[];
  castIds?: string[];
  /**
   * Free-form intake leftovers only (product, cast_request, skipped fields).
   * Do not store topic or regenerate feedback here — use `topic` and
   * `RegenerateRequest.feedback` / `ScriptGenInput.feedback`.
   */
  notes?: string;
}

export interface VideoSummary {
  id: string;
  userId: string;
  chatId: string;
  genre: Genre;
  language: Language;
  aspectRatio: string;
  resolution: Resolution;
  targetSeconds: number;
  artStyle?: string;
  brief: Brief;
  stage: Stage;
  status: 'active' | 'failed' | 'cancelled' | 'done';
  outputUrl?: string;
  reservedCredits: number;
  createdAt: string;
  updatedAt: string;
}

export interface Scene {
  id: string;
  videoId: string;
  idx: number;
  title?: string;
  narration?: string;
  durationMs?: number;
  doubts: string[];
  castIds: string[];
}

export interface ArtefactSummary {
  id: string;
  videoId: string;
  sceneId?: string;
  kind: ArtefactKind;
  state: ArtefactState;
  payload: Record<string, unknown>;
  creditCost: number;
  version: number;
  updatedAt: string;
}

export interface CastMember {
  id: string;
  ownerUserId?: string;
  name: string;
  role: CastRole;
  identityText: string;
  dnaChips: string[];
  artStyle?: string;
  sheetUrl?: string;
  anchorUrl?: string;
  higgsfieldElementId?: string;
  voiceId?: string;
  version: number;
  status: CastStatus;
  isPreset: boolean;
}

export interface VoicePreset {
  id: string;
  elevenlabsVoiceId: string;
  label: string;
  languageHint: string;
  stability: number;
  style: number;
  defaultCastName?: string;
  isPreset: true;
}

export interface CreditPack {
  id: string;
  label: string;
  credits: number;
  amountInr: number;
}

// ---------------------------------------------------------------------------
// REST request / response bodies
// ---------------------------------------------------------------------------

export interface CreateUserRequest {
  displayName: string;
  phoneOrEmail?: string;
}
export type CreateUserResponse = User;

export type GetMeResponse = User;

export interface CreateChatRequest {
  title?: string;
  /** Optional seed topic; orchestrator still runs brief. */
  initialMessage?: string;
}
export interface CreateChatResponse {
  chatId: string;
  videoId: string;
  stage: Stage;
}

export interface ListMessagesResponse {
  messages: ChatMessage[];
}

export interface PostMessageRequest {
  text?: string;
  /** Answer to a QuestionMessage */
  answer?: {
    field: string;
    /** Single-choice chips (genre, resolution, language, …). */
    optionId?: string;
    /**
     * Multi-choice chips for cast (1–2 members). Prefer this over packing
     * several ids into `optionId`. Single-choice fields keep using `optionId`.
     */
    optionIds?: string[];
    freeText?: string;
    skip?: boolean;
    useDefaults?: boolean;
  };
}
export interface PostMessageResponse {
  accepted: true;
  message?: ChatMessage;
}

export interface RejectArtefactRequest {
  /** Creator note explaining the rejection (HITL). */
  rejectNote: string;
}

/** Body for POST /v1/artefacts/:id/regenerate (?confirm=0 preview, confirm=1 run). */
export interface RegenerateRequest {
  /** Optional guidance for the next generation. */
  feedback?: string;
  /** When false/omitted with preview semantics, return credit cost only. */
  confirm?: boolean;
}

/** POST /v1/artefacts/:id/approve — body may be empty. SSE still broadcasts. */
export interface ApproveArtefactResponse {
  artefact: ArtefactSummary;
}

/** POST /v1/artefacts/:id/reject — SSE still broadcasts. */
export interface RejectArtefactResponse {
  artefact: ArtefactSummary;
}

export interface RegeneratePreviewResponse {
  artefactId: string;
  creditCost: number;
  balance: number;
  canAfford: boolean;
}

export interface RegenerateConfirmResponse {
  artefactId: string;
  state: ArtefactState;
  charged: number;
  /** Wallet balance after the debit. */
  balance: number;
  /** Updated artefact (often `generating`); SSE still broadcasts. */
  artefact: ArtefactSummary;
}

/** GET /v1/chats/:id — hydrate the chat shell in one round trip. */
export interface GetChatResponse {
  chatId: string;
  videoId: string;
  stage: Stage;
  messages: ChatMessage[];
  artefacts: ArtefactSummary[];
}

export interface ApproveAllRemainingResponse {
  videoId: string;
  stage: Stage;
  approvedIds: string[];
}

export interface ListCastResponse {
  items: CastMember[];
}

export interface ListVoicesResponse {
  items: VoicePreset[];
}

export interface GetVideoResponse {
  video: VideoSummary;
  scenes: Scene[];
  artefacts: ArtefactSummary[];
}

export interface ListPacksResponse {
  packs: CreditPack[];
}

export interface CheckoutRequest {
  packId: string;
}
export interface CheckoutResponse {
  paymentId: string;
  status: 'pending' | 'paid' | 'mocked';
  /** Provider redirect or mock receipt URL */
  checkoutUrl?: string;
  creditsGranted?: number;
}

// ---------------------------------------------------------------------------
// Module interfaces (server ports). MOCK=1 → mock implementation.
// ---------------------------------------------------------------------------

export interface ScriptGenInput {
  videoId: string;
  brief: Brief;
  cast: CastMember[];
  genre: Genre;
  language: Language;
  targetSeconds: number;
  /** From RegenerateRequest.feedback when the creator regenerates. */
  feedback?: string;
}

export interface ScriptGenOutput {
  scenes: Array<{
    idx: number;
    title: string;
    narration: string;
    durationMs: number;
    doubts: string[];
    castIds: string[];
  }>;
  rawMarkdown?: string;
}

export interface ScriptGen {
  generate(input: ScriptGenInput): Promise<ScriptGenOutput>;
}

export interface PromptGenInput {
  videoId: string;
  scene: Scene;
  brief: Brief;
  cast: CastMember[];
  artStyle?: string;
  /** From RegenerateRequest.feedback when the creator regenerates. */
  feedback?: string;
}

export interface PromptGenOutput {
  imagePrompt: string;
  videoPrompt: string;
  /** Embedded Higgsfield refs, e.g. <<<element_id>>> */
  elementIds: string[];
}

export interface PromptGen {
  generate(input: PromptGenInput): Promise<PromptGenOutput>;
}

export interface ImageGenInput {
  prompt: string;
  elementIds: string[];
  aspectRatio: string;
  resolution: Resolution;
}

export interface ImageGenOutput {
  url: string;
  provider: 'higgsfield' | 'mock';
  model?: string;
}

export interface ImageGen {
  generate(input: ImageGenInput): Promise<ImageGenOutput>;
}

export interface ClipGenInput {
  imageUrl: string;
  videoPrompt: string;
  elementIds: string[];
  durationMs: number;
  aspectRatio: string;
}

export interface ClipGenOutput {
  url: string;
  provider: 'higgsfield' | 'mock' | 'kenburns';
  model?: string;
}

export interface ClipGen {
  generate(input: ClipGenInput): Promise<ClipGenOutput>;
}

export interface VoiceGenInput {
  text: string;
  voiceId: string;
  language: Language;
}

export interface VoiceGenOutput {
  url: string;
  durationMs: number;
  provider: 'elevenlabs' | 'mock';
}

export interface VoiceGen {
  generate(input: VoiceGenInput): Promise<VoiceGenOutput>;
}

export interface RenderSceneInput {
  idx: number;
  clipUrl?: string;
  imageUrl?: string;
  audioUrl: string;
  narration: string;
  durationMs: number;
}

export interface RendererInput {
  videoId: string;
  aspectRatio: string;
  resolution: Resolution;
  scenes: RenderSceneInput[];
  captionStyle?: string;
}

export interface RendererOutput {
  url: string;
  durationMs: number;
  provider: 'ffmpeg' | 'render_workflow' | 'mock';
}

export interface Renderer {
  render(input: RendererInput): Promise<RendererOutput>;
}

export interface CreditQuote {
  operation:
    | 'video_max'
    | 'regenerate'
    | 'cast_create'
    | 'image'
    | 'clip'
    | 'audio'
    | 'final';
  creditCost: number;
}

export interface Credits {
  quote(input: {
    operation: CreditQuote['operation'];
    artefactKind?: ArtefactKind;
  }): CreditQuote;
  reserve(input: {
    userId: string;
    videoId: string;
    amount: number;
    ref: string;
  }): Promise<{ reserved: number }>;
  settle(input: {
    userId: string;
    videoId: string;
    actual: number;
    reserveRef: string;
    ref: string;
  }): Promise<{ charged: number; refunded: number }>;
  refund(input: {
    userId: string;
    videoId?: string;
    amount: number;
    ref: string;
    reason: string;
  }): Promise<void>;
  balance(userId: string): Promise<number>;
}

export interface Payments {
  listPacks(): Promise<CreditPack[]>;
  createCheckout(input: {
    userId: string;
    packId: string;
  }): Promise<CheckoutResponse>;
  handleWebhook(rawBody: string, signature?: string): Promise<{
    paymentId: string;
    status: 'paid' | 'failed' | 'mocked';
    creditsGranted: number;
  }>;
}

/** Factory hint: when process.env.MOCK === '1', return mocks. */
export type MockableFactory<T> = (env: {
  mock: boolean;
  [key: string]: unknown;
}) => T;

// ---------------------------------------------------------------------------
// Endpoint path constants (for clients)
// ---------------------------------------------------------------------------

export const ApiPaths = {
  users: '/v1/users',
  me: '/v1/me',
  chats: '/v1/chats',
  chat: (chatId: string) => `/v1/chats/${chatId}`,
  chatMessages: (chatId: string) => `/v1/chats/${chatId}/messages`,
  chatEvents: (chatId: string) => `/v1/chats/${chatId}/events`,
  artefactApprove: (id: string) => `/v1/artefacts/${id}/approve`,
  artefactReject: (id: string) => `/v1/artefacts/${id}/reject`,
  artefactRegenerate: (id: string) => `/v1/artefacts/${id}/regenerate`,
  approveAllRemaining: (videoId: string) =>
    `/v1/videos/${videoId}/approve-all-remaining`,
  cast: '/v1/cast',
  voices: '/v1/voices',
  video: (id: string) => `/v1/videos/${id}`,
  videoDownload: (id: string) => `/v1/videos/${id}/download`,
  packs: '/v1/packs',
  packsCheckout: '/v1/packs/checkout',
  packsWebhook: '/v1/packs/webhook',
  admin: '/admin',
  adminExport: '/admin/export.csv',
} as const;
