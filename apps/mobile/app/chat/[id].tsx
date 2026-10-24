import { Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChatScreen } from "../../src/screens/ChatScreen";
import { colors, layout } from "../../src/theme";

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

export default function ChatRoute() {
  const params = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const chatId = one(params.id);
  if (!chatId) {
    return (
      <View style={styles.screen}>
        <Text accessibilityRole="alert" style={styles.text}>
          Chat link adhoora hai. Signup se shuru karo.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Signup pe jao"
          onPress={() => router.replace("/")}
          style={styles.button}
        >
          <Text style={styles.buttonText}>Signup pe jao</Text>
        </Pressable>
      </View>
    );
  }
  return <ChatScreen chatId={chatId} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.paper,
    padding: layout.pad,
    justifyContent: "center",
    gap: 12,
  },
  text: {
    fontSize: 18,
    lineHeight: 26,
    color: colors.ink,
  },
  button: {
    minHeight: layout.hit,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
  },
  buttonText: {
    color: colors.paper,
    fontSize: 18,
    fontWeight: "700",
  },
});
