import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, Pressable } from "react-native";
import { colors } from "../theme";
import {
  approveScript,
  getJob,
  type JobPublic,
  type StageName,
  type UserPublic,
} from "../api";

const STAGE_LABEL: Record<StageName, string> = {
  script: "Script",
  visuals: "Visuals",
  voice: "Voice",
  render: "Render",
  verify: "Verify",
};

type Props = {
  jobId: string;
  user: UserPublic;
  onAwaitingFinal: (job: JobPublic) => void;
  onFail: (job: JobPublic) => void;
};

export function ProgressScreen({ jobId, user, onAwaitingFinal, onFail }: Props) {
  const [job, setJob] = useState<JobPublic | null>(null);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const j = await getJob(jobId);
        if (!alive) return;
        setJob(j);
        if (j.status === "awaiting_final_approval" || j.status === "published") onAwaitingFinal(j);
        if (j.status === "failed") onFail(j);
      } catch {
        /* keep polling */
      }
    };
    tick();
    const id = setInterval(tick, 800);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [jobId, onAwaitingFinal, onFail]);

  async function onApproveScript() {
    setApproving(true);
    setError(null);
    try {
      const j = await approveScript(jobId, user.id);
      setJob(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApproving(false);
    }
  }

  const awaitingScript = job?.status === "awaiting_script_approval";

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.brand}>Chotu Studio</Text>
      <Text style={styles.title}>
        {awaitingScript ? "Approve the script" : "Production running…"}
      </Text>
      <Text style={styles.topic}>{job?.topic ?? "…"}</Text>

      {awaitingScript && job?.script ? (
        <View style={styles.scriptBox}>
          <Text style={styles.scriptTitle}>{job.script.title}</Text>
          {job.script.scenes.map((s, i) => (
            <View key={i} style={styles.sceneBlock}>
              <Text style={styles.sceneIdx}>Scene {i + 1}</Text>
              <Text style={styles.narration}>{s.narration}</Text>
            </View>
          ))}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable style={styles.cta} onPress={onApproveScript} disabled={approving}>
            {approving ? (
              <ActivityIndicator color={colors.cream} />
            ) : (
              <Text style={styles.ctaText}>Approve script → make visuals & voice</Text>
            )}
          </Pressable>
        </View>
      ) : null}

      <View style={styles.list}>
        {(job?.stages ?? []).map((s) => (
          <View key={s.name} style={styles.row}>
            <View style={[styles.dot, statusStyle(s.status)]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.stageName}>{STAGE_LABEL[s.name]}</Text>
              {s.message ? <Text style={styles.msg}>{s.message}</Text> : null}
            </View>
            <Text style={styles.status}>{s.status}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.actTitle}>Agent activity</Text>
      <View style={styles.actList}>
        {(job?.activity ?? []).slice().reverse().map((a) => (
          <View key={a.id} style={styles.actRow}>
            <Text style={styles.actTime}>{a.at.slice(11, 19)}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.actNode}>
                {a.node}
                {a.tool ? ` · ${a.tool}` : ""}
                {a.provider ? ` · ${a.provider}` : ""}
              </Text>
              {a.message ? <Text style={styles.msg}>{a.message}</Text> : null}
            </View>
            <Text style={styles.status}>{a.status}</Text>
          </View>
        ))}
      </View>

      {!awaitingScript ? <ActivityIndicator color={colors.teal} style={{ marginTop: 20 }} /> : null}
    </ScrollView>
  );
}

function statusStyle(status: string) {
  if (status === "done") return { backgroundColor: colors.ok };
  if (status === "running" || status === "started") return { backgroundColor: colors.coral };
  if (status === "failed") return { backgroundColor: colors.bad };
  if (status === "waiting") return { backgroundColor: colors.warn };
  return { backgroundColor: colors.sand };
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, paddingTop: 48, paddingBottom: 40, backgroundColor: colors.paper },
  brand: { fontFamily: "serif", fontSize: 26, fontWeight: "700", color: colors.tealDeep },
  title: { marginTop: 16, fontFamily: "serif", fontSize: 22, color: colors.ink },
  topic: { marginTop: 4, fontSize: 15, color: colors.inkSoft },
  scriptBox: { marginTop: 20, backgroundColor: colors.cream, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: colors.line },
  scriptTitle: { fontFamily: "serif", fontSize: 18, fontWeight: "700", color: colors.ink, marginBottom: 12 },
  sceneBlock: { marginBottom: 12 },
  sceneIdx: { fontSize: 11, fontWeight: "700", color: colors.teal, textTransform: "uppercase" },
  narration: { marginTop: 4, fontSize: 15, lineHeight: 22, color: colors.ink },
  cta: { marginTop: 8, backgroundColor: colors.coral, borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  ctaText: { color: colors.cream, fontWeight: "700", textAlign: "center", paddingHorizontal: 8 },
  list: { marginTop: 28, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  stageName: { fontSize: 16, fontWeight: "600", color: colors.ink },
  msg: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  status: { fontSize: 11, color: colors.inkSoft, textTransform: "uppercase" },
  actTitle: { marginTop: 28, fontSize: 13, fontWeight: "700", color: colors.teal, textTransform: "uppercase", letterSpacing: 0.5 },
  actList: { marginTop: 10, gap: 8 },
  actRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  actTime: { fontSize: 11, color: colors.inkSoft, width: 54, marginTop: 2 },
  actNode: { fontSize: 13, fontWeight: "600", color: colors.ink },
  error: { color: colors.bad, marginBottom: 8 },
});
