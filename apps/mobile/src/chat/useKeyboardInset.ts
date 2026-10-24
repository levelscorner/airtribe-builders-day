import { useEffect, useState } from "react";
import { Platform } from "react-native";

const FOCUS_STYLE = `
  [role="button"]:focus-visible,
  input:focus-visible,
  textarea:focus-visible {
    outline: 2px solid #1C1915;
    outline-offset: 2px;
  }
`;

/** SPA web export does not run app/+html.tsx, so set the keyboard viewport here too. */
export function useWebDocumentKeyboard(): void {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    document.documentElement.lang = "en";
    const meta = document.querySelector('meta[name="viewport"]');
    if (meta instanceof HTMLMetaElement) {
      const content = meta.content || "width=device-width, initial-scale=1";
      if (!content.includes("interactive-widget")) {
        meta.content = `${content}, viewport-fit=cover, interactive-widget=resizes-content`;
      }
    }
    if (!document.getElementById("chotu-focus")) {
      const style = document.createElement("style");
      style.id = "chotu-focus";
      style.textContent = FOCUS_STYLE;
      document.head.appendChild(style);
    }
  }, []);
}

/** Overlap of the on-screen keyboard with the layout viewport. Native returns 0. */
export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (typeof window === "undefined" || !window.visualViewport) return;
    const viewport = window.visualViewport;
    const update = () => {
      const overlap = window.innerHeight - viewport.height - viewport.offsetTop;
      setInset(overlap > 0 ? Math.round(overlap) : 0);
    };
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
    };
  }, []);

  return inset;
}

/** Keep a focused field in view on mobile web. Native keyboards use KeyboardAvoidingView. */
export function scrollFocusedField(event?: unknown): void {
  if (Platform.OS !== "web" || typeof document === "undefined") return;
  const fromEvent =
    event && typeof event === "object" ? (event as { target?: unknown }).target : undefined;
  const candidate =
    fromEvent && typeof fromEvent === "object" && "scrollIntoView" in fromEvent
      ? fromEvent
      : document.activeElement;
  if (!candidate || typeof candidate !== "object" || !("scrollIntoView" in candidate)) return;
  const node = candidate as { scrollIntoView?: (options?: ScrollIntoViewOptions) => void };
  requestAnimationFrame(() => {
    node.scrollIntoView?.({ block: "center", inline: "nearest" });
  });
}
