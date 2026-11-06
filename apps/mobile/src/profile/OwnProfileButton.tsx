import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { formatIst, formatLastActive, type OwnVideoSummary, type User } from "@chotu/shared";
import { getStudioClient } from "../api";
import { colors, hitSlop, layout } from "../theme";
import { loadOwnProfile } from "./load";

/** Avatar and name. The sheet is filled from this session only. */
export function OwnProfileButton() {
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
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${user.displayName}, open profile`}
        hitSlop={hitSlop}
        onPress={() => void show()}
        style={styles.button}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{user.displayName.slice(0, 1).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{user.displayName}</Text>
      </Pressable>
      <Modal visible={open} animationType="fade" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View accessibilityLabel="Your profile" style={styles.sheet}>
            <Text style={styles.title}>{user.displayName}</Text>
            <Text style={styles.line}>Email or phone: {user.phoneOrEmail || "—"}</Text>
            <Text style={styles.line}>Signed up: {formatIst(user.createdAt)}</Text>
            <Text style={styles.line}>Last active: {formatLastActive(user.lastActiveAt, user.createdAt)}</Text>
            <Text style={styles.heading}>Videos</Text>
            {videos.length ? (
              videos.map((video) => (
                <Text key={video.id} style={styles.line}>
                  {video.title || "Untitled"} · {video.status}
                </Text>
              ))
            ) : (
              <Text style={styles.line}>No videos yet.</Text>
            )}
            {error ? <Text accessibilityRole="alert">{error}</Text> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Close profile" onPress={() => setOpen(false)} style={styles.close}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: layout.hit,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    color: colors.paper,
    fontWeight: "700",
  },
  name: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: "600",
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(28,25,21,0.35)",
    justifyContent: "center",
    padding: layout.pad,
  },
  sheet: {
    backgroundColor: colors.card,
    padding: layout.pad,
    gap: 8,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
  },
  heading: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  line: {
    fontSize: 16,
    color: colors.ink,
  },
  close: {
    minHeight: layout.hit,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
    marginTop: 8,
  },
  closeText: {
    color: colors.paper,
    fontWeight: "700",
  },
});
