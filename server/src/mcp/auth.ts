import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import type { EnvLike } from "../media/flags.js";

let openWarned = false;

/** SHA-256 both sides so the compare stays constant-time for any length. */
export function keysMatch(presented: string, expected: string): boolean {
  const left = createHash("sha256").update(presented).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function presentedMcpKey(req: Request): string {
  const header = req.get("x-api-key")?.trim() ?? "";
  if (header) return header;
  const query = req.query.key;
  return typeof query === "string" ? query.trim() : "";
}

/** Open when `MCP_API_KEY` is blank. Otherwise require `X-API-Key` or `?key=`. */
export function mcpAuthorized(req: Request, env: EnvLike): boolean {
  const expected = env.MCP_API_KEY?.trim() ?? "";
  if (!expected) return true;
  const presented = presentedMcpKey(req);
  if (!presented) return false;
  return keysMatch(presented, expected);
}

/** One startup line when the connector is left open. Never includes the key. */
export function warnIfMcpOpen(env: EnvLike, warn: (message: string) => void = console.warn): void {
  if (env.MCP_API_KEY?.trim()) return;
  if (openWarned) return;
  openWarned = true;
  warn("MCP_API_KEY is unset; /mcp is open");
}
