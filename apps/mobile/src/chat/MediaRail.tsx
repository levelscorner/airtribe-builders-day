import { StyleSheet, Text, View } from "react-native";
import type { ApprovalCardMessage, ChatMessage } from "@chotu/shared";
import type { MediaProgressEvent } from "../media-contract";
import { progressCopy } from "../media-contract";
import { MockMeter, PlayerCard } from "../screens/PlayerCard";
import { colors } from "../theme";
import { ImageFrame } from "./MediaFrames";

const MEDIA = new Set(["sheet", "anchor", "voice_sample", "image", "clip", "audio", "final"]);

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function latestMedia(messages: ChatMessage[]): ApprovalCardMessage | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.kind === "approval" && MEDIA.has(message.artefactKind)) return message;
  }
  return undefined;
}

function RailBody({ message }: { message: ApprovalCardMessage }) {
  const preview = message.preview;
  if (message.artefactKind === "clip" || message.artefactKind === "final") {
    const url = str(preview.url) ?? `mock://${message.artefactKind}/${message.artefactId}`;
    return <PlayerCard embedded title={message.title} url={url} durationMs={num(preview.durationMs)} />;
  }
  if (message.artefactKind === "audio" || message.artefactKind === "voice_sample") {
    return <MockMeter durationMs={num(preview.durationMs) ?? 2400} label={message.title} />;
  }
  return <ImageFrame large label={str(preview.sceneTitle) ?? message.title} swatch={str(preview.swatch)} />;
}

/** Desktop rail. Phone screens keep the same players inside the approval card. */
export function MediaRail({
  messages,
  progress,
}: {
  messages: ChatMessage[];
  progress: Record<string, MediaProgressEvent>;
}) {
  const message = latestMedia(messages);
  const ticks = Object.values(progress);
  return (
    <View style={styles.rail} accessibilityLabel="Media and progress">
      <Text style={styles.kicker}>Media</Text>
      {message ? (
        <View style={styles.block}>
          <Text style={styles.title}>{message.title}</Text>
          <RailBody message={message} />
          {progress[message.artefactId] ? (
            <Text style={styles.meta}>{progressCopy(progress[message.artefactId])}</Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.meta}>Abhi koi media nahi. Cast sheet ya image yahan dikhegi.</Text>
      )}
      {ticks.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.kicker}>Jobs</Text>
          {ticks.map((tick) => (
            <Text key={tick.artefactId} style={tick.status === "failed" ? styles.bad : styles.meta}>
              {tick.kind} · {progressCopy(tick)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    gap: 12,
    paddingBottom: 16,
  },
  block: {
    gap: 8,
  },
  kicker: {
    fontSize: 13,
    letterSpacing: 0.6,
    fontWeight: "700",
    color: colors.inkSoft,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  meta: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  bad: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.danger,
  },
});
