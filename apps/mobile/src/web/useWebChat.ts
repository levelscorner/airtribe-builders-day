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

export function useWebChat(chatId: string) {
  const client = getStudioClient();
  const runtime = useStudioRuntime();
  const [mediaProgress, setMediaProgress] = useState<
    Record<string, MediaProgressEvent>
  >({});
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [artefacts, setArtefacts] = useState<ArtefactSummary[]>([]);
  const [stage, setStage] = useState<Stage>("brief");
  const [credits, setCredits] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const lock = useRef(false);
  const hydrate = useCallback((chat: GetChatResponse) => {
    setMessages(chat.messages);
    setArtefacts(chat.artefacts);
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
        setArtefacts((prev) =>
          prev.some((item) => item.id === event.artefact.id)
            ? prev.map((item) =>
                item.id === event.artefact.id ? event.artefact : item,
              )
            : [...prev, event.artefact],
        );
      if (event.type === "stage") setStage(event.stage);
      if (event.type === "error") setError(event.message);
    });
    void Promise.all([client.getChat(chatId), client.getMe()])
      .then(([chat, me]) => {
        if (alive) {
          hydrate(chat);
          setCredits(me.creditBalance);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(e.message);
          setLoaded(true);
        }
      });
    return () => {
      alive = false;
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
      const [chat, me] = await Promise.all([
        client.getChat(chatId),
        client.getMe(),
      ]);
      hydrate(chat);
      setCredits(me.creditBalance);
      return true;
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Something went wrong. Please try again.",
      );
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return {
    client,
    runtime,
    mediaProgress: Object.values(mediaProgress),
    messages,
    artefacts,
    stage,
    credits,
    error,
    setError,
    busy,
    loaded,
    run,
  };
}
