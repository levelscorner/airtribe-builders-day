import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
} from "react-native";
import { colors } from "../theme";
import {
  createJob,
  healthCheck,
  type Language,
  type Style,
  type UserPublic,
  API_BASE_URL,
} from "../api";
import { CtaButton } from "../ui/CtaButton";

type Props = {
  user: UserPublic;
  onCredits: (u: UserPublic) => void;
  onCreated: (jobId: string) => void;
  onBuyPack: () => void;
  onAdmin: () => void;
};

export function TopicScreen({ user, onCredits, onCreated, onBuyPack, onAdmin }: Props) {
  const [topic, setTopic] = useState("Why bees make honey");
  const [language, setLanguage] = useState<Language>("hi");
  const [style, setStyle] = useState<Style>("watercolor-storybook");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [mockMode, setMockMode] = useState(false);

  useEffect(() => {
    healthCheck()
      .then((h) => {
        setApiOk(true);
        setMockMode(h.mockMode);
      })
      .catch(() => setApiOk(false));
  }, []);

  async function onMake() {
    const trimmed = topic.trim();
    if (trimmed.length < 2) {
      setError("Enter a short topic.");
      return;
    }
    if (user.credits < 1) {
      setError("No credits left — buy a video pack.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { job, user: next } = await createJob({
        userId: user.id,
        topic: trimmed,
        language,
        style,
      });
      onCredits(next);
      onCreated(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>Chotu Studio</Text>
      <Text style={styles.hello}>
        Namaste, {user.name} · {user.credits} credit{user.credits === 1 ? "" : "s"}
      </Text>
      <Text style={styles.headline}>What should we explain today?</Text>

      <Text style={styles.label}>Topic</Text>
      <TextInput
        value={topic}
        onChangeText={setTopic}
        placeholder="e.g. How UPI works"
        placeholderTextColor={colors.inkSoft}
        style={styles.input}
        editable={!busy}
      />

      <Text style={styles.label}>Language</Text>
      <View style={styles.row}>
        {(
          [
            ["hi", "Hindi"],
            ["en", "English"],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setLanguage(id)}
            style={[styles.chip, language === id && styles.chipOn]}
          >
            <Text style={[styles.chipText, language === id && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Style</Text>
      <View style={styles.row}>
        {(
          [
            ["watercolor-storybook", "Watercolor storybook"],
            ["cartoon", "Cartoon"],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setStyle(id)}
            style={[styles.chip, style === id && styles.chipOn]}
          >
            <Text style={[styles.chipText, style === id && styles.chipTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ marginTop: 32 }}>
        <CtaButton
          label="Draft script (1 credit)"
          onPress={onMake}
          busy={busy}
          disabled={busy || apiOk === false || user.credits < 1}
          testID="draft-script"
        />
      </View>

      <View style={{ marginTop: 12 }}>
        <CtaButton label="Buy video pack" onPress={onBuyPack} variant="secondary" testID="buy-pack" />
      </View>
      <Pressable onPress={onAdmin}>
        <Text style={styles.metaLink}>Traction admin</Text>
      </Pressable>

      <Text style={styles.meta}>
        API: {API_BASE_URL}
        {" · "}
        {apiOk === null ? "checking…" : apiOk ? (mockMode ? "mock mode" : "live") : "unreachable"}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 48,
    paddingBottom: 48,
    backgroundColor: colors.paper,
  },
  brand: { fontFamily: "serif", fontSize: 36, fontWeight: "700", color: colors.tealDeep },
  hello: { marginTop: 8, fontSize: 14, color: colors.inkSoft },
  headline: { marginTop: 14, fontFamily: "serif", fontSize: 24, color: colors.ink },
  label: {
    marginTop: 24,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.teal,
  },
  input: {
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
    color: colors.ink,
  },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipOn: { backgroundColor: colors.teal, borderColor: colors.teal },
  chipText: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  chipTextOn: { color: colors.cream },
  cta: {
    marginTop: 32,
    backgroundColor: colors.coral,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaDisabled: { opacity: 0.55 },
  ctaText: { color: colors.cream, fontSize: 17, fontWeight: "700" },
  secondary: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: colors.teal,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.cream,
  },
  secondaryText: { color: colors.tealDeep, fontWeight: "700" },
  error: { marginTop: 14, color: colors.bad, fontSize: 14 },
  meta: { marginTop: 16, fontSize: 12, color: colors.inkSoft },
  metaLink: { marginTop: 14, color: colors.teal, fontWeight: "600" },
});
