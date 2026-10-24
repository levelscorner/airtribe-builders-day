import { callMcpTool, type DiscoveredTools } from "./client.js";
import { extractJobId, extractUrls, isReadyAssetUrl, toolResultToText } from "./extract.js";

export interface PollOptions {
  tools: DiscoveredTools;
  statusToolName: string;
  statusAliases?: string[];
  /** Args builder given a job id from the generate result */
  statusArgs: (jobId: string) => Record<string, unknown>;
  timeoutMs?: number;
  intervalMs?: number;
  preferExt?: string[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * From a generate tool result: return a ready asset URL, or poll a status tool until one appears.
 */
export async function resolveAssetUrlFromToolResult(
  generateResult: unknown,
  poll: PollOptions | null,
): Promise<string> {
  const immediate = extractUrls(generateResult, poll?.preferExt).find(isReadyAssetUrl);
  if (immediate) return immediate;

  const jobId = extractJobId(generateResult);
  if (!poll || !jobId) {
    // Last resort: any URL
    const any = extractUrls(generateResult)[0];
    if (any) return any;
    throw new Error(`MCP generate returned no asset URL or job id. Got: ${toolResultToText(generateResult).slice(0, 400)}`);
  }

  const timeoutMs = poll.timeoutMs ?? 180_000;
  const intervalMs = poll.intervalMs ?? 3_000;
  const started = Date.now();
  let last = "";

  while (Date.now() - started < timeoutMs) {
    const { result } = await callMcpTool(
      poll.tools,
      poll.statusToolName,
      poll.statusArgs(jobId),
      poll.statusAliases ?? ["status", "get_generation", "get_request", "check_status"],
    );
    last = toolResultToText(result);
    const url = extractUrls(result, poll.preferExt).find(isReadyAssetUrl) ?? extractUrls(result)[0];
    if (url && isReadyAssetUrl(url)) return url;
    // terminal failure hints
    if (/failed|error|nsfw|canceled|cancelled/i.test(last) && !/queued|progress|pending|running/i.test(last)) {
      throw new Error(`MCP job ${jobId} failed: ${last.slice(0, 400)}`);
    }
    await sleep(intervalMs);
  }

  throw new Error(`Timed out waiting for MCP job ${jobId}. Last: ${last.slice(0, 300)}`);
}

/** One retry wrapper for flaky MCP generations. */
export async function withOneRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[mcp] ${label} failed once, retrying:`, err instanceof Error ? err.message : err);
    return await fn();
  }
}
