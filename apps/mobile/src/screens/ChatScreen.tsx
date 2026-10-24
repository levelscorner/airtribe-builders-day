import { useMemo } from "react";
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Composer } from "../chat/Composer";
import { MessageList } from "../chat/MessageList";
import { openQuestion } from "../chat/open-question";
import { ProgressStrip } from "../chat/ProgressStrip";
import { useChatStream } from "../chat/useChatStream";
import { useKeyboardInset } from "../chat/useKeyboardInset";
import { colors, hitSlop, layout } from "../theme";

export function ChatScreen({ chatId }: { chatId: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const keyboard = useKeyboardInset();
  const stream = useChatStream(chatId);
  const question = openQuestion(stream.messages);
  const showApproveAll =
    stream.status === "ready" && stream.stage !== "brief" && stream.stage !== "done" && stream.awaitingCount > 0;
  const showList = !stream.missing && (stream.messages.length > 0 || stream.status === "ready");
  const showComposer = stream.status === "ready" && !stream.missing;

  const actions = useMemo(
    () => ({
      onOption: (field: string, optionId: string) => {
        void stream.send({ answer: { field, optionId } });
      },
      onOptions: (field: string, optionIds: string[]) => {
        void stream.send({ answer: { field, optionIds } });
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
        style={[
          styles.column,
          { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 8) + keyboard },
        ]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.stripe} />
        <View style={styles.header}>
          <View style={styles.titles}>
            <Text style={styles.brand}>Chotu Studio</Text>
            <Text style={styles.sub}>Orchestrator chat</Text>
          </View>
          <Text
            accessibilityLabel={stream.credits === null ? "Credits loading" : `${stream.credits} credits`}
            style={styles.credits}
          >
            {stream.credits === null ? "— credits" : `${stream.credits} credits`}
          </Text>
        </View>
        <ProgressStrip stage={stream.stage} />
        {showApproveAll ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Approve all remaining cards in this stage"
            hitSlop={hitSlop}
            onPress={() => {
              void stream.approveAll();
            }}
            style={styles.all}
          >
            <Text style={styles.allText}>Approve all remaining</Text>
          </Pressable>
        ) : null}
        {stream.status === "loading" ? (
          <Text
            accessibilityRole="text"
            accessibilityLiveRegion="polite"
            accessibilityLabel="Chat khul rahi hai"
            style={styles.status}
          >
            Chat khul rahi hai…
          </Text>
        ) : null}
        {stream.error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {stream.error}
          </Text>
        ) : null}
        {stream.status === "error" && !stream.missing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Phir se kholo"
            hitSlop={hitSlop}
            onPress={stream.reload}
            style={styles.all}
          >
            <Text style={styles.allText}>Phir se</Text>
          </Pressable>
        ) : null}
        {stream.missing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Signup pe jao"
            hitSlop={hitSlop}
            onPress={() => router.replace("/")}
            style={styles.all}
          >
            <Text style={styles.allText}>Signup pe jao</Text>
          </Pressable>
        ) : showList ? (
          <MessageList
            messages={stream.messages}
            artefacts={stream.artefacts}
            thinking={stream.status === "ready" && stream.thinking}
            empty={stream.status === "ready" && stream.messages.length === 0}
            pin={keyboard}
            actions={actions}
          />
        ) : null}
        {showComposer ? (
          <Composer
            placeholder={
            question?.allowFreeText
              ? "Jawab yahan likho…"
              : question
                ? "Option likho, ya neeche chuno…"
                : "Message likho…"
          }
            onSend={onSend}
          />
        ) : null}
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
  status: {
    fontSize: 18,
    lineHeight: 26,
    color: colors.inkSoft,
    marginTop: 12,
  },
  error: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.danger,
    marginBottom: 8,
  },
});
