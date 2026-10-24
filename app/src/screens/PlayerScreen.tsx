import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Image,
  Platform,
  Share,
  Linking,
  ScrollView,
} from "react-native";
import { Audio, Video, ResizeMode } from "expo-av";
import * as Clipboard from "expo-clipboard";
import { colors } from "../theme";
import { approveFinal, type JobPublic, type UserPublic } from "../api";

type Props = {
  job: JobPublic;
  user: UserPublic;
  onAgain: () => void;
  onUpdated: (job: JobPublic) => void;
};

export function PlayerScreen({ job: initial, user, onAgain, onUpdated }: Props) {
  const [job, setJob] = useState(initial);
  const useSlideshow = job.slideshowFallback || !job.videoUrl;
  const [sceneIdx, setSceneIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    setJob(initial);
  }, [initial]);

  useEffect(() => {
    if (!useSlideshow || !job.publishUnlocked) return;
    let cancelled = false;
    async function playScene(i: number) {
      const scene = job.scenes[i];
      if (!scene?.audioUrl || cancelled) return;
      try {
        await soundRef.current?.unloadAsync();
        const { sound } = await Audio.Sound.createAsync({ uri: scene.audioUrl }, { shouldPlay: true });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((st) => {
          if (!st.isLoaded) return;
          if (st.didJustFinish) {
            const next = i + 1;
            if (next < job.scenes.length) setSceneIdx(next);
          }
        });
      } catch {
        /* ignore */
      }
    }
    playScene(sceneIdx);
    return () => {
      cancelled = true;
    };
  }, [useSlideshow, sceneIdx, job.scenes, job.publishUnlocked]);

  useEffect(() => () => {
    void soundRef.current?.unloadAsync();
  }, []);

  async function onApproveFinal() {
    setApproving(true);
    setError(null);
    try {
      const j = await approveFinal(job.id, user.id);
      setJob(j);
      onUpdated(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  }

  const shareUrl = job.videoUrl || job.scenes[0]?.imageUrl || "";

  async function onShare() {
    if (!job.publishUnlocked || !shareUrl) return;
    try {
      if (Platform.OS === "web") {
        await Clipboard.setStringAsync(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        await Share.share({ message: shareUrl, url: shareUrl });
      }
    } catch {
      await Clipboard.setStringAsync(shareUrl);
      setCopied(true);
    }
  }

  async function onDownload() {
    if (!job.publishUnlocked || !job.videoUrl) return;
    if (Platform.OS === "web") window.open(job.videoUrl, "_blank");
    else await Linking.openURL(job.videoUrl);
  }

  const scene = job.scenes[sceneIdx];
  const needsFinal = job.status === "awaiting_final_approval" && !job.publishUnlocked;

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.brand}>Chotu Studio</Text>
      <Text style={styles.title}>{job.script?.title ?? job.topic}</Text>
      <Text style={styles.note}>
        {needsFinal
          ? "Preview ready — approve the final cut to unlock download"
          : job.publishUnlocked
            ? useSlideshow
              ? "Published (slideshow)"
              : "Published · 9:16 MP4"
            : "Working…"}
      </Text>

      <View style={styles.stage}>
        {useSlideshow ? (
          <>
            {scene?.imageUrl ? (
              <Image source={{ uri: scene.imageUrl }} style={styles.media} resizeMode="cover" />
            ) : (
              <View style={[styles.media, styles.placeholder]} />
            )}
            <View style={styles.captionBox}>
              <Text style={styles.caption}>{scene?.caption ?? scene?.narration}</Text>
            </View>
          </>
        ) : (
          <Video
            style={styles.media}
            source={{ uri: job.videoUrl! }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={job.publishUnlocked || needsFinal}
            isLooping
          />
        )}
      </View>

      {needsFinal ? (
        <Pressable style={styles.cta} onPress={onApproveFinal} disabled={approving}>
          <Text style={styles.ctaText}>{approving ? "Saving…" : "Approve final cut & unlock download"}</Text>
        </Pressable>
      ) : null}

      {error ? <Text style={styles.warn}>{error}</Text> : null}

      <View style={styles.actions}>
        {job.publishUnlocked && job.videoUrl ? (
          <Pressable style={styles.btnSecondary} onPress={onDownload}>
            <Text style={styles.btnSecondaryText}>Download</Text>
          </Pressable>
        ) : null}
        {job.publishUnlocked ? (
          <Pressable style={styles.btnSecondary} onPress={onShare}>
            <Text style={styles.btnSecondaryText}>{copied ? "Link copied" : "Share link"}</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.btnPrimary} onPress={onAgain}>
          <Text style={styles.btnPrimaryText}>Make another</Text>
        </Pressable>
      </View>

      <Text style={styles.actTitle}>Agent activity</Text>
      {(job.activity ?? []).slice().reverse().slice(0, 12).map((a) => (
        <Text key={a.id} style={styles.actLine}>
          {a.at.slice(11, 19)} · {a.node}
          {a.tool ? `/${a.tool}` : ""} · {a.status}
          {a.message ? ` — ${a.message}` : ""}
        </Text>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 48, paddingBottom: 40, backgroundColor: colors.paper },
  brand: { fontFamily: "serif", fontSize: 24, fontWeight: "700", color: colors.tealDeep },
  title: { marginTop: 10, fontFamily: "serif", fontSize: 20, color: colors.ink },
  note: { marginTop: 4, fontSize: 13, color: colors.inkSoft },
  stage: {
    marginTop: 16,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: colors.ink,
    minHeight: 380,
  },
  media: { width: "100%", minHeight: 380 },
  placeholder: { backgroundColor: colors.tealDeep },
  captionBox: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 40,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 14,
    padding: 14,
  },
  caption: { color: colors.cream, fontSize: 15, lineHeight: 21, textAlign: "center", fontWeight: "600" },
  cta: {
    marginTop: 16,
    backgroundColor: colors.coral,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: colors.cream, fontWeight: "700", textAlign: "center", paddingHorizontal: 8 },
  actions: { marginTop: 14, gap: 10 },
  btnPrimary: {
    backgroundColor: colors.teal,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnPrimaryText: { color: colors.cream, fontWeight: "700", fontSize: 16 },
  btnSecondary: {
    borderWidth: 1.5,
    borderColor: colors.teal,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.cream,
  },
  btnSecondaryText: { color: colors.tealDeep, fontWeight: "700", fontSize: 15 },
  warn: { marginTop: 10, fontSize: 12, color: colors.warn },
  actTitle: {
    marginTop: 24,
    fontSize: 12,
    fontWeight: "700",
    color: colors.teal,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  actLine: { marginTop: 6, fontSize: 11, color: colors.inkSoft, lineHeight: 16 },
});
