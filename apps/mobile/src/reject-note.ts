import type { ApprovalCardMessage } from "@chotu/shared";

/**
 * `RejectArtefactRequest.rejectNote` is the typed name.
 * `ApprovalCardMessage` does not include it yet, so the shell keeps the
 * string on the card object and out of `preview`.
 */
export type ApprovalWithNote = ApprovalCardMessage & { rejectNote?: string };

export function rejectNoteValue(payload: Record<string, unknown>): string | undefined {
  const typed = payload.rejectNote;
  if (typeof typed === "string" && typed.trim()) return typed.trim();
  const legacy = payload.rejectionNote;
  if (typeof legacy === "string" && legacy.trim()) return legacy.trim();
  return undefined;
}

export function previewWithoutNote(payload: Record<string, unknown>): Record<string, unknown> {
  const preview = { ...payload };
  delete preview.rejectNote;
  delete preview.rejectionNote;
  return preview;
}

export function readRejectNote(message: ApprovalWithNote): string | undefined {
  return typeof message.rejectNote === "string" && message.rejectNote.trim() ? message.rejectNote.trim() : undefined;
}

export function applyRejectNote<T extends ApprovalCardMessage>(message: T, payload: Record<string, unknown>): T {
  const next: ApprovalWithNote = {
    ...message,
    preview: previewWithoutNote(payload),
    rejectNote: rejectNoteValue(payload),
  };
  return next as T;
}
