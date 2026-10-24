import { memo, useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { ArtefactState, ArtefactSummary, ChatMessage, RegeneratePreviewResponse, VoicePreset } from "@chotu/shared";
import type { MediaProgressEvent, RegenerateSceneRequest } from "../media-contract";
import { PlayerCard } from "../screens/PlayerCard";
import { colors } from "../theme";
import { ApprovalCard } from "./ApprovalCard";
import { openQuestion } from "./open-question";
import { QuestionCard } from "./QuestionCard";
import { Storyboard } from "./Storyboard";

interface Actions {
  onOption: (field: string, optionId: string) => void;
  onOptions: (field: string, optionIds: string[]) => void;
  onSkip: (field: string) => void;
  onDefaults: (field: string) => void;
  onApprove: (artefactId: string) => void;
  onReject: (artefactId: string, note: string) => void;
  onPreviewRegenerate: (artefactId: string) => Promise<RegeneratePreviewResponse>;
  onConfirmRegenerate: (artefactId: string, feedback?: string) => void;
  onPreviewScene: (artefactId: string, scope: RegenerateSceneRequest) => Promise<RegeneratePreviewResponse>;
  onConfirmScene: (artefactId: string, scope: RegenerateSceneRequest) => void;
  onNeedCredits: () => void;
}

interface RowProps {
  message: ChatMessage;
  open: boolean;
  liveState?: ArtefactState;
  artefact?: ArtefactSummary;
  progress?: MediaProgressEvent;
  voices: VoicePreset[];
  actions: Actions;
}

const Row = memo(function Row({
  message,
  open,
  liveState,
  artefact,
  progress,
  voices,
  actions,
}: RowProps) {
  if (message.kind === "text") {
    const mine = message.role === "user";
    return (
      <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
        <Text style={[styles.kicker, mine ? styles.mineKicker : null]}>{mine ? "Aap" : "Chotu"}</Text>
        <Text style={[styles.text, mine ? styles.mineText : null]}>{message.text}</Text>
      </View>
    );
  }
  if (message.kind === "question") {
    return (
      <QuestionCard
        message={message}
        open={open}
        onOption={(optionId) => actions.onOption(message.field, optionId)}
        onOptions={(optionIds) => actions.onOptions(message.field, optionIds)}
        onSkip={() => actions.onSkip(message.field)}
        onDefaults={() => actions.onDefaults(message.field)}
      />
    );
  }
  if (message.kind === "approval") {
    return (
      <ApprovalCard
        message={message}
        liveState={liveState ?? message.state}
        artefact={artefact}
        progress={progress}
        voices={voices}
        onApprove={() => actions.onApprove(message.artefactId)}
        onReject={(note) => actions.onReject(message.artefactId, note)}
        onPreviewRegenerate={() => actions.onPreviewRegenerate(message.artefactId)}
        onConfirmRegenerate={(feedback) => actions.onConfirmRegenerate(message.artefactId, feedback)}
        onNeedCredits={actions.onNeedCredits}
      />
    );
  }
  if (message.kind === "progress") {
    return (
      <View style={styles.progress} accessibilityRole="text">
        <Text style={styles.progressText}>
          {message.agent ? `${message.agent} · ` : ""}
          {message.text}
        </Text>
        {typeof message.percent === "number" ? (
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(0, Math.min(100, message.percent))}%` }]} />
          </View>
        ) : null}
      </View>
    );
  }
  return <PlayerCard title="Final cut" url={message.url} durationMs={message.durationMs} />;
});

export function MessageList({
  messages,
  artefacts,
  progress,
  voices,
  thinking,
  empty,
  pin,
  actions,
}: {
  messages: ChatMessage[];
  artefacts: Record<string, ArtefactSummary>;
  progress: Record<string, MediaProgressEvent>;
  voices: VoicePreset[];
  thinking: boolean;
  empty: boolean;
  pin: number;
  actions: Actions;
}) {
  const active = openQuestion(messages)?.id;
  const listRef = useRef<ScrollView>(null);
  const count = messages.length + (thinking || empty ? 1 : 0);

  useEffect(() => {
    const node = listRef.current as unknown as {
      scrollToEnd?: (opts: { animated: boolean }) => void;
      scrollTop?: number;
      scrollHeight?: number;
    } | null;
    if (!node) return;
    const snap = () => {
      node.scrollToEnd?.({ animated: false });
      if (typeof node.scrollHeight === "number") node.scrollTop = node.scrollHeight;
    };
    snap();
    const frame = requestAnimationFrame(snap);
    return () => cancelAnimationFrame(frame);
  }, [messages, artefacts, thinking, empty, pin]);

  return (
    <ScrollView
      ref={listRef}
      style={styles.flex}
      contentContainerStyle={styles.list}
      onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
    >
      {empty ? (
        <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.empty}>
          Abhi khaali hai. Neeche message likho.
        </Text>
      ) : null}
      {messages.map((message) => (
        <Row
          key={message.id}
          message={message}
          open={message.kind === "question" && message.id === active}
          liveState={message.kind === "approval" ? artefacts[message.artefactId]?.state : undefined}
          artefact={message.kind === "approval" ? artefacts[message.artefactId] : undefined}
          progress={message.kind === "approval" ? progress[message.artefactId] : undefined}
          voices={voices}
          actions={actions}
        />
      ))}
      {thinking && messages.length > 0 ? (
        <Text accessibilityRole="text" accessibilityLiveRegion="polite" style={styles.empty}>
          Chotu soch raha hai…
        </Text>
      ) : null}
      <Storyboard
        artefacts={artefacts}
        progress={progress}
        voices={voices}
        onApprove={actions.onApprove}
        onPreview={actions.onPreviewScene}
        onConfirm={actions.onConfirmScene}
      />
      <View
        onLayout={() => {
          if (count > 0) listRef.current?.scrollToEnd({ animated: false });
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    gap: 12,
    paddingVertical: 12,
  },
  bubble: {
    maxWidth: "92%",
    gap: 4,
  },
  mine: {
    alignSelf: "flex-end",
    backgroundColor: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  theirs: {
    alignSelf: "flex-start",
    paddingRight: 8,
  },
  kicker: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.4,
    color: colors.inkSoft,
  },
  mineKicker: {
    color: "#D9D0C3",
  },
  text: {
    fontSize: 18,
    lineHeight: 26,
    color: colors.ink,
  },
  mineText: {
    color: colors.paper,
  },
  progress: {
    gap: 6,
    paddingVertical: 4,
  },
  progressText: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  track: {
    height: 4,
    backgroundColor: colors.chip,
  },
  fill: {
    height: 4,
    backgroundColor: colors.ink,
  },
  empty: {
    fontSize: 16,
    color: colors.inkSoft,
    paddingVertical: 8,
  },
});
