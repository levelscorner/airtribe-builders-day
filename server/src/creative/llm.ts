import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { z } from "zod";

export interface CompleteRequest {
  system: string;
  prompt: string;
}

export type CompleteFn = (request: CompleteRequest) => Promise<unknown>;

export function readComplete(env: { [key: string]: unknown }): CompleteFn | undefined {
  return typeof env.complete === "function" ? (env.complete as CompleteFn) : undefined;
}

export function readSkillsRoot(env: { [key: string]: unknown }): string | undefined {
  return typeof env.skillsRoot === "string" ? env.skillsRoot : undefined;
}

export function readApiKey(env: { [key: string]: unknown }): string {
  if (typeof env.llmApiKey === "string") return env.llmApiKey.trim();
  return process.env.LLM_API_KEY?.trim() ?? "";
}

export async function completeWithModel(
  request: CompleteRequest,
  schema: z.ZodTypeAny,
  env: { [key: string]: unknown },
): Promise<unknown> {
  const apiKey = readApiKey(env);
  if (!apiKey) throw new Error("LLM_API_KEY is required when MOCK is not set.");
  const baseURL =
    (typeof env.llmBaseUrl === "string" ? env.llmBaseUrl : process.env.LLM_BASE_URL)?.trim() || undefined;
  const model =
    (typeof env.llmModel === "string" ? env.llmModel : process.env.LLM_MODEL)?.trim() || "gpt-4o-mini";
  const openai = createOpenAI({ apiKey, baseURL });
  const { object } = await generateObject({
    model: openai(model),
    schema,
    system: request.system,
    prompt: request.prompt,
  });
  return object;
}
