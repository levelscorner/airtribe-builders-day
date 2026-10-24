import { useCallback, useState } from "react";
import { SafeAreaView, StatusBar, StyleSheet, View, Text, Pressable } from "react-native";
import { SignupScreen } from "./src/screens/SignupScreen";
import { TopicScreen } from "./src/screens/TopicScreen";
import { ProgressScreen } from "./src/screens/ProgressScreen";
import { PlayerScreen } from "./src/screens/PlayerScreen";
import { PacksScreen } from "./src/screens/PacksScreen";
import { AdminScreen } from "./src/screens/AdminScreen";
import type { JobPublic, UserPublic } from "./src/api";
import { colors } from "./src/theme";

type Screen =
  | "signup"
  | "topic"
  | "progress"
  | "player"
  | "packs"
  | "admin"
  | "failed";

export default function App() {
  const [screen, setScreen] = useState<Screen>("signup");
  const [user, setUser] = useState<UserPublic | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<JobPublic | null>(null);
  const [returnTo, setReturnTo] = useState<Screen>("topic");

  const onSignedIn = useCallback((u: UserPublic) => {
    setUser(u);
    setScreen("topic");
  }, []);

  const onCreated = useCallback((id: string) => {
    setJobId(id);
    setScreen("progress");
  }, []);

  const onAwaitingFinal = useCallback((j: JobPublic) => {
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
      {screen === "signup" ? (
        <SignupScreen
          onSignedIn={onSignedIn}
          onAdmin={() => {
            setReturnTo("signup");
            setScreen("admin");
          }}
        />
      ) : null}
      {screen === "topic" && user ? (
        <TopicScreen
          user={user}
          onCredits={setUser}
          onCreated={onCreated}
          onBuyPack={() => setScreen("packs")}
          onAdmin={() => {
            setReturnTo("topic");
            setScreen("admin");
          }}
        />
      ) : null}
      {screen === "progress" && jobId && user ? (
        <ProgressScreen
          jobId={jobId}
          user={user}
          onAwaitingFinal={onAwaitingFinal}
          onFail={onFail}
        />
      ) : null}
      {screen === "player" && job && user ? (
        <PlayerScreen job={job} user={user} onAgain={onAgain} onUpdated={setJob} />
      ) : null}
      {screen === "packs" && user ? (
        <PacksScreen user={user} onBack={() => setScreen("topic")} onCredits={setUser} />
      ) : null}
      {screen === "admin" ? (
        <AdminScreen onBack={() => setScreen(user ? returnTo : "signup")} />
      ) : null}
      {screen === "failed" ? (
        <View style={styles.fail}>
          <Text style={styles.brand}>Chotu Studio</Text>
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
  root: { flex: 1, backgroundColor: colors.paper },
  fail: { flex: 1, padding: 24, paddingTop: 56 },
  brand: { fontFamily: "serif", fontSize: 28, fontWeight: "700", color: colors.tealDeep },
  failTitle: { marginTop: 20, fontFamily: "serif", fontSize: 24, color: colors.ink },
  failBody: { marginTop: 10, fontSize: 15, color: colors.bad, lineHeight: 22 },
  cta: {
    marginTop: 28,
    backgroundColor: colors.coral,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: colors.cream, fontWeight: "700", fontSize: 16 },
});
