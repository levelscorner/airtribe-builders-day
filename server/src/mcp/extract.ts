/**
 * Parse MCP CallToolResult-like payloads for asset URLs and async job ids.
 */

export type CallToolResultLike = {
  content?: Array<{
    type?: string;
    text?: string;
    data?: string;
    mimeType?: string;
    resource?: { uri?: string; mimeType?: string; text?: string };
  }>;
  isError?: boolean;
  // some servers nest JSON
  structuredContent?: unknown;
};

const URL_RE = /https?:\/\/[^\s"'<>\]}\\]+/gi;
const JOB_ID_RE =
  /(?:job[_-]?id|request[_-]?id|generation[_-]?id|task[_-]?id|id)\s*[:=]\s*["']?([a-zA-Z0-9_-]{6,})/i;

export function toolResultToText(result: unknown): string {
  if (result == null) return "";
  if (typeof result === "string") return result;
  const r = result as CallToolResultLike;
  const parts: string[] = [];
  if (Array.isArray(r.content)) {
    for (const c of r.content) {
      if (c.text) parts.push(c.text);
      if (c.resource?.uri) parts.push(c.resource.uri);
      if (c.resource?.text) parts.push(c.resource.text);
      if (c.data && c.mimeType?.startsWith("audio/")) {
        parts.push(`data:${c.mimeType};base64,${c.data}`);
      }
    }
  }
  if (r.structuredContent) {
    try {
      parts.push(JSON.stringify(r.structuredContent));
    } catch {
      /* ignore */
    }
  }
  if (parts.length === 0) {
    try {
      return JSON.stringify(result);
    } catch {
      return String(result);
    }
  }
  return parts.join("\n");
}

export function extractUrls(result: unknown, preferExt?: string[]): string[] {
  const text = toolResultToText(result);
  const found = text.match(URL_RE) ?? [];
  const cleaned = found.map((u) => u.replace(/[.,;)]+$/, ""));
  if (!preferExt?.length) return [...new Set(cleaned)];
  const preferred = cleaned.filter((u) =>
    preferExt.some((ext) => u.toLowerCase().includes(`.${ext.toLowerCase()}`) || u.toLowerCase().includes(ext.toLowerCase())),
  );
  return [...new Set(preferred.length ? preferred : cleaned)];
}

export function extractJobId(result: unknown): string | undefined {
  const text = toolResultToText(result);
  const m = text.match(JOB_ID_RE);
  if (m?.[1]) return m[1];
  // JSON-ish "request_id":"..."
  try {
    const obj = typeof result === "object" && result ? (result as Record<string, unknown>) : JSON.parse(text);
    const candidates = ["request_id", "job_id", "generation_id", "task_id", "id"];
    for (const k of candidates) {
      const v = (obj as Record<string, unknown>)?.[k];
      if (typeof v === "string" && v.length >= 6) return v;
    }
    const nested = (obj as { structuredContent?: Record<string, unknown> })?.structuredContent;
    if (nested) {
      for (const k of candidates) {
        const v = nested[k];
        if (typeof v === "string" && v.length >= 6) return v;
      }
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function isReadyAssetUrl(url: string): boolean {
  const u = url.toLowerCase();
  if (u.startsWith("data:")) return true;
  return (
    u.includes(".png") ||
    u.includes(".jpg") ||
    u.includes(".jpeg") ||
    u.includes(".webp") ||
    u.includes(".gif") ||
    u.includes(".mp4") ||
    u.includes(".webm") ||
    u.includes(".mp3") ||
    u.includes(".wav") ||
    u.includes("/files/") ||
    u.includes("cdn.") ||
    u.includes("storage")
  );
}
