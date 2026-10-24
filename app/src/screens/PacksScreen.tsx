import { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Linking, Platform } from "react-native";
import { colors } from "../theme";
import {
  completePack,
  getPackCatalog,
  getUser,
  startPackCheckout,
  type PackCatalog,
  type UserPublic,
} from "../api";

type Props = {
  user: UserPublic;
  onBack: () => void;
  onCredits: (u: UserPublic) => void;
};

export function PacksScreen({ user, onBack, onCredits }: Props) {
  const [pack, setPack] = useState<PackCatalog | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPackCatalog().then(setPack).catch((e) => setError(String(e)));
  }, []);

  async function onBuy() {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const checkout = await startPackCheckout(user.id);
      if (checkout.mock) {
        // Dev: complete immediately via API (same as opening mock-pay URL)
        if (Platform.OS === "web") {
          window.open(checkout.paymentUrl, "_blank");
        } else {
          await Linking.openURL(checkout.paymentUrl);
        }
        // Also complete via POST so credits refresh even if browser blocks popup
        const { user: next } = await completePack(checkout.id);
        onCredits(next);
        setMsg(`Mock payment recorded. You now have ${next.credits} credits.`);
      } else {
        if (Platform.OS === "web") window.open(checkout.paymentUrl, "_blank");
        else await Linking.openURL(checkout.paymentUrl);
        setMsg("Complete payment in Pine Labs, then return — pull credits will refresh.");
        // Poll user briefly
        setTimeout(async () => {
          try {
            const u = await getUser(user.id);
            onCredits(u);
          } catch {
            /* ignore */
          }
        }, 4000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.brand}>Chotu Studio</Text>
      <Text style={styles.title}>Video pack</Text>
      <Text style={styles.sub}>
        Credits gate each generation. {pack?.note ?? ""}
      </Text>

      <View style={styles.card}>
        <Text style={styles.price}>₹{pack?.priceInr ?? "…"}</Text>
        <Text style={styles.credits}>{pack?.credits ?? "…"} video credits</Text>
        <Text style={styles.badge}>{pack?.mock ? "Mock checkout (dev)" : "Pine Labs payment link"}</Text>
      </View>

      <Text style={styles.balance}>Your balance: {user.credits}</Text>
      {msg ? <Text style={styles.ok}>{msg}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.cta} onPress={onBuy} disabled={busy || !pack}>
        {busy ? <ActivityIndicator color={colors.cream} /> : <Text style={styles.ctaText}>Buy pack</Text>}
      </Pressable>
      <Pressable style={styles.secondary} onPress={onBack}>
        <Text style={styles.secondaryText}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 24, paddingTop: 56, backgroundColor: colors.paper },
  brand: { fontFamily: "serif", fontSize: 28, fontWeight: "700", color: colors.tealDeep },
  title: { marginTop: 16, fontFamily: "serif", fontSize: 24, color: colors.ink },
  sub: { marginTop: 8, fontSize: 14, color: colors.inkSoft, lineHeight: 20 },
  card: {
    marginTop: 28,
    backgroundColor: colors.cream,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.line,
  },
  price: { fontFamily: "serif", fontSize: 36, fontWeight: "700", color: colors.tealDeep },
  credits: { marginTop: 6, fontSize: 16, color: colors.ink },
  badge: { marginTop: 10, fontSize: 12, color: colors.inkSoft },
  balance: { marginTop: 18, fontWeight: "600", color: colors.ink },
  ok: { marginTop: 10, color: colors.ok },
  error: { marginTop: 10, color: colors.bad },
  cta: {
    marginTop: 24,
    backgroundColor: colors.coral,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: colors.cream, fontWeight: "700" },
  secondary: {
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: colors.teal,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: { color: colors.tealDeep, fontWeight: "700" },
});
