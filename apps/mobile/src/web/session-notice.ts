const HAS_SESSION = "chotu-has-session";
const DISMISSED = "chotu-session-notice-dismissed";

export interface FlagStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** Browser tab memory. Missing or blocked storage just hides nothing extra. */
export function browserFlagStore(): FlagStore {
  return {
    get(key) {
      try {
        return globalThis.sessionStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        globalThis.sessionStorage?.setItem(key, value);
      } catch {
        // Private mode can reject storage. The in-memory React state still closes the notice.
      }
    },
  };
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * A missing demo session, not a provider 401 or a failed generation.
 * The API body is `signup_required`. The mock studio uses `no_user`.
 */
export function isMissingSession(error: unknown): boolean {
  if (typeof error === "string") {
    return error === "signup_required" || error === "no_user" || error === "Sign up required";
  }
  if (!error || typeof error !== "object") return false;
  const record = error as { code?: unknown; message?: unknown };
  const code = text(record.code);
  const message = error instanceof Error ? error.message : text(record.message);
  return (
    code === "signup_required" ||
    code === "no_user" ||
    message === "signup_required" ||
    message === "no_user" ||
    message === "Sign up required"
  );
}

export function hasBrowserSession(store: FlagStore = browserFlagStore()): boolean {
  return store.get(HAS_SESSION) === "1";
}

export function sessionNoticeDismissed(store: FlagStore = browserFlagStore()): boolean {
  return store.get(DISMISSED) === "1";
}

/** True only before signup and before the visitor dismisses the notice. */
export function shouldShowSessionNotice(store: FlagStore = browserFlagStore()): boolean {
  return !hasBrowserSession(store) && !sessionNoticeDismissed(store);
}

export function rememberBrowserSession(store: FlagStore = browserFlagStore()): void {
  store.set(HAS_SESSION, "1");
}

export function dismissSessionNotice(store: FlagStore = browserFlagStore()): void {
  store.set(DISMISSED, "1");
}
