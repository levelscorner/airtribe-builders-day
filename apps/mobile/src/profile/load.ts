import type { OwnVideoSummary, User } from "@chotu/shared";
import type { StudioClient } from "../studio-client";

/**
 * The signed-in profile. Callers cannot pass another user's id:
 * both requests are the session's own GET /v1/me and GET /v1/me/videos.
 */
export async function loadOwnProfile(
  client: Pick<StudioClient, "getMe" | "listMyVideos">,
): Promise<{ user: User; videos: OwnVideoSummary[] }> {
  const [user, listed] = await Promise.all([client.getMe(), client.listMyVideos()]);
  return { user, videos: listed.videos };
}
