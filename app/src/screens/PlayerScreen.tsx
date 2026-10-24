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
} from "react-native";
import { Audio, Video, ResizeMode } from "expo-av";
import * as Clipboard from "expo-clipboard";
import { colors } from "../theme";
import type { JobPublic } from "../api";

type Props = {
  job: JobPublic;
  onAgain: () => void;
};

export function PlayerScreen({ job, onAgain }: Props) {
  const useSlideshow = job.slideshowFallback || !job.videoUrl;
  const [sceneIdx, setSceneIdx] = useState(0);
  const [copied, setCopied] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    if (!useSlideshow) return;
    let cancelled = false;

    async function playScene(i: number) {
      const scene = job.scenes[i];
      if (!scene?.audioUrl || cancelled) return;
      try {
        await soundRef.current?.unloadAsync();
        const { sound } = await Audio.Sound.createAsync(
          { uri: scene.audioUrl },
          { shouldPlay: true },
        );
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((st) => {
          if (!st.isLoaded) return;
          if (st.didJustFinish) {
            const next = i + 1;
            if (next < job.scenes.length) setSceneIdx(next);
          }
        });
      } catch {
        /* ignore playback errors in demo */
      }
    }

    playScene(sceneIdx);
    return () => {
      cancelled = true;
    };
  }, [useSlideshow, sceneIdx, job.scenes]);

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
    };
  }, []);

  const shareUrl = job.videoUrl || job.scenes[0]?.imageUrl || "";

  async function onShare() {
    if (!shareUrl) return;
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
    if (!job.videoUrl) return;
    if (Platform.OS === "web") {
      window.open(job.videoUrl, "_blank");
    } else {
      await Linking.openURL(job.videoUrl);
    }
  }

  const scene = job.scenes[sceneIdx];

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>Chotu mini</Text>
      <Text style={styles.title}>{job.script?.title ?? job.topic}</Text>
      {useSlideshow ? (
        <Text style={styles.note}>Slideshow fallback — images + voice + captions</Text>
      ) : (
        <Text style={styles.note}>9:16 MP4 ready</Text>
      )}

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
            <Text style={styles.sceneMeta}>
              Scene {sceneIdx + 1} / {job.scenes.length}
            </Text>
          </>
        ) : (
          <Video
            style={styles.media}
            source={{ uri: job.videoUrl! }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            isLooping
          />
        )}
      </View>

      <View style={styles.actions}>
        {job.videoUrl ? (
          <Pressable style={styles.btnSecondary} onPress={onDownload}>
            <Text style={styles.btnSecondaryText}>Download</Text>
          </Pressable>
        ) : null}
        <Pressable style={styles.btnSecondary} onPress={onShare}>
          <Text style={styles.btnSecondaryText}>{copied ? "Link copied" : "Share link"}</Text>
        </Pressable>
        <Pressable style={styles.btnPrimary} onPress={onAgain}>
          <Text style={styles.btnPrimaryText}>Make another</Text>
        </Pressable>
      </View>

      {job.error && useSlideshow ? <Text style={styles.warn}>{job.error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 48,
    paddingBottom: 32,
    backgroundColor: colors.paper,
  },
  brand: {
    fontFamily: "serif",
    fontSize: 24,
    fontWeight: "700",
    color: colors.tealDeep,
  },
  title: {
    marginTop: 10,
    fontFamily: "serif",
    fontSize: 22,
    color: colors.ink,
  },
  note: {
    marginTop: 4,
    fontSize: 13,
    color: colors.inkSoft,
  },
  stage: {
    marginTop: 18,
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: colors.ink,
    minHeight: 420,
  },
  media: {
    width: "100%",
    flex: 1,
    minHeight: 420,
  },
  placeholder: {
    backgroundColor: colors.tealDeep,
  },
  captionBox: {
    position: "absolute",
    left: 16,
    right: 16,
    bottom: 48,
    backgroundColor: "rgba(0,0,0,0.55)",
    borderRadius: 14,
    padding: 14,
  },
  caption: {
    color: colors.cream,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    fontWeight: "600",
  },
  sceneMeta: {
    position: "absolute",
    top: 12,
    right: 12,
    color: colors.cream,
    fontSize: 12,
    opacity: 0.85,
  },
  actions: {
    marginTop: 16,
    gap: 10,
  },
  btnPrimary: {
    backgroundColor: colors.coral,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnPrimaryText: {
    color: colors.cream,
    fontWeight: "700",
    fontSize: 16,
  },
  btnSecondary: {
    borderWidth: 1.5,
    borderColor: colors.teal,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.cream,
  },
  btnSecondaryText: {
    color: colors.tealDeep,
    fontWeight: "700",
    fontSize: 15,
  },
  warn: {
    marginTop: 10,
    fontSize: 12,
    color: colors.warn,
  },
});
