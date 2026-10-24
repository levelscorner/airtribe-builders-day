import { Pressable, StyleSheet, Text, View } from "react-native";
import type { QuestionMessage } from "@chotu/shared";
import { colors, layout } from "../theme";

export function QuestionCard({
  message,
  open,
  onOption,
  onSkip,
  onDefaults,
}: {
  message: QuestionMessage;
  open: boolean;
  onOption: (optionId: string) => void;
  onSkip: () => void;
  onDefaults: () => void;
}) {
  return (
    <View style={styles.card} accessibilityLabel={`Brief question, ${message.prompt}`}>
      <View style={styles.head}>
        <Text style={styles.stamp}>BRIEF</Text>
        <Text style={styles.state}>{open ? "abhi" : "done"}</Text>
      </View>
      <Text style={styles.prompt}>{message.prompt}</Text>
      {message.options && message.options.length > 0 ? (
        <View style={styles.chips}>
          {message.options.map((option) => (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              disabled={!open}
              onPress={() => onOption(option.id)}
              style={[styles.chip, !open ? styles.off : null]}
            >
              <Text style={styles.chipText}>{option.label}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {open ? (
        <View style={styles.actions}>
          {message.allowDefaults ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Use defaults" onPress={onDefaults} style={styles.secondary}>
              <Text style={styles.secondaryText}>Use defaults</Text>
            </Pressable>
          ) : null}
          {message.allowSkip ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Skip" onPress={onSkip} style={styles.secondary}>
              <Text style={styles.secondaryText}>Skip</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.closed}>Jawab de diya.</Text>
      )}
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
    gap: 12,
  },
  head: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  stamp: {
    fontSize: 13,
    letterSpacing: 1.2,
    fontWeight: "700",
    color: colors.inkSoft,
  },
  state: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: "700",
  },
  prompt: {
    fontSize: 18,
    lineHeight: 26,
    color: colors.ink,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    minHeight: layout.hit,
    justifyContent: "center",
    paddingHorizontal: 12,
    backgroundColor: colors.chip,
  },
  off: {
    opacity: 0.55,
  },
  chipText: {
    fontSize: 16,
    color: colors.ink,
  },
  actions: {
    gap: 8,
  },
  secondary: {
    minHeight: layout.hit,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.ink,
    paddingHorizontal: 12,
  },
  secondaryText: {
    fontSize: 18,
    color: colors.ink,
    fontWeight: "700",
  },
  closed: {
    fontSize: 15,
    color: colors.inkSoft,
  },
});
