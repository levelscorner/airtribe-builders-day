import { StyleSheet, Text, View } from "react-native";
import {
  reviewFixes,
  reviewNote,
  reviewScoreLabel,
  reviewStatusLabel,
  reviewTone,
  type AgentReview,
} from "../agent-review";
import { colors } from "../theme";

/** Hidden entirely when the script artefact has no agentReview. */
export function AgentReviewPanel({ review }: { review: AgentReview }) {
  const tone = reviewTone(review.status);
  const warn = tone === "warn";
  const score = reviewScoreLabel(review.confidence);
  const note = reviewNote(review.status);
  const fixes = reviewFixes(review);
  const label = [
    "Pine Labs agent review",
    reviewStatusLabel(review.status),
    score ? `score ${score}` : "",
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <View style={styles.panel} accessibilityLabel={label}>
      <View style={styles.row}>
        <Text style={styles.kicker}>Pine Labs agent review</Text>
        <View style={[styles.chip, warn ? styles.chipWarn : null]}>
          <Text style={[styles.chipText, warn ? styles.warn : null]}>{reviewStatusLabel(review.status)}</Text>
        </View>
      </View>
      {score ? <Text style={[styles.score, warn ? styles.warn : null]}>Score {score}</Text> : null}
      {note ? <Text style={warn ? styles.warn : styles.note}>{note}</Text> : null}
      {fixes.length > 0 ? (
        <View style={styles.fixes}>
          <Text style={styles.fixesLabel}>Suggested fixes</Text>
          {fixes.map((fix, index) => (
            <Text key={`${index}-${fix}`} style={styles.fix}>
              {fix}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  kicker: {
    flex: 1,
    fontSize: 13,
    letterSpacing: 0.4,
    fontWeight: "700",
    color: colors.inkSoft,
  },
  chip: {
    backgroundColor: colors.chip,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipWarn: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  score: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  warn: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
    color: colors.danger,
  },
  note: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.ink,
  },
  fixes: {
    gap: 4,
  },
  fixesLabel: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  fix: {
    fontSize: 18,
    lineHeight: 26,
    color: colors.ink,
  },
});
