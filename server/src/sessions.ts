/**
 * Per-browser sessions: httpOnly signed cookie → in-memory session id → user id.
 * Enough for MOCK/demo; Mars can swap for Redis later.
 */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  renameSync,
} from "node:fs";
import { dirname } from "node:path";
import type { NextFunction, Request, Response } from "express";

export const SESSION_COOKIE = "chotu_sid";

export type BrowserSession = {
  id: string;
  userId: string | null;
};

type SessionStore = Map<string, BrowserSession>;
const saveStore = new WeakMap<SessionStore, () => void>();
const sessionStore = new WeakMap<BrowserSession, SessionStore>();

declare global {
  namespace Express {
    interface Request {
      browserSession?: BrowserSession;
    }
  }
}

function secret(): string {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.CHOTU_SESSION_SECRET?.trim() ||
    "chotu-dev-session-secret-change-me"
  );
}

function sign(sessionId: string): string {
  return createHmac("sha256", secret()).update(sessionId).digest("base64url");
}

function pack(sessionId: string): string {
  return `${sessionId}.${sign(sessionId)}`;
}

function unpack(raw: string | undefined): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const sessionId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  const expected = sign(sessionId);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return sessionId;
}

function parseCookieHeader(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(value);
  }
  return out;
}

export function createSessionStore(file?: string): SessionStore {
  const store: SessionStore = new Map();
  if (file && existsSync(file)) {
    const sessions: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!Array.isArray(sessions))
      throw new Error("Local session store is unreadable");
    for (const row of sessions)
      if (
        row &&
        typeof row.id === "string" &&
        (row.userId === null || typeof row.userId === "string")
      ) {
        store.set(row.id, row);
        sessionStore.set(row, store);
      }
  }
  if (file)
    saveStore.set(store, () => {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(`${file}.tmp`, JSON.stringify([...store.values()]), {
        mode: 0o600,
      });
      renameSync(`${file}.tmp`, file);
    });
  return store;
}

export function createSessionMiddleware(store: SessionStore) {
  return function sessionMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    const cookies = parseCookieHeader(req.headers.cookie);
    const sessionId = unpack(cookies[SESSION_COOKIE]);
    let session = sessionId ? store.get(sessionId) : undefined;
    if (!session) {
      const id = randomUUID();
      session = { id, userId: null };
      store.set(id, session);
      sessionStore.set(session, store);
      saveStore.get(store)?.();
      writeSessionCookie(req, res, id);
    }
    req.browserSession = session;
    next();
  };
}

export function writeSessionCookie(
  req: Request,
  res: Response,
  sessionId: string,
): void {
  const secure = req.secure || req.headers["x-forwarded-proto"] === "https";
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(pack(sessionId))}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${60 * 60 * 24 * 30}`,
  ];
  if (secure) parts.push("Secure");
  res.append("Set-Cookie", parts.join("; "));
}

/** Bind the current browser session to a user (signup). */
export function bindSessionUser(req: Request, userId: string): void {
  const session = req.browserSession;
  if (!session) throw new Error("session_missing");
  session.userId = userId;
  const store = sessionStore.get(session);
  if (store) saveStore.get(store)?.();
}

export function requireSessionUser(req: Request, res: Response): string | null {
  const userId = req.browserSession?.userId ?? null;
  if (!userId) {
    res.status(401).json({ error: "signup_required" });
    return null;
  }
  return userId;
}
