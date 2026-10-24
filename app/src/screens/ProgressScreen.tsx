import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { colors } from "../theme";
import { getJob, type JobPublic, type StageName } from "../api";

const STAGE_LABEL: Record<StageName, string> = {
  script: "Script",
  visuals: "Visuals",
  voice: "Voice",
  render: "Render",
  verify: "Verify",
};

type Props = {
  jobId: string;
  onDone: (job: JobPublic) => void;
  onFail: (job: JobPublic) => void;
};

export function ProgressScreen({ jobId, onDone, onFail }: Props) {
  const [job, setJob] = useState<JobPublic | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const j = await getJob(jobId);
        if (!alive) return;
        setJob(j);
        if (j.status === "done") onDone(j);
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
  }, [jobId, onDone, onFail]);

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>Chotu mini</Text>
      <Text style={styles.title}>Making your short…</Text>
      <Text style={styles.topic}>{job?.topic ?? "…"}</Text>

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

      <ActivityIndicator color={colors.teal} style={{ marginTop: 28 }} />
    </View>
  );
}

function statusStyle(status: string) {
  if (status === "done") return { backgroundColor: colors.ok };
  if (status === "running") return { backgroundColor: colors.coral };
  if (status === "failed") return { backgroundColor: colors.bad };
  return { backgroundColor: colors.sand };
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 56,
    backgroundColor: colors.paper,
  },
  brand: {
    fontFamily: "serif",
    fontSize: 28,
    fontWeight: "700",
    color: colors.tealDeep,
  },
  title: {
    marginTop: 18,
    fontFamily: "serif",
    fontSize: 24,
    color: colors.ink,
  },
  topic: {
    marginTop: 6,
    fontSize: 16,
    color: colors.inkSoft,
  },
  list: {
    marginTop: 32,
    gap: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stageName: {
    fontSize: 17,
    fontWeight: "600",
    color: colors.ink,
  },
  msg: {
    fontSize: 13,
    color: colors.inkSoft,
    marginTop: 2,
  },
  status: {
    fontSize: 12,
    color: colors.inkSoft,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
});
