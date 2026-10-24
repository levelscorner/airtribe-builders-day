import assert from "node:assert/strict";
import test from "node:test";
import type { OwnVideoSummary, User } from "@chotu/shared";
import { loadOwnProfile } from "../src/profile/load.ts";

test("the profile sheet loads only the signed-in user and their videos", async () => {
  const calls: string[] = [];
  const user: User = {
    id: "user-asha",
    displayName: "Asha",
    phoneOrEmail: "asha@example.com",
    creditBalance: 10,
    createdAt: "2026-01-02T03:04:05.000Z",
  };
  const videos: OwnVideoSummary[] = [
    { id: "video-1", title: "Bees", status: "active", stage: "brief", createdAt: user.createdAt },
  ];
  const loaded = await loadOwnProfile({
    async getMe() {
      calls.push("me");
      return user;
    },
    async listMyVideos() {
      calls.push("videos");
      return { videos };
    },
  });
  assert.deepEqual(calls.sort(), ["me", "videos"]);
  assert.equal(loaded.user.displayName, "Asha");
  assert.equal(loaded.user.phoneOrEmail, "asha@example.com");
  assert.equal(loaded.videos[0]?.status, "active");
  assert.equal(JSON.stringify(loaded).includes("other@example.com"), false);
});
