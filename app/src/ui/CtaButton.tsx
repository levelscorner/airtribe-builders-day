import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { colors } from "../theme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "secondary";
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  testID?: string;
  children?: ReactNode;
};

/**
 * Primary actions use a real <button> on web so automation / Expo web
 * receives native click events (RN Pressable often ignores synthetic clicks).
 */
export function CtaButton({
  label,
  onPress,
  disabled,
  busy,
  variant = "primary",
  style,
  textStyle,
  testID,
}: Props) {
  const isPrimary = variant === "primary";
  const dimmed = Boolean(disabled || busy);

  if (Platform.OS === "web") {
    return (
      // eslint-disable-next-line react/forbid-elements -- intentional native button for web clicks
      <button
        type="button"
        data-testid={testID}
        disabled={dimmed}
        onClick={() => {
          if (!dimmed) onPress();
        }}
        style={{
          marginTop: 0,
          width: "100%",
          border: isPrimary ? "none" : `1.5px solid ${colors.teal}`,
          borderRadius: 14,
          paddingTop: 14,
          paddingBottom: 14,
          paddingLeft: 12,
          paddingRight: 12,
          background: isPrimary ? colors.coral : colors.cream,
          color: isPrimary ? colors.cream : colors.tealDeep,
          fontWeight: 700,
          fontSize: 16,
          cursor: dimmed ? "not-allowed" : "pointer",
          opacity: dimmed ? 0.55 : 1,
          fontFamily: "inherit",
        }}
      >
        {busy ? "…" : label}
      </button>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={dimmed}
      style={[
        isPrimary ? styles.primary : styles.secondary,
        dimmed && styles.dimmed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={isPrimary ? colors.cream : colors.teal} />
      ) : (
        <Text style={[isPrimary ? styles.primaryText : styles.secondaryText, textStyle]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.coral,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondary: {
    borderWidth: 1.5,
    borderColor: colors.teal,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.cream,
  },
  primaryText: { color: colors.cream, fontWeight: "700", fontSize: 16 },
  secondaryText: { color: colors.tealDeep, fontWeight: "700", fontSize: 15 },
  dimmed: { opacity: 0.55 },
});
