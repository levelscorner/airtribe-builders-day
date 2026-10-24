import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { scrollFocusedField } from "./useKeyboardInset";
import { colors, hitSlop, layout } from "../theme";

export function Composer({
  placeholder,
  onSend,
}: {
  placeholder: string;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  return (
    <View style={styles.bar}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkSoft}
        style={styles.input}
        multiline
        accessibilityLabel="Message"
        onFocus={scrollFocusedField}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Bhejo"
        accessibilityState={{ disabled: !trimmed }}
        disabled={!trimmed}
        hitSlop={hitSlop}
        onPress={() => {
          if (!trimmed) return;
          onSend(trimmed);
          setText("");
        }}
        style={[styles.send, !trimmed ? styles.sendOff : null]}
      >
        <Text style={styles.sendText}>Bhejo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 8,
  },
  input: {
    flex: 1,
    minHeight: layout.hit,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 18,
    color: colors.ink,
  },
  send: {
    minHeight: layout.hit,
    minWidth: 76,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
    paddingHorizontal: 12,
  },
  sendOff: {
    opacity: 0.4,
  },
  sendText: {
    color: colors.paper,
    fontSize: 18,
    fontWeight: "700",
  },
});
