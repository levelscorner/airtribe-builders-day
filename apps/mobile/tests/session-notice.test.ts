import assert from "node:assert/strict";
import test from "node:test";
import {
  dismissSessionNotice,
  hasBrowserSession,
  isMissingSession,
  rememberBrowserSession,
  shouldShowSessionNotice,
  type FlagStore,
} from "../src/web/session-notice.ts";

function memoryStore(): FlagStore {
  const values = new Map<string, string>();
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
    },
  };
}

test("the signup notice is only for a missing session", () => {
  assert.equal(isMissingSession({ code: "signup_required", message: "signup_required", status: 401 }), true);
  assert.equal(isMissingSession({ code: "no_user", message: "Pehle naam aur email se shuru karo." }), true);
  assert.equal(isMissingSession("signup_required"), true);
  assert.equal(isMissingSession({ code: "not_found", message: "not_found", status: 404 }), false);
  assert.equal(isMissingSession({ status: 401, code: "admin_required", message: "admin_required" }), false);
  assert.equal(isMissingSession("Higgsfield could not authenticate this request."), false);
});

test("the notice shows once, then stays hidden after dismiss or signup", () => {
  const store = memoryStore();
  assert.equal(shouldShowSessionNotice(store), true);
  dismissSessionNotice(store);
  assert.equal(shouldShowSessionNotice(store), false);

  const signedIn = memoryStore();
  rememberBrowserSession(signedIn);
  assert.equal(hasBrowserSession(signedIn), true);
  assert.equal(shouldShowSessionNotice(signedIn), false);
  dismissSessionNotice(signedIn);
  assert.equal(shouldShowSessionNotice(signedIn), false);
});
