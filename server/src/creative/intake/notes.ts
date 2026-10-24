import type { Brief } from "@chotu/shared";

const NOTE_LINE = /^([a-z_]+):\s*(.*)$/;
const KEY_ORDER = ["topic", "product", "feedback", "cast_request", "skipped"];

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
  return noteValue(brief.notes, "topic") ?? fallback;
}

export function productOf(brief: Brief, fallback = "the product"): string {
  return noteValue(brief.notes, "product") ?? fallback;
}

export function feedbackOf(brief: Brief): string | undefined {
  return noteValue(brief.notes, "feedback");
}

/** Regenerate feedback rides in Brief.notes. The shared ScriptGen input has no feedback field. */
export function withFeedback(brief: Brief, feedback: string): Brief {
  const clean = feedback.trim().replace(/\s+/g, " ").slice(0, 280);
  return { ...brief, notes: upsertNote(brief.notes, "feedback", clean) };
}
