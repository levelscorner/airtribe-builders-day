/**
 * AgenticOrg review attached to a script artefact.
 * TODO: switch to the shared field when Neptune adds `agentReview` on the
 * script artefact in packages/shared/types.ts. Until then this local shape
 * is the contract: `{ status, confidence?, output }`.
 */
export type AgentReviewStatus = "completed" | "failed" | "hitl_triggered" | "budget_exceeded";

export interface AgentReview {
  status: AgentReviewStatus;
  confidence?: number;
  /** A single note, or one suggested fix per entry. */
  output: string | string[];
}

export type ReviewTone = "ready" | "warn" | "hitl";

const STATUSES = new Set<AgentReviewStatus>(["completed", "failed", "hitl_triggered", "budget_exceeded"]);

/** Sample the mock attaches to the script card under MOCK=1. */
export const SAMPLE_SCRIPT_REVIEW: AgentReview = {
  status: "completed",
  confidence: 0.74,
  output: ["Shorten the hook to one line.", "Name the cast in scene 2.", "End on a question."],
};

export function reviewTone(status: AgentReviewStatus): ReviewTone {
  if (status === "failed" || status === "budget_exceeded") return "warn";
  if (status === "hitl_triggered") return "hitl";
  return "ready";
}

export function reviewStatusLabel(status: AgentReviewStatus): string {
  switch (status) {
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "hitl_triggered":
      return "Needs a person";
    case "budget_exceeded":
      return "Budget exceeded";
  }
}

/** Fraction 0–1 prints as a percent. A larger number prints as a score. */
export function reviewScoreLabel(confidence?: number): string | undefined {
  if (confidence === undefined || !Number.isFinite(confidence)) return undefined;
  if (confidence >= 0 && confidence <= 1) return `${Math.round(confidence * 100)}%`;
  return String(Math.round(confidence));
}

export function reviewNote(status: AgentReviewStatus): string | undefined {
  if (status === "failed") return "Review fail ho gaya.";
  if (status === "budget_exceeded") return "Budget khatam. Review adhoora hai.";
  if (status === "hitl_triggered") return "Insaan ki nazar chahiye, phir aage badho.";
  return undefined;
}

export function reviewFixes(review: AgentReview): string[] {
  if (Array.isArray(review.output)) return review.output.map((line) => line.trim()).filter(Boolean);
  return review.output
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Feedback string for the existing regenerate request. */
export function reviewFeedback(review: AgentReview): string {
  const text = Array.isArray(review.output) ? review.output.join("\n") : review.output;
  return text.trim().replace(/\s+/g, " ").slice(0, 280);
}

function parseOutput(value: unknown): string | string[] | undefined {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return undefined;
  const lines = value.filter((item): item is string => typeof item === "string");
  return lines;
}

function parseReview(value: unknown): AgentReview | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.status !== "string" || !STATUSES.has(row.status as AgentReviewStatus)) return undefined;
  const output = parseOutput(row.output);
  if (output === undefined) return undefined;
  const confidence =
    typeof row.confidence === "number" && Number.isFinite(row.confidence) ? row.confidence : undefined;
  return { status: row.status as AgentReviewStatus, confidence, output };
}

/** Reads `agentReview` from an artefact or from its payload / card preview. */
export function readAgentReview(source: unknown): AgentReview | undefined {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;
  const direct = parseReview(record.agentReview);
  if (direct) return direct;
  const payload = record.payload;
  if (payload && typeof payload === "object") return parseReview((payload as Record<string, unknown>).agentReview);
  return undefined;
}
