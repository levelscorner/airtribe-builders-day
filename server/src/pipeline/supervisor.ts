import type { Job, StageName } from "../jobs/types.js";

/**
 * Plain-code Supervisor — no LLM call.
 * Fixed Chotu mini DAG: script → visuals → voice → render → verify.
 */
export function planStages(_job: Job): StageName[] {
  return ["script", "visuals", "voice", "render", "verify"];
}

export function shouldRetryVerify(job: Job, ok: boolean): boolean {
  return !ok && job.retryCount < 1;
}
