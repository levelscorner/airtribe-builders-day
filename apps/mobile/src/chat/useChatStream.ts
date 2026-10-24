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
import type { MediaProgressEvent, RegenerateSceneRequest } from "../media-contract";
import { parseMediaProgress } from "../media-contract";
import { applyRejectNote } from "../reject-note";

export type ChatLoadStatus = "loading" | "ready" | "error";

const STATE_RANK: Record<ArtefactState, number> = {
  pending: 1,
  awaiting_approval: 1,
  approved: 2,
  rejected: 2,
  failed: 2,
  generating: 3,
};

function stateRank(state: ArtefactState): number {
  return STATE_RANK[state];
}

function previewVersion(message: ChatMessage): number {
  if (message.kind !== "approval") return 0;
  const value = message.preview.version;
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function legalCardState(state: ArtefactState): "awaiting_approval" | "approved" | "rejected" | null {
  if (state === "awaiting_approval" || state === "approved" || state === "rejected") return state;
  return null;
}

/** Higher artefact version wins. Same version: generating beats a decision, a decision beats waiting. */
export function isNewerArtefact(next: ArtefactSummary, prev: ArtefactSummary | undefined): boolean {
  if (!prev) return true;
  if (next.version !== prev.version) return next.version > prev.version;
  if (stateRank(next.state) !== stateRank(prev.state)) return stateRank(next.state) > stateRank(prev.state);
  return next.updatedAt >= prev.updatedAt;
}

function incomingIsStale(
  incoming: ChatMessage,
  current: ChatMessage | undefined,
  artefact: ArtefactSummary | undefined,
): boolean {
  if (incoming.kind !== "approval") return false;
  const incomingVersion = previewVersion(incoming);
  if (current?.kind === "approval") {
    const currentVersion = previewVersion(current);
    if (incomingVersion < currentVersion) return true;
    if (incomingVersion === currentVersion && stateRank(incoming.state) < stateRank(current.state)) return true;
  }
  if (!artefact || artefact.id !== incoming.artefactId) return false;
  if (incomingVersion < artefact.version) return true;
  return incomingVersion === artefact.version && stateRank(incoming.state) < stateRank(artefact.state);
}

function projectMessage(message: ChatMessage, artefact: ArtefactSummary, force: boolean): ChatMessage {
  if (message.kind !== "approval" || message.artefactId !== artefact.id) return message;
  if (!force && artefact.state === "generating") return message;
  const legal = legalCardState(artefact.state);
  if (!legal) return message;
  if (!force && previewVersion(message) > artefact.version) return message;
  if (!force && previewVersion(message) === artefact.version && stateRank(message.state) > stateRank(legal)) {
    return message;
  }
  return applyRejectNote(
    {
      ...message,
      regenerateCreditCost: artefact.creditCost,
      state: legal,
    },
    artefact.payload,
  );
}

function mergeTranscript(server: ChatMessage[], local: ChatMessage[]): ChatMessage[] {
  const map = new Map<string, ChatMessage>();
  for (const message of server) map.set(message.id, message);
  for (const message of local) {
    const existing = map.get(message.id);
    if (!existing) {
      map.set(message.id, message);
      continue;
    }
    if (incomingIsStale(message, existing, undefined)) continue;
    map.set(message.id, message);
  }
  return [...map.values()].sort(
    (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  );
}

function stageIndex(stage: Stage): number {
  const order: Stage[] = ["brief", "cast", "script", "prompts", "images", "clips", "audio", "final", "done"];
  const index = order.indexOf(stage);
  return index === -1 ? 0 : index;
}

export function useChatStream(chatId: string) {
  const client = getStudioClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stage, setStage] = useState<Stage>("brief");
  const [artefacts, setArtefacts] = useState<Record<string, ArtefactSummary>>({});
  const [mediaProgress, setMediaProgress] = useState<Record<string, MediaProgressEvent>>({});
  const [videoId, setVideoId] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const creditsRef = useRef<number | null>(null);
  const writeCredits = useCallback((next: number | null) => {
    creditsRef.current = next;
    setCredits(next);
  }, []);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState<ChatLoadStatus>("loading");
  const [retryToken, setRetryToken] = useState(0);
  const artefactsRef = useRef<Record<string, ArtefactSummary>>({});
  const videoRef = useRef<string | null>(null);
  const locks = useRef(new Set<string>());

  const writeArtefact = useCallback((artefact: ArtefactSummary, force: boolean) => {
    const current = artefactsRef.current[artefact.id];
    if (!force && !isNewerArtefact(artefact, current)) return;
    const next = { ...artefactsRef.current, [artefact.id]: artefact };
    artefactsRef.current = next;
    setArtefacts(next);
    setMessages((prev) => prev.map((message) => projectMessage(message, artefact, force)));
  }, []);

  const upsert = useCallback((message: ChatMessage) => {
    setMessages((prev) => {
      const index = prev.findIndex((item) => item.id === message.id);
      const current = index === -1 ? undefined : prev[index];
      const artefact = message.kind === "approval" ? artefactsRef.current[message.artefactId] : undefined;
      if (incomingIsStale(message, current, artefact)) return prev;
      if (index === -1) {
        return [...prev, message].sort(
          (left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
        );
      }
      const next = prev.slice();
      next[index] = message;
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    let unsubscribe = () => {};
    artefactsRef.current = {};
    videoRef.current = null;
    setMessages([]);
    setArtefacts({});
    setMediaProgress({});
    setVideoId(null);
    setStage("brief");
    setStatus("loading");
    setError(null);
    setMissing(false);

    const fail = (err: unknown) => {
      const code = err instanceof StudioMockError ? err.code : "";
      setMissing(code === "no_chat" || code === "no_user");
      setError(err instanceof Error ? err.message : "Chat nahi khuli.");
      setStatus("error");
    };

    try {
      unsubscribe = client.subscribe(chatId, (event) => {
        if (!alive) return;
        const progress = parseMediaProgress(event);
        if (progress) {
          setMediaProgress((prev) => ({ ...prev, [progress.artefactId]: progress }));
          return;
        }
        if (event.type === "message") upsert(event.message);
        else if (event.type === "stage") {
          setStage((current) => (stageIndex(event.stage) >= stageIndex(current) ? event.stage : current));
        } else if (event.type === "artefact") writeArtefact(event.artefact, false);
        else if (event.type === "error") setError(event.message);
      });
    } catch (err) {
      fail(err);
      return () => {
        alive = false;
      };
    }

    void (async () => {
      try {
        const [chat, me] = await Promise.all([client.getChat(chatId), client.getMe()]);
        if (!alive) return;
        const mergedArtefacts = { ...artefactsRef.current };
        for (const artefact of chat.artefacts) {
          const current = mergedArtefacts[artefact.id];
          if (isNewerArtefact(artefact, current)) mergedArtefacts[artefact.id] = artefact;
        }
        artefactsRef.current = mergedArtefacts;
        videoRef.current = chat.videoId;
        setArtefacts(mergedArtefacts);
        setVideoId(chat.videoId);
        setStage((current) => (stageIndex(chat.stage) >= stageIndex(current) ? chat.stage : current));
        setMessages((prev) => {
          let merged = mergeTranscript(chat.messages, prev);
          for (const artefact of Object.values(mergedArtefacts)) {
            merged = merged.map((message) => projectMessage(message, artefact, false));
          }
          return merged;
        });
        writeCredits(me.creditBalance);
        setStatus("ready");
      } catch (err) {
        if (!alive) return;
        fail(err);
      }
    })();

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [chatId, client, retryToken, upsert, writeArtefact, writeCredits]);

  const reload = useCallback(() => {
    setRetryToken((token) => token + 1);
  }, []);

  const refreshCredits = useCallback(async () => {
    const me = await client.getMe();
    writeCredits(me.creditBalance);
  }, [client, writeCredits]);

  const run = useCallback(async (key: string, work: () => Promise<void>) => {
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
  }, []);

  const restoreIfUntouched = useCallback(
    (previous: ArtefactSummary | undefined, drafted: ArtefactSummary | null) => {
      if (!previous || !drafted) return;
      const current = artefactsRef.current[previous.id];
      if (!current) return;
      if (current.updatedAt === drafted.updatedAt && current.state === drafted.state) {
        writeArtefact(previous, true);
      }
    },
    [writeArtefact],
  );

  const send = useCallback(
    (body: PostMessageRequest) =>
      run("send", async () => {
        const response = await client.postMessage(chatId, body);
        if (response.message) upsert(response.message);
      }),
    [chatId, client, run, upsert],
  );

  const approve = useCallback(
    (artefactId: string) =>
      run(artefactId, async () => {
        const previous = artefactsRef.current[artefactId];
        const drafted =
          previous && previous.state === "awaiting_approval" ? { ...previous, state: "approved" as const } : null;
        if (drafted) writeArtefact(drafted, false);
        try {
          const response = await client.approveArtefact(artefactId);
          writeArtefact(response.artefact, false);
        } catch (err) {
          restoreIfUntouched(previous, drafted);
          throw err;
        }
      }),
    [client, restoreIfUntouched, run, writeArtefact],
  );

  const reject = useCallback(
    (artefactId: string, note: string) =>
      run(artefactId, async () => {
        const previous = artefactsRef.current[artefactId];
        const drafted =
          previous && (previous.state === "awaiting_approval" || previous.state === "rejected")
            ? {
                ...previous,
                state: "rejected" as const,
                payload: { ...previous.payload, rejectNote: note },
              }
            : null;
        if (drafted) writeArtefact(drafted, false);
        try {
          const response = await client.rejectArtefact(artefactId, { rejectNote: note });
          writeArtefact(response.artefact, false);
        } catch (err) {
          restoreIfUntouched(previous, drafted);
          throw err;
        }
      }),
    [client, restoreIfUntouched, run, writeArtefact],
  );

  const previewRegenerate = useCallback(
    async (artefactId: string, scope?: RegenerateSceneRequest): Promise<RegeneratePreviewResponse> => {
      const result = await client.regenerateArtefact(artefactId, 0, scope?.feedback, scope);
      if (!("canAfford" in result)) {
        throw new StudioHttpError("preview", "Cost abhi nahi mili.");
      }
      return result;
    },
    [client],
  );

  const confirmRegenerate = useCallback(
    (artefactId: string, feedback?: string, scope?: RegenerateSceneRequest) =>
      run(scope ? `${artefactId}:${scope.target}` : artefactId, async () => {
        const previous = artefactsRef.current[artefactId];
        const cost = previous?.creditCost ?? 0;
        const drafted = previous ? { ...previous, state: "generating" as const } : null;
        if (drafted) writeArtefact(drafted, false);
        const balanceNow = creditsRef.current;
        const debit = balanceNow !== null && cost > 0 ? cost : 0;
        if (debit > 0 && balanceNow !== null) writeCredits(balanceNow - debit);
        try {
          const result = await client.regenerateArtefact(artefactId, 1, feedback ?? scope?.feedback, scope);
          if ("artefact" in result) {
            writeArtefact(result.artefact, false);
            writeCredits(result.balance);
          } else {
            await refreshCredits();
          }
        } catch (err) {
          restoreIfUntouched(previous, drafted);
          if (debit > 0 && balanceNow !== null && creditsRef.current === balanceNow - debit) {
            writeCredits(balanceNow);
          }
          throw err;
        }
      }),
    [client, refreshCredits, restoreIfUntouched, run, writeArtefact, writeCredits],
  );

  const approveAll = useCallback(
    () =>
      run("approve-all", async () => {
        const id = videoRef.current;
        if (!id) return;
        const response = await client.approveAllRemaining(id);
        for (const artefactId of response.approvedIds) {
          const current = artefactsRef.current[artefactId];
          if (!current) continue;
          writeArtefact({ ...current, state: "approved" }, false);
        }
        setStage((current) => (stageIndex(response.stage) >= stageIndex(current) ? response.stage : current));
      }),
    [client, run, writeArtefact],
  );

  const awaitingCount = useMemo(() => {
    const ids = new Set(
      Object.values(artefacts)
        .filter((item) => item.state === "awaiting_approval")
        .map((item) => item.id),
    );
    // Approval cards can arrive over SSE before the artefact map hydrates.
    for (const message of messages) {
      if (message.kind === "approval" && message.state === "awaiting_approval") {
        ids.add(message.artefactId);
      }
    }
    return ids.size;
  }, [artefacts, messages]);

  const thinking = useMemo(() => {
    const generating = Object.values(artefacts).some((item) => item.state === "generating");
    const last = messages[messages.length - 1];
    return generating || last?.role === "user";
  }, [artefacts, messages]);

  return {
    messages,
    stage,
    artefacts,
    mediaProgress,
    videoId,
    credits,
    error,
    missing,
    status,
    awaitingCount,
    thinking,
    send,
    approve,
    reject,
    previewRegenerate,
    confirmRegenerate,
    approveAll,
    reload,
    refreshCredits,
  };
}
