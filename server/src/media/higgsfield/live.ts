import { randomUUID } from "node:crypto";
import type { ClipGenInput, ClipGenOutput, ImageGenInput, ImageGenOutput } from "../../../../packages/shared/types.ts";
import type { CastReferenceAdapter, ResolvedCastPrompt } from "../cast/reference.js";
import { PROVISIONAL_CREDITS } from "../credits.js";
import type { EnvLike } from "../flags.js";
import { remoteHttpAnchors } from "../openai/images.js";
import { failedJob, JobStore, type MediaJob, type MediaJobStatus } from "../job.js";
import type { ClipGenPort, ImageGenPort, SubmitOpts } from "../ports.js";
import type { HfStatus, HiggsfieldClient } from "./client.js";
import { buildClipSubmission, buildImageSubmission } from "./request.js";
import { assertHttpUrl } from "./urls.js";

const TERMINAL = new Set<MediaJobStatus>(["completed", "failed", "nsfw", "canceled"]);

function track<T>(
  store: JobStore<T>,
  inflight: Map<string, Promise<MediaJob<T>>>,
  opts: SubmitOpts | undefined,
  run: (idempotencyKey: string) => Promise<MediaJob<T>>,
): Promise<MediaJob<T>> {
  const idempotencyKey = opts?.idempotencyKey?.trim() || randomUUID();
  const existing = store.getByKey(idempotencyKey);
  if (existing && TERMINAL.has(existing.status)) return Promise.resolve(existing);
  const pending = inflight.get(idempotencyKey);
  if (pending) return pending;
  const promise = run(idempotencyKey).finally(() => {
    inflight.delete(idempotencyKey);
  });
  inflight.set(idempotencyKey, promise);
  return promise;
}

function settle<T>(status: HfStatus, idempotencyKey: string, costCredits: number, result: () => T): MediaJob<T> {
  if (status.status !== "completed") {
    return {
      jobId: status.request_id,
      provider: "higgsfield",
      status: status.status,
      error: status.error || status.status,
      costCredits: 0,
      idempotencyKey,
    };
  }
  return {
    jobId: status.request_id,
    provider: "higgsfield",
    status: "completed",
    result: result(),
    costCredits,
    idempotencyKey,
  };
}

export class LiveImageGen implements ImageGenPort {
  readonly mode = "live" as const;
  private readonly store = new JobStore<ImageGenOutput>();
  private readonly inflight = new Map<string, Promise<MediaJob<ImageGenOutput>>>();

  constructor(
    private readonly env: EnvLike,
    private readonly cast: CastReferenceAdapter,
    private readonly client: HiggsfieldClient,
  ) {}

  submit(input: ImageGenInput, opts?: SubmitOpts): Promise<MediaJob<ImageGenOutput>> {
    return track(this.store, this.inflight, opts, (idempotencyKey) => this.execute(input, idempotencyKey));
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

  private async execute(input: ImageGenInput, idempotencyKey: string): Promise<MediaJob<ImageGenOutput>> {
    try {
      const resolved = httpResolved(this.env, this.cast.resolvePrompt(input.prompt, input.elementIds ?? []));
      const submission = buildImageSubmission(input, resolved);
      const status = await this.client.generate(submission.endpoint, submission.body, idempotencyKey, "image");
      return this.store.insert(
        settle(status, idempotencyKey, PROVISIONAL_CREDITS.image, () => {
          const url = status.images?.[0]?.url;
          if (!url) throw new Error("higgsfield image result missing url");
          return { url, provider: "higgsfield" as const, model: submission.endpoint };
        }),
      );
    } catch (error) {
      return this.store.insert(failedJob(idempotencyKey, error, "higgsfield"));
    }
  }
}

export class LiveClipGen implements ClipGenPort {
  readonly mode = "live" as const;
  private readonly store = new JobStore<ClipGenOutput>();
  private readonly inflight = new Map<string, Promise<MediaJob<ClipGenOutput>>>();

  constructor(
    private readonly env: EnvLike,
    private readonly cast: CastReferenceAdapter,
    private readonly client: HiggsfieldClient,
  ) {}

  submit(input: ClipGenInput, opts?: SubmitOpts): Promise<MediaJob<ClipGenOutput>> {
    return track(this.store, this.inflight, opts, (idempotencyKey) => this.execute(input, idempotencyKey));
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

  private async execute(input: ClipGenInput, idempotencyKey: string): Promise<MediaJob<ClipGenOutput>> {
    try {
      const resolved = httpResolved(this.env, this.cast.resolvePrompt(input.videoPrompt, input.elementIds ?? []));
      const submission = buildClipSubmission(input, resolved, { resolution: this.env.CLIP_RESOLUTION });
      assertHttpUrl(input.imageUrl, "clip image url");
      const status = await this.client.generate(submission.endpoint, submission.body, idempotencyKey, "video");
      return this.store.insert(
        settle(status, idempotencyKey, PROVISIONAL_CREDITS.clip, () => {
          const url = status.video?.url;
          if (!url) throw new Error("higgsfield video result missing url");
          return { url, provider: "higgsfield" as const, model: submission.endpoint };
        }),
      );
    } catch (error) {
      return this.store.insert(failedJob(idempotencyKey, error, "higgsfield"));
    }
  }
}

function httpResolved(env: EnvLike, resolved: ResolvedCastPrompt): ResolvedCastPrompt {
  return { ...resolved, anchorUrls: remoteHttpAnchors(env, resolved.anchorUrls) };
}
