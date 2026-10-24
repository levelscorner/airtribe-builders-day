import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Linking, Platform } from "react-native";
import { colors } from "../theme";
import { API_BASE_URL, listEvents, type TractionEvent } from "../api";

type Props = { onBack: () => void };

export function AdminScreen({ onBack }: Props) {
  const [events, setEvents] = useState<TractionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listEvents()
      .then((r) => setEvents(r.events))
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 2000);
    return () => clearInterval(id);
  }, [refresh]);

  function openHtmlAdmin() {
    const url = `${API_BASE_URL}/admin`;
    if (Platform.OS === "web") window.open(url, "_blank");
    else void Linking.openURL(url);
  }

  function openCsv() {
    const url = `${API_BASE_URL}/api/admin/events.csv`;
    if (Platform.OS === "web") window.open(url, "_blank");
    else void Linking.openURL(url);
  }

  const counts = {
    signup: events.filter((e) => e.type === "signup").length,
    job_created: events.filter((e) => e.type === "job_created").length,
    approval: events.filter((e) => e.type === "approval").length,
    payment: events.filter((e) => e.type === "payment").length,
    render_done: events.filter((e) => e.type === "render_done").length,
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <Text style={styles.brand}>Chotu Studio</Text>
      <Text style={styles.title}>Traction event log</Text>
      <Text style={styles.sub}>Timestamped proof for Track 04 — screenshot or export CSV.</Text>

      <View style={styles.stats}>
        {Object.entries(counts).map(([k, v]) => (
          <View key={k} style={styles.stat}>
            <Text style={styles.statN}>{v}</Text>
            <Text style={styles.statL}>{k}</Text>
          </View>
        ))}
      </View>

      <View style={styles.rowBtns}>
        <Pressable style={styles.btn} onPress={openHtmlAdmin}>
          <Text style={styles.btnText}>Open HTML admin</Text>
        </Pressable>
        <Pressable style={styles.btn} onPress={openCsv}>
          <Text style={styles.btnText}>Export CSV</Text>
        </Pressable>
        <Pressable style={styles.btnGhost} onPress={onBack}>
          <Text style={styles.btnGhostText}>Back</Text>
        </Pressable>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {events
        .slice()
        .reverse()
        .map((e) => (
          <View key={e.id} style={styles.ev}>
            <Text style={styles.evAt}>{e.at.replace("T", " ").slice(0, 19)} UTC</Text>
            <Text style={styles.evType}>{e.type}</Text>
            <Text style={styles.evDetail}>{e.detail}</Text>
          </View>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 48, paddingBottom: 40, backgroundColor: colors.paper },
  brand: { fontFamily: "serif", fontSize: 26, fontWeight: "700", color: colors.tealDeep },
  title: { marginTop: 12, fontFamily: "serif", fontSize: 22, color: colors.ink },
  sub: { marginTop: 6, fontSize: 13, color: colors.inkSoft },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 18 },
  stat: {
    backgroundColor: colors.cream,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
    minWidth: 88,
  },
  statN: { fontSize: 20, fontWeight: "700", color: colors.tealDeep },
  statL: { fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  rowBtns: { marginTop: 16, gap: 8 },
  btn: {
    backgroundColor: colors.teal,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnText: { color: colors.cream, fontWeight: "700" },
  btnGhost: {
    borderWidth: 1.5,
    borderColor: colors.teal,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  btnGhostText: { color: colors.tealDeep, fontWeight: "700" },
  error: { color: colors.bad, marginTop: 10 },
  ev: {
    marginTop: 12,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  evAt: { fontSize: 11, color: colors.inkSoft },
  evType: { marginTop: 2, fontSize: 12, fontWeight: "700", color: colors.teal, textTransform: "uppercase" },
  evDetail: { marginTop: 4, fontSize: 14, color: colors.ink, lineHeight: 20 },
});
