import type { AgentReview, AgentReviewStatus } from "@chotu/shared";

const STORED_STATUSES = new Set<AgentReviewStatus>([
  "completed",
  "failed",
  "hitl_triggered",
  "budget_exceeded",
  "mocked",
]);

const REMOTE_STATUSES = new Set<AgentReviewStatus>([
  "completed",
  "failed",
  "hitl_triggered",
  "budget_exceeded",
]);

export function readAgentReview(value: unknown): AgentReview | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.status !== "string" || !STORED_STATUSES.has(row.status as AgentReviewStatus)) return undefined;
  const review: AgentReview = { status: row.status as AgentReviewStatus, output: coerceOutput(row.output) };
  if (typeof row.confidence === "number" && Number.isFinite(row.confidence)) review.confidence = row.confidence;
  if (typeof row.warning === "string" && row.warning.trim()) review.warning = row.warning;
  return review;
}

export function remoteStatus(body: unknown): string {
  const row = unwrap(body);
  return typeof row.status === "string" ? row.status : "";
}

/** Map an AgenticOrg run body onto our review. Unknown statuses become a non-blocking failure. */
export function reviewFromRemote(body: unknown, secret?: string): AgentReview {
  const row = unwrap(body);
  const status = typeof row.status === "string" ? row.status : "";
  if (!REMOTE_STATUSES.has(status as AgentReviewStatus)) {
    return { status: "failed", output: "", warning: "AgenticOrg review returned an unreadable status" };
  }
  const review: AgentReview = {
    status: status as AgentReviewStatus,
    output: coerceOutput(row.output),
  };
  if (typeof row.confidence === "number" && Number.isFinite(row.confidence)) review.confidence = row.confidence;
  const warningText = typeof row.warning === "string" ? row.warning : typeof row.error === "string" ? row.error : undefined;
  if (warningText?.trim()) review.warning = redact(warningText, secret);
  return ensureBlockingWarning(review);
}

/**
 * The script stage always waits for the creator.
 * `hitl_triggered` stays on that card. `failed` and `budget_exceeded` do too,
 * with a warning, so the agent does not fail the stage.
 */
export function scriptArtefactState(review: AgentReview): "awaiting_approval" {
  switch (review.status) {
    case "hitl_triggered":
      return "awaiting_approval";
    case "completed":
    case "mocked":
    case "failed":
    case "budget_exceeded":
      return "awaiting_approval";
    default: {
      const unexpected: never = review.status;
      return unexpected;
    }
  }
}

export function ensureBlockingWarning(review: AgentReview): AgentReview {
  if (review.status !== "failed" && review.status !== "budget_exceeded") return review;
  if (review.warning?.trim()) return review;
  return {
    ...review,
    warning:
      review.status === "budget_exceeded"
        ? "AgenticOrg review stopped because the budget was exceeded"
        : "AgenticOrg review failed",
  };
}

export function redact(text: string, secret?: string): string {
  let clean = text.replace(/bearer\s+\S+/gi, "Bearer [redacted]");
  if (secret && secret.length > 0) clean = clean.split(secret).join("[redacted]");
  return clean.replace(/\s+/g, " ").trim().slice(0, 240);
}

/** Panel contract: a note, or one fix per entry. Other JSON becomes one string. */
export function coerceOutput(value: unknown): string | string[] {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    const lines = value.filter((item): item is string => typeof item === "string");
    if (lines.length === value.length) return lines;
    if (lines.length > 0) return lines;
  }
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function unwrap(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const row = body as Record<string, unknown>;
  if (typeof row.status === "string") return row;
  const nested = row.result;
  if (nested && typeof nested === "object" && typeof (nested as Record<string, unknown>).status === "string") {
    return nested as Record<string, unknown>;
  }
  return row;
}
