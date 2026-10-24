import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet } from "react-native";
import { colors } from "../theme";
import { signup, type UserPublic } from "../api";
import { CtaButton } from "../ui/CtaButton";

type Props = {
  onSignedIn: (user: UserPublic) => void;
  onAdmin: () => void;
};

export function SignupScreen({ onSignedIn, onAdmin }: Props) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit() {
    if (name.trim().length < 1 || contact.trim().length < 5) {
      setError("Enter your name and email or phone.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await signup(name.trim(), contact.trim());
      onSignedIn(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>Chotu Studio</Text>
      <Text style={styles.headline}>AI production team for Indian creators</Text>
      <Text style={styles.sub}>Hindi / Hinglish first. You approve the script and the final cut.</Text>

      <Text style={styles.label}>Name</Text>
      <TextInput value={name} onChangeText={setName} style={styles.input} placeholder="Your name" placeholderTextColor={colors.inkSoft} />

      <Text style={styles.label}>Email or phone</Text>
      <TextInput
        value={contact}
        onChangeText={setContact}
        style={styles.input}
        placeholder="you@email.com or +91…"
        placeholderTextColor={colors.inkSoft}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ marginTop: 28 }}>
        <CtaButton label="Continue" onPress={onSubmit} busy={busy} disabled={busy} testID="signup-continue" />
      </View>

      <Pressable onPress={onAdmin} style={styles.linkWrap}>
        <Text style={styles.link}>Traction admin / event log</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, paddingTop: 56, backgroundColor: colors.paper },
  brand: { fontFamily: "serif", fontSize: 40, fontWeight: "700", color: colors.tealDeep },
  headline: { marginTop: 12, fontFamily: "serif", fontSize: 24, color: colors.ink, maxWidth: 340 },
  sub: { marginTop: 8, fontSize: 15, color: colors.inkSoft, lineHeight: 22 },
  label: { marginTop: 24, marginBottom: 8, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", color: colors.teal },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: colors.ink,
  },
  cta: { marginTop: 28, backgroundColor: colors.coral, borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  ctaText: { color: colors.cream, fontSize: 17, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  error: { marginTop: 12, color: colors.bad },
  linkWrap: { marginTop: 20 },
  link: { color: colors.teal, fontWeight: "600" },
});
