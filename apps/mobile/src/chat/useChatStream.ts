import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ArtefactState,
  ArtefactSummary,
  ChatMessage,
  PostMessageRequest,
  RegeneratePreviewResponse,
  Stage,
} from "@chotu/shared";
import { getStudioClient, StudioHttpError, StudioMockError } from "../api";

function mergeMessages(server: ChatMessage[], local: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const message of server) map.set(message.id, message);
  for (const message of local) map.set(message.id, message);
  return [...map.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

export function useChatStream(chatId: string, videoId: string) {
  const client = getStudioClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stage, setStage] = useState<Stage>("brief");
  const [artefacts, setArtefacts] = useState<Record<string, ArtefactState>>({});
  const [credits, setCredits] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const locks = useRef(new Set<string>());

  const upsert = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      const index = prev.findIndex((item) => item.id === message.id);
      if (index === -1) return [...prev, message];
      const next = prev.slice();
      next[index] = message;
      return next;
    });
  }, []);

  const rememberArtefact = useCallback((artefact: ArtefactSummary) => {
    setArtefacts((prev) => ({ ...prev, [artefact.id]: artefact.state }));
  }, []);

  useEffect(() => {
    let alive = true;
    let unsubscribe = () => {};
    try {
      unsubscribe = client.subscribe(chatId, (event) => {
        if (!alive) return;
        if (event.type === "message") upsert(event.message);
        else if (event.type === "stage") setStage(event.stage);
        else if (event.type === "artefact") rememberArtefact(event.artefact);
        else if (event.type === "error") setError(event.message);
      });
    } catch (err) {
      setMissing(true);
      setError(err instanceof Error ? err.message : "Chat nahi khuli.");
      return;
    }

    void (async () => {
      try {
        const [chat, me] = await Promise.all([client.getChat(chatId), client.getMe()]);
        if (!alive) return;
        if (chat.videoId !== videoId) {
          // Route param is still authoritative for approve-all; keep streaming this chat.
        }
        setMessages((prev) => mergeMessages(chat.messages, prev));
        setStage(chat.stage);
        setArtefacts(Object.fromEntries(chat.artefacts.map((item) => [item.id, item.state])));
        setCredits(me.creditBalance);
      } catch (err) {
        if (!alive) return;
        setMissing(true);
        setError(err instanceof Error ? err.message : "Chat nahi khuli.");
      }
    })();

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [chatId, client, rememberArtefact, upsert, videoId]);

  const refreshCredits = useCallback(async () => {
    const me = await client.getMe();
    setCredits(me.creditBalance);
  }, [client]);

  const run = useCallback(
    async (key: string, work: () => Promise<void>) => {
      if (locks.current.has(key)) return;
      locks.current.add(key);
      setError(null);
      try {
        await work();
      } catch (err) {
        if (
          (err instanceof StudioMockError || err instanceof StudioHttpError) &&
          err.code === "bad_state"
        ) {
          return;
        }
        setError(err instanceof Error ? err.message : "Nahi ho paya.");
      } finally {
        locks.current.delete(key);
      }
    },
    [],
  );

  const send = useCallback(
    (body: PostMessageRequest) => run("send", async () => {
      const response = await client.postMessage(chatId, body);
      if (response.message) upsert(response.message);
    }),
    [chatId, client, run, upsert],
  );

  const approve = useCallback(
    (artefactId: string) =>
      run(artefactId, async () => {
        const response = await client.approveArtefact(artefactId);
        rememberArtefact(response.artefact);
      }),
    [client, rememberArtefact, run],
  );

  const reject = useCallback(
    (artefactId: string, note: string) =>
      run(artefactId, async () => {
        const response = await client.rejectArtefact(artefactId, { rejectNote: note });
        rememberArtefact(response.artefact);
      }),
    [client, rememberArtefact, run],
  );

  const previewRegenerate = useCallback(
    async (artefactId: string): Promise<RegeneratePreviewResponse> => {
      const result = await client.regenerateArtefact(artefactId, 0);
      if (!("canAfford" in result)) {
        throw new StudioHttpError("preview", "Cost abhi nahi mili.");
      }
      return result;
    },
    [client],
  );

  const confirmRegenerate = useCallback(
    (artefactId: string) =>
      run(artefactId, async () => {
        const result = await client.regenerateArtefact(artefactId, 1);
        if ("artefact" in result) {
          rememberArtefact(result.artefact);
          setCredits(result.balance);
        } else {
          await refreshCredits();
        }
      }),
    [client, refreshCredits, rememberArtefact, run],
  );

  const approveAll = useCallback(
    () => run("approve-all", () => client.approveAllRemaining(videoId).then(() => undefined)),
    [client, run, videoId],
  );

  const awaitingCount = useMemo(
    () => Object.values(artefacts).filter((state) => state === "awaiting_approval").length,
    [artefacts],
  );

  const thinking = useMemo(() => {
    const generating = Object.values(artefacts).some((state) => state === "generating");
    const last = messages[messages.length - 1];
    return generating || last?.role === "user";
  }, [artefacts, messages]);

  return {
    messages,
    stage,
    artefacts,
    credits,
    error,
    missing,
    awaitingCount,
    thinking,
    send,
    approve,
    reject,
    previewRegenerate,
    confirmRegenerate,
    approveAll,
  };
}
