import type { Db } from "../credits/db.js";

export const EVENT_KINDS = [
  "signup",
  "chat_started",
  "stage_enter",
  "approval",
  "reject",
  "regenerate",
  "payment",
  "render_done",
  "download",
  "agent_activity",
] as const;

export type EventKind = (typeof EVENT_KINDS)[number];

export interface EventInput {
  kind: EventKind;
  userId?: string;
  videoId?: string;
  payload?: Record<string, unknown>;
}

export interface EventRow {
  id: string;
  userId?: string;
  videoId?: string;
  kind: EventKind;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface EventLog {
  record(input: EventInput): Promise<void>;
  list(limit?: number): Promise<EventRow[]>;
  counts(): Promise<Array<{ kind: string; n: number }>>;
}

const KIND_SET = new Set<string>(EVENT_KINDS);

export function assertKind(kind: string): EventKind {
  if (!KIND_SET.has(kind)) throw new Error(`unknown event kind: ${kind}`);
  return kind as EventKind;
}

function asPayload(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  }
  return {};
}

function asRow(record: Record<string, unknown>): EventRow {
  const created = record.created_at;
  const createdAt = created instanceof Date ? created.toISOString() : String(created);
  return {
    id: String(record.id),
    userId: record.user_id == null ? undefined : String(record.user_id),
    videoId: record.video_id == null ? undefined : String(record.video_id),
    kind: assertKind(String(record.kind)),
    payload: asPayload(record.payload),
    createdAt,
  };
}

export function createPostgresEventLog(db: Db): EventLog {
  return {
    async record(input) {
      assertKind(input.kind);
      await db.query(
        `INSERT INTO events (user_id, video_id, kind, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [input.userId ?? null, input.videoId ?? null, input.kind, JSON.stringify(input.payload ?? {})],
      );
    },
    async list(limit = 100) {
      const rows = await db.query(
        `SELECT id, user_id, video_id, kind, payload, created_at
           FROM events
          ORDER BY created_at DESC
          LIMIT $1`,
        [limit],
      );
      return rows.rows.map((row) => asRow(row));
    },
    async counts() {
      const rows = await db.query<{ kind: string; n: number | string }>(
        "SELECT kind, COUNT(*) AS n FROM events GROUP BY kind ORDER BY kind",
      );
      return rows.rows.map((row) => ({ kind: String(row.kind), n: Number(row.n) }));
    },
  };
}

export function createMemoryEventLog(): EventLog {
  const rows: EventRow[] = [];
  return {
    async record(input) {
      assertKind(input.kind);
      rows.push({
        id: crypto.randomUUID(),
        userId: input.userId,
        videoId: input.videoId,
        kind: input.kind,
        payload: input.payload ?? {},
        createdAt: new Date().toISOString(),
      });
    },
    async list(limit = 100) {
      return [...rows].reverse().slice(0, limit);
    },
    async counts() {
      const totals = new Map<string, number>();
      for (const row of rows) totals.set(row.kind, (totals.get(row.kind) ?? 0) + 1);
      return [...totals.entries()].map(([kind, n]) => ({ kind, n })).sort((a, b) => a.kind.localeCompare(b.kind));
    },
  };
}
