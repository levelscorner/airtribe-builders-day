import { useCallback, useEffect, useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, hitSlop, layout } from "../theme";

/** Scroll views on web trap position:fixed, so the enlarged frame is attached to document.body. */
function useWebOverlay(open: boolean, label: string, tone: string, onClose: () => void): void {
  useEffect(() => {
    if (Platform.OS !== "web" || !open || typeof document === "undefined") return;
    const closeOverlay = () => onClose();
    const host = document.createElement("div");
    host.setAttribute("role", "dialog");
    host.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:50",
      "background:rgba(28,25,21,0.72)",
      "display:flex",
      "flex-direction:column",
      "align-items:center",
      "justify-content:center",
      "gap:12px",
      "padding:16px",
    ].join(";");
    const sheet = document.createElement("div");
    sheet.setAttribute("aria-label", `Image, ${label}`);
    sheet.textContent = label;
    sheet.style.cssText = [
      "width:min(420px, calc(100vw - 32px))",
      "aspect-ratio:9/16",
      "max-height:70vh",
      `background:${tone}`,
      "color:#1C1915",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "text-align:center",
      "font:700 22px sans-serif",
      "padding:16px",
    ].join(";");
    const close = document.createElement("button");
    close.type = "button";
    close.textContent = "Close";
    close.setAttribute("aria-label", `Close ${label}`);
    close.style.cssText = [
      "min-height:48px",
      "min-width:160px",
      "background:#F3EEE6",
      "color:#1C1915",
      "border:0",
      "font:700 18px sans-serif",
    ].join(";");
    close.addEventListener("click", closeOverlay);
    host.append(sheet, close);
    document.body.appendChild(host);
    return () => {
      close.removeEventListener("click", closeOverlay);
      host.remove();
    };
  }, [open, label, tone, onClose]);
}

/** Swatch stand-in for a mock image. Tap opens a larger frame. Remote URLs are not fetched. */
export function ImageFrame({
  label,
  swatch,
  large,
}: {
  label: string;
  swatch?: string;
  large?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const tone = colors.swatch[swatch ?? ""] ?? colors.swatch.marigold;
  const closeOverlay = useCallback(() => setOpen(false), []);
  useWebOverlay(open && Platform.OS === "web", label, tone, closeOverlay);
  const overlay = open ? (
    <View style={styles.backdrop}>
      <View style={[styles.sheet, { backgroundColor: tone }]} accessibilityLabel={`Image, ${label}`}>
        <Text style={styles.sheetText}>{label}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Close ${label}`}
        hitSlop={hitSlop}
        onPress={() => setOpen(false)}
        style={styles.close}
      >
        <Text style={styles.closeText}>Close</Text>
      </Pressable>
    </View>
  ) : null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Enlarge ${label}`}
        hitSlop={hitSlop}
        onPress={() => setOpen(true)}
        style={[styles.frame, large ? styles.large : null, { backgroundColor: tone }]}
      >
        <Text style={styles.frameText}>{label}</Text>
      </Pressable>
      {Platform.OS === "web" ? null : (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          {overlay}
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 92,
    aspectRatio: 3 / 4,
    alignItems: "center",
    justifyContent: "center",
    padding: 6,
  },
  large: {
    width: "100%",
    aspectRatio: 9 / 16,
    maxHeight: 420,
  },
  frameText: {
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    color: colors.ink,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(28,25,21,0.72)",
    alignItems: "center",
    justifyContent: "center",
    padding: layout.pad,
    gap: 12,
  },
  sheet: {
    width: "100%",
    maxWidth: 420,
    aspectRatio: 9 / 16,
    maxHeight: 640,
    alignItems: "center",
    justifyContent: "center",
    padding: layout.pad,
  },
  sheetText: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "700",
    textAlign: "center",
    color: colors.ink,
  },
  close: {
    minHeight: layout.hit,
    minWidth: 160,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.paper,
    paddingHorizontal: 16,
  },
  closeText: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
});
