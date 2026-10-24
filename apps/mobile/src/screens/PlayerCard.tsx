import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, hitSlop, layout } from "../theme";

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function MockMeter({
  durationMs,
  label,
}: {
  durationMs: number;
  label: string;
}) {
  const safe = Math.max(1000, durationMs);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);

  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(() => {
      setPosition((current) => {
        const next = current + 200;
        if (next >= safe) {
          setPlaying(false);
          return safe;
        }
        return next;
      });
    }, 200);
    return () => clearInterval(timer);
  }, [playing, safe]);

  const fraction = Math.min(1, position / safe);
  return (
    <View style={styles.meter}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={playing ? `Pause ${label}` : `Play ${label}`}
        accessibilityState={{ selected: playing }}
        hitSlop={hitSlop}
        onPress={() => {
          if (position >= safe) setPosition(0);
          setPlaying((value) => !value);
        }}
        style={styles.play}
      >
        <Text style={styles.playText}>{playing ? "Pause" : "Play"}</Text>
      </Pressable>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fraction * 100}%` }]} />
      </View>
      <Text style={styles.time}>
        {clock(position)} / {clock(safe)}
      </Text>
    </View>
  );
}

export function PlayerCard({
  title,
  url,
  durationMs,
}: {
  title: string;
  url: string;
  durationMs?: number;
}) {
  const local = url.startsWith("mock://");
  return (
    <View style={styles.card} accessibilityLabel="Video player">
      <Text style={styles.stamp}>VIDEO</Text>
      <Text style={styles.title}>{title}</Text>
      <View style={styles.poster}>
        <Text style={styles.posterText}>{local ? "Mock frame" : "Preview band"}</Text>
      </View>
      {local ? (
        <MockMeter durationMs={durationMs ?? 8000} label="Video" />
      ) : (
        <Text style={styles.note}>Yeh link yahin nahi chalega.</Text>
      )}
      <Text style={styles.note}>
        Mock preview. Asli MP4 download server se aayegi. Captions narration par hain.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: colors.ink,
    padding: layout.pad,
    gap: 10,
  },
  stamp: {
    fontSize: 13,
    letterSpacing: 1.2,
    color: colors.inkSoft,
    fontWeight: "700",
  },
  title: {
    fontSize: 20,
    color: colors.ink,
    fontWeight: "700",
  },
  poster: {
    aspectRatio: 9 / 16,
    maxHeight: 220,
    backgroundColor: colors.swatch.clay,
    alignItems: "center",
    justifyContent: "center",
  },
  posterText: {
    fontSize: 18,
    color: colors.ink,
  },
  note: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  meter: {
    gap: 8,
  },
  play: {
    minHeight: layout.hit,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.ink,
    paddingHorizontal: 12,
  },
  playText: {
    fontSize: 18,
    color: colors.ink,
    fontWeight: "700",
  },
  track: {
    height: 6,
    backgroundColor: colors.chip,
  },
  fill: {
    height: 6,
    backgroundColor: colors.ink,
  },
  time: {
    fontSize: 15,
    color: colors.inkSoft,
  },
});
