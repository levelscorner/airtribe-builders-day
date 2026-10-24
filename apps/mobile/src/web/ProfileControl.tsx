import { useEffect, useState } from "react";
import type { OwnVideoSummary, User } from "@chotu/shared";
import { getStudioClient } from "../api";
import { loadOwnProfile } from "../profile/load";

/** Avatar and name in the top bar. Opens only this browser session's profile. */
export function ProfileControl() {
  const [user, setUser] = useState<User | null>(null);
  const [videos, setVideos] = useState<OwnVideoSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    getStudioClient()
      .getMe()
      .then((me) => {
        if (alive) setUser(me);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!user) return null;

  async function show() {
    setOpen(true);
    setError("");
    try {
      const loaded = await loadOwnProfile(getStudioClient());
      setUser(loaded.user);
      setVideos(loaded.videos);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open your profile.");
    }
  }

  return (
    <>
      <button type="button" className="profile-button" onClick={() => void show()} aria-haspopup="dialog">
        <span className="profile-avatar" aria-hidden="true">
          {user.displayName.slice(0, 1).toUpperCase()}
        </span>
        <span>{user.displayName}</span>
      </button>
      {open ? (
        <div className="profile-sheet" role="dialog" aria-label="Your profile">
          <p>
            <strong>{user.displayName}</strong>
          </p>
          <p>Email or phone: {user.phoneOrEmail || "—"}</p>
          <p>Signed up: {user.createdAt}</p>
          <h2>Videos</h2>
          {videos.length ? (
            <ul>
              {videos.map((video) => (
                <li key={video.id}>
                  {video.title || "Untitled"} · {video.status}
                </li>
              ))}
            </ul>
          ) : (
            <p>No videos yet.</p>
          )}
          {error ? <p role="alert">{error}</p> : null}
          <button type="button" onClick={() => setOpen(false)}>
            Close
          </button>
        </div>
      ) : null}
    </>
  );
}
