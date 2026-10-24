import { useCallback, useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, View, Text, Pressable } from "react-native";
import { TopicScreen } from "./src/screens/TopicScreen";
import { ProgressScreen } from "./src/screens/ProgressScreen";
import { PlayerScreen } from "./src/screens/PlayerScreen";
import type { JobPublic } from "./src/api";
import { colors } from "./src/theme";

type Screen = "topic" | "progress" | "player" | "failed";

export default function App() {
  const [screen, setScreen] = useState<Screen>("topic");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobPublic | null>(null);

  const onCreated = useCallback((id: string) => {
    setJobId(id);
    setScreen("progress");
  }, []);

  const onDone = useCallback((j: JobPublic) => {
    setJob(j);
    setScreen("player");
  }, []);

  const onFail = useCallback((j: JobPublic) => {
    setJob(j);
    setScreen("failed");
  }, []);

  const onAgain = useCallback(() => {
    setJobId(null);
    setJob(null);
    setScreen("topic");
  }, []);

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {screen === "topic" ? <TopicScreen onCreated={onCreated} /> : null}
      {screen === "progress" && jobId ? (
        <ProgressScreen jobId={jobId} onDone={onDone} onFail={onFail} />
      ) : null}
      {screen === "player" && job ? <PlayerScreen job={job} onAgain={onAgain} /> : null}
      {screen === "failed" ? (
        <View style={styles.fail}>
          <Text style={styles.brand}>Chotu mini</Text>
          <Text style={styles.failTitle}>Couldn’t finish this short</Text>
          <Text style={styles.failBody}>{job?.error ?? "Unknown error"}</Text>
          <Pressable style={styles.cta} onPress={onAgain}>
            <Text style={styles.ctaText}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  fail: {
    flex: 1,
    padding: 24,
    paddingTop: 56,
  },
  brand: {
    fontFamily: "serif",
    fontSize: 28,
    fontWeight: "700",
    color: colors.tealDeep,
  },
  failTitle: {
    marginTop: 20,
    fontFamily: "serif",
    fontSize: 24,
    color: colors.ink,
  },
  failBody: {
    marginTop: 10,
    fontSize: 15,
    color: colors.bad,
    lineHeight: 22,
  },
  cta: {
    marginTop: 28,
    backgroundColor: colors.coral,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: {
    color: colors.cream,
    fontWeight: "700",
    fontSize: 16,
  },
});
