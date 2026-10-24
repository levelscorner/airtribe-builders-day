import { useEffect, useState } from "react";
import { getStudioClient } from "../api";
import { providerChipLabel, readProvider } from "../media-contract";

export interface StudioRuntime {
  mock: boolean;
  memory?: boolean;
  llm?: string;
  creditsEnabled?: boolean;
}
export function useStudioRuntime() {
  const [runtime, setRuntime] = useState<StudioRuntime | null>(null);
  useEffect(() => {
    let alive = true;
    const client = getStudioClient();
    if (client.getRuntime)
      void client
        .getRuntime()
        .then((value) => {
          if (alive) setRuntime(value);
        })
        .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return runtime;
}
export const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
export function isSampleUrl(value: unknown) {
  const url = text(value);
  return (
    url.startsWith("mock://") || /^(?:https?:\/\/[^/]+)?\/mock\//i.test(url)
  );
}
/** Accept actual media URLs, never script URLs or unrenderable mock:// addresses. */
export function mediaUrl(value: unknown): string | undefined {
  const url = text(value);
  if (!url || url.startsWith("mock://")) return undefined;
  if (/^https?:\/\//i.test(url) || /^\/(?!\/)/.test(url)) return url;
  return undefined;
}
export function isSample(source: unknown) {
  const row = source as
    | { provider?: string; payload?: Record<string, unknown>; url?: string }
    | undefined;
  return (
    readProvider(source) === "mock" ||
    isSampleUrl(row?.payload?.url ?? row?.url)
  );
}
export function generationLabel(source: unknown, fallback = "AI-generated") {
  const provider = providerChipLabel(source);
  if (isSample(source))
    return provider && provider !== "Mock" ? `Sample · ${provider}` : "Sample";
  return provider || fallback;
}

export interface ScriptReview {
  status:
    "completed" | "failed" | "hitl_triggered" | "budget_exceeded" | "mocked";
  confidence?: number;
  output: string | string[];
  warning?: string;
}
/** Matches #37/#36 without changing the shared types owned by the backend team. */
export function scriptReview(source: unknown): ScriptReview | undefined {
  const row = source as
    { agentReview?: unknown; payload?: { agentReview?: unknown } } | undefined;
  const candidate = row?.agentReview ?? row?.payload?.agentReview;
  if (!candidate || typeof candidate !== "object") return undefined;
  const r = candidate as Record<string, unknown>;
  if (
    ![
      "completed",
      "failed",
      "hitl_triggered",
      "budget_exceeded",
      "mocked",
    ].includes(text(r.status))
  )
    return undefined;
  return {
    status: r.status as ScriptReview["status"],
    confidence:
      typeof r.confidence === "number" && Number.isFinite(r.confidence)
        ? r.confidence
        : undefined,
    output: Array.isArray(r.output)
      ? r.output.filter((x): x is string => typeof x === "string")
      : text(r.output),
    warning: text(r.warning) || undefined,
  };
}

export function generationError(value: unknown) {
  const error = text(value);
  if (/not_enough_credits|insufficient.{0,20}credits/i.test(error)) return "Higgsfield needs API credits to create visuals. Add credits to the provider account, then retry this step. This is separate from the sample credits shown in SLB2.";
  if (/higgsfield.*(?:401|unauthoriz)|credentials missing/i.test(error)) return "Higgsfield could not authenticate this request. Check the server connection, then retry.";
  return error || "Please try this step again.";
}
