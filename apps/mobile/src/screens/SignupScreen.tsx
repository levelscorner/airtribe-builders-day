import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getStudioClient } from "../api";
import { colors, layout } from "../theme";

export function SignupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    const displayName = name.trim();
    const phoneOrEmail = email.trim();
    if (!displayName) {
      setError("Naam likho.");
      return;
    }
    if (!phoneOrEmail.includes("@")) {
      setError("Email mein @ hona chahiye.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const client = getStudioClient();
      await client.createUser({ displayName, phoneOrEmail });
      const chat = await client.createChat({
        initialMessage: "Why do bees make honey — kids explainer",
      });
      router.replace(`/chat/${chat.chatId}?videoId=${chat.videoId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shuru nahi ho paya.");
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={[styles.column, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.stripe} />
        <Text style={styles.brand}>Chotu Studio</Text>
        <Text style={styles.lead}>Chat karke short video banao. Hindi, Hinglish, ya English.</Text>
        <Text style={styles.label}>Naam</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          autoCapitalize="words"
          autoComplete="name"
          accessibilityLabel="Naam"
          placeholder="Asha"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />
        <Text style={styles.label}>Email</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          accessibilityLabel="Email"
          placeholder="asha@email.com"
          placeholderTextColor={colors.inkSoft}
          style={styles.input}
        />
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Shuru karo"
          disabled={busy}
          onPress={() => {
            void submit();
          }}
          style={[styles.button, busy ? styles.off : null]}
        >
          <Text style={styles.buttonText}>{busy ? "Jud rahe hain…" : "Shuru karo"}</Text>
        </Pressable>
      </View>
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
    gap: 8,
  },
  stripe: {
    height: 6,
    backgroundColor: colors.stripe,
    marginBottom: 12,
  },
  brand: {
    fontSize: 32,
    lineHeight: 38,
    fontWeight: "700",
    color: colors.ink,
  },
  lead: {
    fontSize: 18,
    lineHeight: 26,
    color: colors.ink,
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    marginTop: 8,
  },
  input: {
    minHeight: layout.hit,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    fontSize: 18,
    color: colors.ink,
  },
  error: {
    fontSize: 16,
    color: colors.danger,
    marginTop: 8,
  },
  button: {
    minHeight: layout.hit,
    marginTop: 16,
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  off: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.paper,
    fontSize: 18,
    fontWeight: "700",
  },
});
