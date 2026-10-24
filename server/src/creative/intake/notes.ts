import type { Brief } from "@chotu/shared";

const NOTE_LINE = /^([a-z_]+):\s*(.*)$/;
/** Topic and regenerate feedback are real Brief / ScriptGenInput fields — not notes keys. */
const KEY_ORDER = ["product", "cast_request", "skipped"];

export function readNotes(notes?: string): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!notes) return fields;
  for (const line of notes.split("\n")) {
    const match = NOTE_LINE.exec(line.trim());
    if (!match?.[1]) continue;
    fields[match[1]] = (match[2] ?? "").trim();
  }
  return fields;
}

export function writeNotes(fields: Record<string, string>): string | undefined {
  const keys = [
    ...KEY_ORDER.filter((key) => key in fields),
    ...Object.keys(fields).filter((key) => !KEY_ORDER.includes(key)),
  ];
  const lines = keys
    .map((key) => {
      const value = fields[key]?.trim() ?? "";
      return value ? `${key}: ${value}` : "";
    })
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

export function noteValue(notes: string | undefined, key: string): string | undefined {
  const value = readNotes(notes)[key];
  return value ? value : undefined;
}

export function upsertNote(notes: string | undefined, key: string, value: string): string | undefined {
  const fields = readNotes(notes);
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean) delete fields[key];
  else fields[key] = clean;
  return writeNotes(fields);
}

export function skippedFields(notes?: string): Set<string> {
  const raw = noteValue(notes, "skipped") ?? "";
  return new Set(
    raw
      .split(",")
      .map((field) => field.trim())
      .filter((field) => field.length > 0),
  );
}

export function markSkipped(notes: string | undefined, field: string): string | undefined {
  const skipped = skippedFields(notes);
  skipped.add(field);
  return upsertNote(notes, "skipped", [...skipped].join(","));
}

export function topicOf(brief: Brief, fallback = "a short video"): string {
  const topic = brief.topic?.trim();
  return topic && topic.length > 0 ? topic : fallback;
}

export function productOf(brief: Brief, fallback = "the product"): string {
  return noteValue(brief.notes, "product") ?? fallback;
}

export function feedbackOf(feedback?: string): string | undefined {
  const clean = feedback?.trim().replace(/\s+/g, " ").slice(0, 280);
  return clean && clean.length > 0 ? clean : undefined;
}

/** Normalize regenerate feedback for ScriptGenInput / PromptGenInput.feedback. */
export function normalizeFeedback(feedback: string): string {
  return feedback.trim().replace(/\s+/g, " ").slice(0, 280);
}
