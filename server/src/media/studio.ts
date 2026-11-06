import { randomUUID } from "node:crypto";
import type { ClipGenInput, ClipGenOutput, ImageGenInput, ImageGenOutput } from "../../../packages/shared/types.ts";
import { createCastAdapter, type CastReferenceAdapter, type ResolvedCastPrompt } from "./cast/reference.js";
import { PROVISIONAL_CREDITS } from "./credits.js";
import { MediaInputError } from "./errors.js";
import type { EnvLike } from "./flags.js";
import { moduleMock } from "./flags.js";
import { savePng } from "./files.js";
import { failedJob, JobStore, newJobId, type MediaJob } from "./job.js";
import type { ClipGenPort, ImageGenPort, SubmitOpts } from "./ports.js";
import { createClipGen } from "./higgsfield/clip-gen.js";
import { createImageGen } from "./higgsfield/image-gen.js";
import { ArkClient, createArkClient, type ArkDeps, type FetchLike } from "./ark/client.js";
import { prepareArkImages } from "./ark/references.js";
import { buildSeedanceBody, buildSeedreamBody, requirePrompt, seedanceFirstFrame, seedanceModel, seedreamModel, SEEDREAM_PORTRAIT_SIZE } from "./ark/request.js";
import { cropToNineSixteen, generateOpenAiImage, openaiImageModel } from "./openai/images.js";

const OPENAI_LABEL = "GPT Image 2 · OpenAI";
const SEEDREAM_LABEL = "Seedream 5.0 · BytePlus";
const SEEDANCE_LABEL = "Seedance 2.5 · BytePlus";

export interface StudioDeps extends ArkDeps {
  cast?: CastReferenceAdapter;
}

function imageProvider(env: EnvLike): "openai" | "ark" | "mock" {
  const explicit = env.IMAGE_PROVIDER?.trim().toLowerCase() ?? "";
  if (explicit === "mock" || explicit === "ark" || explicit === "openai") return explicit;
  if (explicit) throw new Error("IMAGE_PROVIDER must be openai, ark, or mock");
  return "openai";
}

class StudioImageGen implements ImageGenPort {
  readonly mode = "live" as const;
  private readonly store = new JobStore<ImageGenOutput>();

  constructor(
    private readonly env: EnvLike,
    private readonly cast: CastReferenceAdapter,
    private readonly deps: ArkDeps,
  ) {}

  async submit(input: ImageGenInput, opts?: SubmitOpts): Promise<MediaJob<ImageGenOutput>> {
    const idempotencyKey = opts?.idempotencyKey?.trim() || randomUUID();
    const existing = this.store.getByKey(idempotencyKey);
    if (existing) return existing;
    try {
      const resolved = this.cast.resolvePrompt(input.prompt, input.elementIds ?? []);
      requirePrompt(resolved);
      const choice = imageProvider(this.env);
      let openAiFailure: unknown;
      if (choice !== "ark" && this.env.OPENAI_API_KEY?.trim()) {
        try {
          const url = await this.openAiFrame(input, resolved);
          return this.store.insert({
            jobId: newJobId(),
            provider: "openai",
            status: "completed",
            result: {
              url,
              provider: "openai",
              model: openaiImageModel(this.env),
              providerLabel: OPENAI_LABEL,
            },
            costCredits: PROVISIONAL_CREDITS.image,
            idempotencyKey,
          });
        } catch (error) {
          if (error instanceof MediaInputError || !this.env.ARK_API_KEY?.trim()) throw error;
          openAiFailure = error;
        }
      }
      if (!this.env.ARK_API_KEY?.trim()) {
        throw new Error(choice === "ark" ? "ARK_API_KEY is not set" : "OPENAI_API_KEY is not set");
      }
      let url: string;
      try {
        url = await this.seedreamFrame(input, resolved);
      } catch (error) {
        if (!openAiFailure) throw error;
        throw new Error(`${providerFailure("openai", openAiFailure)}; ${providerFailure("ark", error)}`);
      }
      return this.store.insert({
        jobId: newJobId(),
        provider: "ark",
        status: "completed",
        result: {
          url,
          provider: "ark",
          model: seedreamModel(this.env),
          providerLabel: SEEDREAM_LABEL,
        },
        costCredits: PROVISIONAL_CREDITS.image,
        idempotencyKey,
      });
    } catch (error) {
      const provider = imageProvider(this.env) === "ark" ? "ark" : "openai";
      return this.store.insert(failedJob(idempotencyKey, error, provider));
    }
  }

  /** One attempt, then one retry. A second failure falls through to Seedream. */
  private async openAiFrame(input: ImageGenInput, resolved: ResolvedCastPrompt): Promise<string> {
    const fetchImpl = this.fetchImpl();
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await generateOpenAiImage(this.env, input, resolved, fetchImpl);
      } catch (error) {
        if (error instanceof MediaInputError) throw error;
        last = error;
      }
    }
    throw last instanceof Error ? last : new Error("openai image failed");
  }

  /** Request the large 9:16 frame, then store the 720x1280 still the pipeline uses. */
  private async seedreamFrame(input: ImageGenInput, resolved: ResolvedCastPrompt): Promise<string> {
    const client = createArkClient(this.env, this.deps);
    const images = await prepareArkImages(this.env, resolved.anchorUrls, this.fetchImpl());
    const body = buildSeedreamBody(input, resolved, this.env, images);
    const remote = await client.image(body);
    if (body.size !== SEEDREAM_PORTRAIT_SIZE) return remote;
    const response = await this.fetchImpl()(remote);
    if (!response.ok) throw new Error(`seedream image fetch failed (${response.status})`);
    const bytes = Buffer.from(await response.arrayBuffer());
    return savePng(this.env, randomUUID(), await cropToNineSixteen(bytes));
  }

  private fetchImpl(): FetchLike {
    return this.deps.fetch ?? fetch;
  }

  async getJob(jobId: string): Promise<MediaJob<ImageGenOutput>> {
    const job = this.store.get(jobId);
    if (!job) throw new Error(`unknown media job ${jobId}`);
    return job;
  }

  async generate(input: ImageGenInput): Promise<ImageGenOutput> {
    const job = await this.submit(input);
    if (job.status !== "completed" || !job.result) throw new Error(job.error || `image job ${job.status}`);
    return job.result;
  }
}

class StudioClipGen implements ClipGenPort {
  readonly mode = "live" as const;
  private readonly store = new JobStore<ClipGenOutput>();
  private readonly client: ArkClient;

  constructor(
    private readonly env: EnvLike,
    private readonly cast: CastReferenceAdapter,
    deps: ArkDeps,
  ) {
    this.client = createArkClient(env, deps);
  }

  async submit(input: ClipGenInput, opts?: SubmitOpts): Promise<MediaJob<ClipGenOutput>> {
    const idempotencyKey = opts?.idempotencyKey?.trim() || randomUUID();
    const existing = this.store.getByKey(idempotencyKey);
    if (existing) return existing;
    try {
      const resolved = this.cast.resolvePrompt(input.videoPrompt, input.elementIds ?? []);
      if (resolved.unresolvedIds.length > 0) {
        throw new MediaInputError(`unknown cast reference: ${resolved.unresolvedIds.join(", ")}`);
      }
      const frame = await seedanceFirstFrame(this.env, input.imageUrl);
      const url = await this.client.video(
        buildSeedanceBody({ ...input, imageUrl: frame }, resolved.prompt, this.env),
      );
      return this.store.insert({
        jobId: newJobId(),
        provider: "ark",
        status: "completed",
        result: {
          url,
          provider: "ark",
          model: seedanceModel(this.env),
          providerLabel: SEEDANCE_LABEL,
        },
        costCredits: PROVISIONAL_CREDITS.clip,
        idempotencyKey,
      });
    } catch (error) {
      return this.store.insert(failedJob(idempotencyKey, error, "ark"));
    }
  }

  async getJob(jobId: string): Promise<MediaJob<ClipGenOutput>> {
    const job = this.store.get(jobId);
    if (!job) throw new Error(`unknown media job ${jobId}`);
    return job;
  }

  async generate(input: ClipGenInput): Promise<ClipGenOutput> {
    const job = await this.submit(input);
    if (job.status !== "completed" || !job.result) throw new Error(job.error || `clip job ${job.status}`);
    return job.result;
  }
}

function providerFailure(name: "openai" | "ark", error: unknown): string {
  const text = (error instanceof Error ? error.message : "image failed").replace(/\s+/g, " ").trim();
  const detail = text.replace(new RegExp(`^${name}\\s*:?\\s*`, "i"), "");
  return `${name}: ${detail || text}`;
}

function mockImages(env: EnvLike, cast: CastReferenceAdapter): ImageGenPort {
  return createImageGen({ ...env, IMAGE_MOCK: "1" }, { cast });
}

function mockClips(env: EnvLike, cast: CastReferenceAdapter): ClipGenPort {
  return createClipGen({ ...env, CLIP_MOCK: "1" }, { cast });
}

/** Blank IMAGE_PROVIDER is gpt-image-2. A failed frame is retried once, then Seedream when ARK_API_KEY is set. */
export function createStudioImageGen(env: EnvLike = process.env, deps: StudioDeps = {}): ImageGenPort {
  const cast = deps.cast ?? createCastAdapter(env);
  if (moduleMock(env, "IMAGE_MOCK")) return mockImages(env, cast);
  const provider = imageProvider(env);
  if (provider === "mock") return mockImages(env, cast);
  if (provider === "openai" && !env.OPENAI_API_KEY?.trim()) return mockImages(env, cast);
  if (provider === "ark" && !env.ARK_API_KEY?.trim()) return mockImages(env, cast);
  return new StudioImageGen(env, cast, deps);
}

/** Seedance 2.5 image-to-video from the approved still. Mock when the ARK key is missing. */
export function createStudioClipGen(env: EnvLike = process.env, deps: StudioDeps = {}): ClipGenPort {
  const cast = deps.cast ?? createCastAdapter(env);
  if (moduleMock(env, "CLIP_MOCK") || !env.ARK_API_KEY?.trim()) return mockClips(env, cast);
  return new StudioClipGen(env, cast, deps);
}
