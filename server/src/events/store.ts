import { v4 as uuidv4 } from "uuid";

export type EventType =
  | "signup"
  | "job_created"
  | "approval"
  | "payment"
  | "render_done"
  | "credit_spent"
  | "credit_granted";

export interface TractionEvent {
  id: string;
  type: EventType;
  at: string;
  userId?: string;
  jobId?: string;
  detail: string;
  meta?: Record<string, unknown>;
}

const events: TractionEvent[] = [];

export function logEvent(
  type: EventType,
  detail: string,
  opts: { userId?: string; jobId?: string; meta?: Record<string, unknown> } = {},
): TractionEvent {
  const ev: TractionEvent = {
    id: uuidv4(),
    type,
    at: new Date().toISOString(),
    detail,
    userId: opts.userId,
    jobId: opts.jobId,
    meta: opts.meta,
  };
  events.push(ev);
  return ev;
}

export function listEvents(): TractionEvent[] {
  return [...events].sort((a, b) => a.at.localeCompare(b.at));
}

export function eventsToCsv(rows: TractionEvent[] = listEvents()): string {
  const header = "id,at,type,userId,jobId,detail";
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = rows.map((e) =>
    [e.id, e.at, e.type, e.userId ?? "", e.jobId ?? "", e.detail].map((c) => escape(String(c))).join(","),
  );
  return [header, ...lines].join("\n");
}
