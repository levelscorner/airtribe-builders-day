import { Pressable, StyleSheet, Text, View } from "react-native";
import type { VoicePreset } from "@chotu/shared";
import { MockMeter } from "../screens/PlayerCard";
import { colors, hitSlop, layout } from "../theme";

/** Cast voice list from the shared VoicePreset shape. The ▶ meter plays a local sample, not a file. */
export function VoicePicker({
  voices,
  selectedId,
  onSelect,
}: {
  voices: VoicePreset[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={styles.wrap} accessibilityLabel="Voice presets">
      <Text style={styles.kicker}>Voice</Text>
      {voices.map((voice) => {
        const selected = voice.id === selectedId;
        return (
          <View key={voice.id} style={[styles.row, selected ? styles.selected : null]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Voice ${voice.label}`}
              accessibilityState={{ selected }}
              hitSlop={hitSlop}
              onPress={() => onSelect(voice.id)}
              style={styles.choice}
            >
              <Text style={styles.label}>{voice.label}</Text>
              <Text style={styles.meta}>{voice.languageHint}</Text>
            </Pressable>
            <MockMeter durationMs={2200} label={`${voice.label} sample`} glyph />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  kicker: {
    fontSize: 13,
    letterSpacing: 0.4,
    fontWeight: "700",
    color: colors.inkSoft,
  },
  row: {
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 8,
  },
  selected: {
    borderColor: colors.ink,
  },
  choice: {
    minHeight: layout.hit,
    justifyContent: "center",
  },
  label: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  meta: {
    fontSize: 15,
    color: colors.inkSoft,
  },
});
