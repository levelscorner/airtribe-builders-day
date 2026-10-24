import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { colors } from "../theme";
import { createJob, healthCheck, type Language, type Style } from "../api";
import { API_BASE_URL } from "../config";

type Props = {
  onCreated: (jobId: string) => void;
};

export function TopicScreen({ onCreated }: Props) {
  const [topic, setTopic] = useState("Why the sky is blue");
  const [language, setLanguage] = useState<Language>("en");
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
    setBusy(true);
    setError(null);
    try {
      const job = await createJob({ topic: trimmed, language, style });
      onCreated(job.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>Chotu mini</Text>
      <Text style={styles.headline}>Tiny explainer videos for curious kids</Text>
      <Text style={styles.sub}>
        Type a topic. We write a 30–45s story, paint scenes, speak them, and stitch a vertical short.
      </Text>

      <Text style={styles.label}>Topic</Text>
      <TextInput
        value={topic}
        onChangeText={setTopic}
        placeholder="e.g. How bees make honey"
        placeholderTextColor={colors.inkSoft}
        style={styles.input}
        editable={!busy}
      />

      <Text style={styles.label}>Language</Text>
      <View style={styles.row}>
        {(
          [
            ["en", "English"],
            ["hi", "Hindi"],
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

      <Pressable
        onPress={onMake}
        disabled={busy || apiOk === false}
        style={[styles.cta, (busy || apiOk === false) && styles.ctaDisabled]}
      >
        {busy ? (
          <ActivityIndicator color={colors.cream} />
        ) : (
          <Text style={styles.ctaText}>Make my short</Text>
        )}
      </Pressable>

      <Text style={styles.meta}>
        API: {API_BASE_URL}
        {" · "}
        {apiOk === null ? "checking…" : apiOk ? (mockMode ? "mock mode" : "live keys") : "unreachable"}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    paddingBottom: 48,
    backgroundColor: colors.paper,
  },
  brand: {
    fontFamily: "serif",
    fontSize: 42,
    fontWeight: "700",
    color: colors.tealDeep,
    letterSpacing: -0.5,
  },
  headline: {
    marginTop: 12,
    fontFamily: "serif",
    fontSize: 26,
    lineHeight: 32,
    color: colors.ink,
    maxWidth: 340,
  },
  sub: {
    marginTop: 10,
    fontSize: 16,
    lineHeight: 24,
    color: colors.inkSoft,
    maxWidth: 380,
  },
  label: {
    marginTop: 28,
    marginBottom: 8,
    fontSize: 13,
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
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.cream,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipOn: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  chipText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: "600",
  },
  chipTextOn: {
    color: colors.cream,
  },
  cta: {
    marginTop: 36,
    backgroundColor: colors.coral,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  ctaDisabled: {
    opacity: 0.55,
  },
  ctaText: {
    color: colors.cream,
    fontSize: 18,
    fontWeight: "700",
  },
  error: {
    marginTop: 16,
    color: colors.bad,
    fontSize: 14,
  },
  meta: {
    marginTop: 18,
    fontSize: 12,
    color: colors.inkSoft,
  },
});
