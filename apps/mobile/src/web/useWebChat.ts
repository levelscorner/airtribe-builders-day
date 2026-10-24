import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ArtefactSummary,
  ChatMessage,
  GetChatResponse,
  Stage,
} from "@chotu/shared";
import { parseMediaProgress, type MediaProgressEvent } from "../media-contract";
import { useStudioRuntime } from "./generation";
import { getStudioClient } from "../api";
import {
  isMissingSession,
  rememberBrowserSession,
  dismissSessionNotice as storeDismissSessionNotice,
  shouldShowSessionNotice,
} from "./session-notice";

/** Keep artefacts a live event already delivered when a chat snapshot raced the insert. */
function mergeArtefacts(
  prev: ArtefactSummary[],
  incoming: ArtefactSummary[],
): ArtefactSummary[] {
  const prevById = new Map(prev.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const merged = incoming.map((item) => {
    seen.add(item.id);
    const local = prevById.get(item.id);
    if (local && local.updatedAt > item.updatedAt) return local;
    return item;
  });
  for (const item of prev) {
    if (!seen.has(item.id)) merged.push(item);
  }
  return merged;
}

export function useWebChat(chatId: string) {
  const client = getStudioClient();
  const runtime = useStudioRuntime();
  const [mediaProgress, setMediaProgress] = useState<
    Record<string, MediaProgressEvent>
  >({});
  const [videoId, setVideoId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [artefacts, setArtefacts] = useState<ArtefactSummary[]>([]);
  const [stage, setStage] = useState<Stage>("brief");
  const [credits, setCredits] = useState<number | null>(null);
  const [creditsEnabled, setCreditsEnabled] = useState(false);
  const [error, setError] = useState("");
  const [sessionNotice, setSessionNotice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const lock = useRef(false);
  const showSessionNotice = () => {
    // Record it immediately. Switching chats remounts this hook, and SSE
    // hydrate runs again on every reconnect, so a later mount must stay quiet.
    if (!shouldShowSessionNotice()) return;
    storeDismissSessionNotice();
    setSessionNotice(true);
  };
  const hydrate = useCallback((chat: GetChatResponse) => {
    setVideoId(chat.videoId);
    setMessages((prev) => {
      const ids = new Set(chat.messages.map((item) => item.id));
      return [...chat.messages, ...prev.filter((item) => !ids.has(item.id))].sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt),
      );
    });
    setArtefacts((prev) => mergeArtefacts(prev, chat.artefacts));
    setStage(chat.stage);
    setLoaded(true);
  }, []);
  useEffect(() => {
    let alive = true;
    const unsubscribe = client.subscribe(chatId, (event) => {
      if (!alive) return;
      const media = parseMediaProgress(event);
      if (media)
        setMediaProgress((prev) => {
          const previous = prev[media.artefactId];
          if (
            previous?.jobId === media.jobId &&
            ["done", "failed"].includes(previous.status) &&
            ["queued", "generating"].includes(media.status)
          )
            return prev;
          return { ...prev, [media.artefactId]: media };
        });
      if (event.type === "message")
        setMessages((prev) => {
          const next = prev.filter((item) => item.id !== event.message.id);
          return [...next, event.message].sort((a, b) =>
            a.createdAt.localeCompare(b.createdAt),
          );
        });
      if (event.type === "artefact")
        setArtefacts((prev) => {
          const existing = prev.find((item) => item.id === event.artefact.id);
          if (!existing) return [...prev, event.artefact];
          // A chat snapshot can be newer than this frame. Don't rewind it.
          if (existing.updatedAt >= event.artefact.updatedAt) return prev;
          return prev.map((item) =>
            item.id === event.artefact.id ? event.artefact : item,
          );
        });
      if (event.type === "stage") setStage(event.stage);
      if (event.type === "error") {
        // Hydrate runs on every SSE open, including reconnects. A missing
        // session must not refill the banner after dismiss or signup.
        if (isMissingSession(event) || isMissingSession(event.message)) {
          showSessionNotice();
          return;
        }
        if (/live updates ruk gayi/i.test(event.message)) return;
        setError(event.message);
      }
    });
    void (async () => {
      const [chatOutcome, meOutcome] = await Promise.all([
        client.getChat(chatId).then(
          (chat) => ({ ok: true as const, chat }),
          (error: unknown) => ({ ok: false as const, error }),
        ),
        client.getMe().then(
          (me) => ({ ok: true as const, me }),
          (error: unknown) => ({ ok: false as const, error }),
        ),
      ]);
      if (!alive) return;
      if (chatOutcome.ok) hydrate(chatOutcome.chat);
      else {
        setLoaded(true);
        if (isMissingSession(chatOutcome.error)) {
          showSessionNotice();
        } else {
          setError(
            chatOutcome.error instanceof Error
              ? chatOutcome.error.message
              : "Could not open this chat.",
          );
        }
      }
      if (meOutcome.ok) {
        rememberBrowserSession();
        setSessionNotice(false);
        setCredits(meOutcome.me.creditBalance);
        setCreditsEnabled(meOutcome.me.creditsEnabled === true);
      } else if (isMissingSession(meOutcome.error)) {
        showSessionNotice();
      }
    })();
    // Re-attach on return: generation runs server-side, so poll the chat while
    // it is open in case SSE frames were missed while the user was elsewhere.
    const poll = setInterval(() => {
      if (lock.current) return;
      void client
        .getChat(chatId)
        .then((chat) => {
          if (alive && !lock.current) hydrate(chat);
        })
        .catch(() => {});
    }, 5000);
    return () => {
      alive = false;
      clearInterval(poll);
      // Only stops listening. Never cancels server-side generation.
      unsubscribe();
    };
  }, [chatId, client, hydrate]);
  const run = async (work: () => Promise<unknown>) => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
      const chat = await client.getChat(chatId);
      hydrate(chat);
      try {
        const me = await client.getMe();
        rememberBrowserSession();
        setSessionNotice(false);
        setCredits(me.creditBalance);
        setCreditsEnabled(me.creditsEnabled === true);
      } catch (error) {
        if (!isMissingSession(error)) throw error;
        showSessionNotice();
      }
      return true;
    } catch (e) {
      if (isMissingSession(e)) {
        showSessionNotice();
      } else {
        setError(
          e instanceof Error
            ? e.message
            : "Something went wrong. Please try again.",
        );
      }
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return {
    client,
    runtime,
    videoId,
    mediaProgress: Object.values(mediaProgress),
    messages,
    artefacts,
    stage,
    credits,
    creditsEnabled,
    error,
    setError,
    sessionNotice,
    dismissSessionNotice() {
      storeDismissSessionNotice();
      setSessionNotice(false);
    },
    busy,
    loaded,
    run,
  };
}
