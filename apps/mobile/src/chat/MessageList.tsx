import { memo, useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { ArtefactState, ChatMessage, RegeneratePreviewResponse } from "@chotu/shared";
import { PlayerCard } from "../screens/PlayerCard";
import { colors } from "../theme";
import { ApprovalCard } from "./ApprovalCard";
import { openQuestion } from "./open-question";
import { QuestionCard } from "./QuestionCard";

interface Actions {
  onOption: (field: string, optionId: string) => void;
  onSkip: (field: string) => void;
  onDefaults: (field: string) => void;
  onApprove: (artefactId: string) => void;
  onReject: (artefactId: string, note: string) => void;
  onPreviewRegenerate: (artefactId: string) => Promise<RegeneratePreviewResponse>;
  onConfirmRegenerate: (artefactId: string) => void;
}

const Row = memo(function Row({
  message,
  open,
  liveState,
  actions,
}: {
  message: ChatMessage;
  open: boolean;
  liveState?: ArtefactState;
  actions: Actions;
}) {
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
        onApprove={() => actions.onApprove(message.artefactId)}
        onReject={(note) => actions.onReject(message.artefactId, note)}
        onPreviewRegenerate={() => actions.onPreviewRegenerate(message.artefactId)}
        onConfirmRegenerate={() => actions.onConfirmRegenerate(message.artefactId)}
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
  thinking,
  actions,
}: {
  messages: ChatMessage[];
  artefacts: Record<string, ArtefactState>;
  thinking: boolean;
  actions: Actions;
}) {
  const active = openQuestion(messages)?.id;
  const listRef = useRef<ScrollView>(null);
  const count = messages.length + (thinking ? 1 : 0);

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
  }, [messages, artefacts, thinking]);

  return (
    <ScrollView
      ref={listRef}
      style={styles.flex}
      contentContainerStyle={styles.list}
      onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
    >
      {messages.length === 0 ? <Text style={styles.empty}>Chotu soch raha hai…</Text> : null}
      {messages.map((message) => (
        <Row
          key={message.id}
          message={message}
          open={message.kind === "question" && message.id === active}
          liveState={message.kind === "approval" ? artefacts[message.artefactId] : undefined}
          actions={actions}
        />
      ))}
      {thinking && messages.length > 0 ? <Text style={styles.empty}>Chotu soch raha hai…</Text> : null}
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
