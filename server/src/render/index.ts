import { assembleWithFfmpeg } from "./ffmpeg.js";
import { createMockRenderer } from "./mock.js";
import type { Renderer } from "./types.js";
import { createWorkflowRenderer } from "./workflow.js";

export { assembleWithFfmpeg, captionFont, probeVideo, renderOutputPath } from "./ffmpeg.js";
export { createMockRenderer } from "./mock.js";
export type { Renderer, RendererInput, RendererOutput, RenderSceneInput } from "./types.js";
export { assemble, createWorkflowRenderer } from "./workflow.js";

export function createRenderer(env: {
  mock: boolean;
  renderApiKey?: string;
  publicBaseUrl?: string;
  workDir?: string;
  fetchImpl?: typeof fetch;
  workflowTask?: string;
  workflowTimeoutMs?: number;
  [key: string]: unknown;
}): Renderer {
  const publicBaseUrl = env.publicBaseUrl || "http://localhost:8787";
  const workDir = env.workDir || defaultWorkDir();
  if (env.mock) return createMockRenderer({ workDir, publicBaseUrl });
  const apiKey = env.renderApiKey?.trim();
  if (apiKey) {
    return createWorkflowRenderer({
      apiKey,
      workDir,
      publicBaseUrl,
      fetchImpl: env.fetchImpl,
      task: env.workflowTask,
      timeoutMs: env.workflowTimeoutMs,
    });
  }
  return {
    render: (input) => assembleWithFfmpeg(input, { workDir, publicBaseUrl, fetchImpl: env.fetchImpl }),
  };
}

function defaultWorkDir(): string {
  return new URL("../../data/renders/", import.meta.url).pathname;
}
