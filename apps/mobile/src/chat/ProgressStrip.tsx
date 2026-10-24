import { ScrollView, StyleSheet, Text, View } from "react-native";
import type { Stage } from "@chotu/shared";
import { colors } from "../theme";
import { STAGE_LABEL, STAGE_ORDER, stageMark } from "./labels";

export function ProgressStrip({ stage }: { stage: Stage }) {
  const index = Math.max(1, STAGE_ORDER.indexOf(stage) + 1);
  return (
    <View style={styles.wrap} accessibilityLabel={`Progress, ${STAGE_LABEL[stage]}, ${index} of ${STAGE_ORDER.length}`}>
      <Text style={styles.meta}>
        {STAGE_LABEL[stage]} · {index} of {STAGE_ORDER.length}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {STAGE_ORDER.map((item) => {
          const mark = stageMark(item, stage);
          const current = item === stage;
          return (
            <View
              key={item}
              accessibilityLabel={`${STAGE_LABEL[item]}, ${mark}`}
              style={[styles.chip, current ? styles.chipNow : null]}
            >
              <Text style={styles.chipLabel}>{STAGE_LABEL[item]}</Text>
              <Text style={[styles.mark, mark === "done" ? styles.done : null]}>{mark}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    paddingBottom: 8,
  },
  meta: {
    fontSize: 15,
    color: colors.inkSoft,
  },
  row: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: "center",
  },
  chipNow: {
    borderColor: colors.ink,
  },
  chipLabel: {
    fontSize: 14,
    color: colors.ink,
    fontWeight: "700",
  },
  mark: {
    fontSize: 13,
    color: colors.inkSoft,
  },
  done: {
    color: colors.ok,
  },
});
