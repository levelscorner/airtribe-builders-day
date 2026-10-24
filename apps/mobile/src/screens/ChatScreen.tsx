import { useMemo } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Composer } from "../chat/Composer";
import { MessageList } from "../chat/MessageList";
import { openQuestion } from "../chat/open-question";
import { ProgressStrip } from "../chat/ProgressStrip";
import { useChatStream } from "../chat/useChatStream";
import { colors, layout } from "../theme";

export function ChatScreen({ chatId, videoId }: { chatId: string; videoId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const stream = useChatStream(chatId, videoId);
  const question = openQuestion(stream.messages);
  const showApproveAll = stream.stage !== "brief" && stream.stage !== "done" && stream.awaitingCount > 0;

  const actions = useMemo(
    () => ({
      onOption: (field: string, optionId: string) => {
        void stream.send({ answer: { field, optionId } });
      },
      onSkip: (field: string) => {
        void stream.send({ answer: { field, skip: true } });
      },
      onDefaults: (field: string) => {
        void stream.send({ answer: { field, useDefaults: true } });
      },
      onApprove: (artefactId: string) => {
        void stream.approve(artefactId);
      },
      onReject: (artefactId: string, note: string) => {
        void stream.reject(artefactId, note);
      },
      onPreviewRegenerate: (artefactId: string) => stream.previewRegenerate(artefactId),
      onConfirmRegenerate: (artefactId: string) => {
        void stream.confirmRegenerate(artefactId);
      },
    }),
    [stream],
  );

  function onSend(text: string) {
    if (question?.allowFreeText) {
      void stream.send({ answer: { field: question.field, freeText: text } });
      return;
    }
    void stream.send({ text });
  }

  return (
    <View style={styles.screen}>
      <KeyboardAvoidingView
        style={[styles.column, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 8) }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.stripe} />
        <View style={styles.header}>
          <View style={styles.titles}>
            <Text style={styles.brand}>Chotu Studio</Text>
            <Text style={styles.sub}>Orchestrator chat</Text>
          </View>
          <Text accessibilityLabel={stream.credits === null ? "Credits" : `${stream.credits} credits`} style={styles.credits}>
            {stream.credits === null ? "— credits" : `${stream.credits} credits`}
          </Text>
        </View>
        <ProgressStrip stage={stream.stage} />
        {showApproveAll ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Approve all remaining"
            onPress={() => {
              void stream.approveAll();
            }}
            style={styles.all}
          >
            <Text style={styles.allText}>Approve all remaining</Text>
          </Pressable>
        ) : null}
        {stream.error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {stream.error}
          </Text>
        ) : null}
        {stream.missing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Signup pe jao"
            onPress={() => router.replace("/")}
            style={styles.all}
          >
            <Text style={styles.allText}>Signup pe jao</Text>
          </Pressable>
        ) : (
          <MessageList
            messages={stream.messages}
            artefacts={stream.artefacts}
            thinking={stream.thinking}
            actions={actions}
          />
        )}
        <Composer
          placeholder={question?.allowFreeText ? "Jawab yahan likho…" : "Message likho…"}
          onSend={onSend}
        />
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: layout.maxWidth,
    alignSelf: "center",
    paddingHorizontal: layout.pad,
  },
  stripe: {
    height: 6,
    backgroundColor: colors.stripe,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 12,
    marginBottom: 10,
  },
  titles: {
    flexShrink: 1,
  },
  brand: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
  },
  sub: {
    fontSize: 14,
    color: colors.inkSoft,
  },
  credits: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  all: {
    minHeight: layout.hit,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.ink,
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  allText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    textAlign: "center",
  },
  error: {
    fontSize: 16,
    color: colors.danger,
    marginBottom: 8,
  },
});
