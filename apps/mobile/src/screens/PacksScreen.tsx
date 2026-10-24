import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { CreditPack } from "@chotu/shared";
import { getStudioClient } from "../api";
import { packPriceLabel, STARTER_CREDITS } from "../mock-fixtures";
import { declarePhonePePaid, listServerPacks, PHONEPE_PAYEE } from "../phonepe";
import { useWideLayout } from "../shell";
import { colors, hitSlop, layout } from "../theme";

import phonePeQr from "../../assets/payments/phonepe-qr.jpg";

type PayState =
  | { status: "idle" }
  | { status: "entering"; packId: string; utr: string }
  | { status: "pending"; packId: string; utr: string }
  | { status: "submitted"; packId: string; paymentId: string }
  | { status: "failure"; packId: string; utr: string; message: string };

function one(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function safeChatPath(path: string): string | null {
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    decoded = path;
  }
  return /^\/chat\/[^/?#]+$/.test(decoded) ? decoded : null;
}

export function PacksScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const from = one(useLocalSearchParams<{ from?: string }>().from);
  const wide = useWideLayout();
  const [packs, setPacks] = useState<CreditPack[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [pay, setPay] = useState<PayState>({ status: "idle" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMissing(false);
    try {
      const client = getStudioClient();
      const [me, catalogue, serverPacks] = await Promise.all([
        client.getMe(),
        client.listPacks(),
        listServerPacks(),
      ]);
      setBalance(me.creditBalance);
      setPacks(serverPacks && serverPacks.length > 0 ? serverPacks : catalogue.packs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Packs nahi khule.";
      setMissing(message.toLowerCase().includes("shuru") || message.toLowerCase().includes("naam"));
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function payFor(packId: string, utr: string) {
    if (pay.status === "pending") return;
    setPay({ status: "pending", packId, utr });
    setError(null);
    try {
      const me = await getStudioClient().getMe();
      const before = me.creditBalance;
      const declared = await declarePhonePePaid({ packId, utr, userId: me.id });
      if (declared.creditsGranted !== 0) {
        throw new Error("Credits tab badlenge jab admin approve kare.");
      }
      const after = await getStudioClient().getMe();
      setBalance(after.creditBalance === before ? after.creditBalance : before);
      setPay({ status: "submitted", packId, paymentId: declared.paymentId });
    } catch (err) {
      setPay({
        status: "failure",
        packId,
        utr,
        message: err instanceof Error ? err.message : "Payment nahi hua.",
      });
    }
  }

  const busy = pay.status === "pending";

  return (
    <View style={styles.screen}>
      <View
        style={[
          styles.column,
          wide ? styles.columnWide : null,
          { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 8) },
        ]}
      >
        <View style={styles.stripe} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wapas chat pe"
          hitSlop={hitSlop}
          onPress={() => {
            // Pop to the chat that opened this screen so its header reads the new balance.
            if (router.canGoBack()) {
              router.back();
              return;
            }
            const backTo = safeChatPath(from);
            if (backTo) {
              router.replace(backTo);
              return;
            }
            router.replace("/");
          }}
          style={styles.back}
        >
          <Text style={styles.backText}>Wapas</Text>
        </Pressable>
        <Text style={styles.brand}>Credit packs</Text>
        <Text style={styles.lead}>
          PhonePe se {PHONEPE_PAYEE} ko pay karo. QR scan karo, UTR daalo, phir I've paid. Credits tab aayenge jab
          admin approve kare. Starter grant {STARTER_CREDITS} credits hai.
        </Text>
        <Text accessibilityLabel={balance === null ? "Credits loading" : `${balance} credits`} style={styles.balance}>
          {balance === null ? "— credits" : `${balance} credits`}
        </Text>
        {loading && packs.length === 0 ? (
          <Text accessibilityLiveRegion="polite" accessibilityLabel="Packs khul rahe hain" style={styles.status}>
            Packs khul rahe hain…
          </Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
        {missing ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Signup pe jao"
            hitSlop={hitSlop}
            onPress={() => router.replace("/")}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Signup pe jao</Text>
          </Pressable>
        ) : null}
        {!loading && !missing && packs.length === 0 ? (
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            Abhi koi pack nahi.
          </Text>
        ) : null}
        {pay.status === "pending" ? (
          <Text accessibilityLiveRegion="polite" accessibilityLabel="UTR save ho raha hai" style={styles.status}>
            UTR save ho raha hai…
          </Text>
        ) : null}
        {pay.status === "submitted" ? (
          <Text accessibilityLiveRegion="polite" style={styles.ok}>
            Pending verification. Payment {pay.paymentId}. Credits abhi nahi badle.
          </Text>
        ) : null}
        {pay.status === "failure" ? (
          <View style={styles.stack}>
            <Text accessibilityRole="alert" style={styles.error}>
              {pay.message} Credits nahi badle.
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Phir se pay karo"
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              hitSlop={hitSlop}
              onPress={() => setPay({ status: "entering", packId: pay.packId, utr: pay.utr })}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Phir se</Text>
            </Pressable>
          </View>
        ) : null}
        {pay.status === "entering" || pay.status === "pending" ? (
          <View style={styles.stack}>
            <Image
              accessibilityLabel={`PhonePe QR for ${PHONEPE_PAYEE}`}
              resizeMode="contain"
              source={phonePeQr}
              style={styles.qr}
            />
            <Text style={styles.meta}>Payee {PHONEPE_PAYEE}</Text>
            <TextInput
              accessibilityLabel="UPI reference"
              autoCapitalize="characters"
              editable={pay.status === "entering"}
              onChangeText={(utr) => setPay({ status: "entering", packId: pay.packId, utr })}
              placeholder="UPI ref / UTR"
              style={styles.input}
              value={pay.utr}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="I've paid"
              accessibilityState={{ disabled: busy || pay.utr.trim().length < 8 }}
              disabled={busy || pay.utr.trim().length < 8}
              hitSlop={hitSlop}
              onPress={() => {
                void payFor(pay.packId, pay.utr);
              }}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>I've paid</Text>
            </Pressable>
          </View>
        ) : null}
        <ScrollView style={styles.flex} contentContainerStyle={[styles.list, wide ? styles.listWide : null]}>
          {packs.map((pack) => {
            const price = packPriceLabel(pack.amountInr);
            const pendingThis = pay.status === "pending" && pay.packId === pack.id;
            const chosen = (pay.status === "entering" || pay.status === "pending") && pay.packId === pack.id;
            return (
              <View
                key={pack.id}
                style={[styles.card, wide ? styles.cardWide : null]}
                accessibilityLabel={`${pack.label}, price ${price}, ${pack.credits} credits`}
              >
                <Text style={styles.cardTitle}>{pack.label}</Text>
                <Text style={styles.meta}>{pack.credits} credits</Text>
                <Text style={styles.price}>Price {price}</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Pay with PhonePe, ${pack.label}`}
                  accessibilityState={{ disabled: busy, busy: pendingThis }}
                  disabled={busy}
                  hitSlop={hitSlop}
                  onPress={() => setPay({ status: "entering", packId: pack.id, utr: pay.status === "failure" ? pay.utr : "" })}
                  style={[styles.primary, busy ? styles.off : null]}
                >
                  <Text style={styles.primaryText}>{chosen ? "QR upar hai" : pendingThis ? "Ruko…" : "Pay with PhonePe"}</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.paper,
  },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: layout.maxWidth,
    paddingHorizontal: layout.pad,
  },
  columnWide: {
    maxWidth: 960,
  },
  listWide: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  cardWide: {
    flexGrow: 1,
    flexBasis: 280,
  },
  stripe: {
    height: 6,
    backgroundColor: colors.stripe,
    marginBottom: 10,
  },
  back: {
    minHeight: layout.hit,
    alignSelf: "flex-start",
    justifyContent: "center",
    paddingRight: 12,
  },
  backText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
  },
  brand: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    color: colors.ink,
  },
  lead: {
    fontSize: 18,
    lineHeight: 26,
    color: colors.ink,
    marginTop: 8,
    marginBottom: 8,
  },
  balance: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.ink,
    marginBottom: 8,
  },
  status: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.inkSoft,
    marginBottom: 8,
  },
  ok: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.ok,
    marginBottom: 8,
  },
  error: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.danger,
    marginBottom: 8,
  },
  stack: {
    gap: 8,
    marginBottom: 8,
  },
  qr: {
    width: "100%",
    maxWidth: 320,
    height: 320,
    alignSelf: "center",
  },
  input: {
    minHeight: layout.hit,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
    color: colors.ink,
    fontSize: 18,
    paddingHorizontal: 12,
  },
  flex: {
    flex: 1,
  },
  list: {
    gap: 12,
    paddingBottom: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: colors.ink,
    padding: layout.pad,
    gap: 8,
  },
  cardTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    color: colors.ink,
  },
  meta: {
    fontSize: 16,
    color: colors.inkSoft,
  },
  price: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  primary: {
    minHeight: layout.hit,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  primaryText: {
    color: colors.paper,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  secondary: {
    minHeight: layout.hit,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.ink,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  secondaryText: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
  },
  off: {
    opacity: 0.55,
  },
});
