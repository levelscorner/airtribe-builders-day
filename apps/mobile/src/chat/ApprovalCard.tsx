import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type {
  ApprovalCardMessage,
  ArtefactState,
  ArtefactSummary,
  RegeneratePreviewResponse,
  VoicePreset,
} from "@chotu/shared";
import { readAgentReview, reviewFeedback } from "../agent-review";
import type { MediaProgressEvent } from "../media-contract";
import { progressCopy, providerChipLabel } from "../media-contract";
import { VOICES } from "../mock-fixtures";
import { MockMeter, PlayerCard } from "../screens/PlayerCard";
import { readRejectNote } from "../reject-note";
import { colors, hitSlop, layout } from "../theme";
import { AgentReviewPanel } from "./AgentReviewPanel";
import { ImageFrame } from "./MediaFrames";
import { KIND_LABEL, STAGE_LABEL } from "./labels";
import { VoicePicker } from "./VoicePicker";

function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function records(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object");
}

function PreviewBody({
  message,
  voices,
  voiceId,
  onVoice,
}: {
  message: ApprovalCardMessage;
  voices: VoicePreset[];
  voiceId?: string;
  onVoice: (id: string) => void;
}) {
  const preview = message.preview;
  if (message.artefactKind === "identity") {
    return (
      <View style={styles.stack}>
        {records(preview.members).map((member, index) => (
          <View key={`${str(member.name) ?? "cast"}-${index}`} style={styles.stack}>
            <Text style={styles.strong}>
              {str(member.name) ?? "Cast"} · {str(member.role) ?? ""}
            </Text>
            <Text style={styles.body}>{str(member.identityText) ?? ""}</Text>
            <Text style={styles.meta}>{strList(member.dnaChips).join(" · ")}</Text>
            <Text style={styles.meta}>Voice: {str(member.voiceLabel) ?? ""}</Text>
          </View>
        ))}
      </View>
    );
  }
  if (message.artefactKind === "sheet") {
    return (
      <View style={styles.stack}>
        <Text style={styles.body}>{strList(preview.names).join(", ")}</Text>
        <View style={styles.views}>
          {strList(preview.views).map((view) => (
            <ImageFrame key={view} swatch={str(preview.swatch)} label={view} />
          ))}
        </View>
      </View>
    );
  }
  if (message.artefactKind === "anchor") {
    return (
      <View style={styles.stack}>
        <ImageFrame swatch={str(preview.swatch)} label={strList(preview.names).join(", ") || "Face"} />
        <Text style={styles.body}>{str(preview.note) ?? ""}</Text>
      </View>
    );
  }
  if (message.artefactKind === "voice_sample") {
    return (
      <View style={styles.stack}>
        <VoicePicker voices={voices} selectedId={voiceId} onSelect={onVoice} />
        {records(preview.samples).map((sample, index) => (
          <View key={`${str(sample.name) ?? "voice"}-${index}`} style={styles.stack}>
            <Text style={styles.strong}>
              {str(sample.name) ?? "Voice"} · {str(sample.voiceLabel) ?? ""}
            </Text>
            <Text style={styles.body}>{str(sample.line) ?? ""}</Text>
            <MockMeter durationMs={num(sample.durationMs) ?? 2400} label={`${str(sample.name) ?? "Voice"} sample`} />
            <Text style={styles.meta}>Mock sample. Awaaz file server pe hai.</Text>
          </View>
        ))}
      </View>
    );
  }
  if (message.artefactKind === "script") {
    return (
      <View style={styles.stack}>
        {records(preview.scenes).map((scene, index) => {
          const doubts = strList(scene.doubts);
          return (
            <View key={`${num(scene.idx) ?? index}`} style={styles.stack}>
              <Text style={styles.strong}>
                Scene {num(scene.idx) ?? index + 1} · {str(scene.title) ?? ""}
              </Text>
              <Text style={styles.body}>{str(scene.narration) ?? ""}</Text>
              {doubts.length > 0 ? <Text style={styles.doubt}>Doubt: {doubts.join(" ")}</Text> : null}
            </View>
          );
        })}
      </View>
    );
  }
  if (message.artefactKind === "prompt") {
    return (
      <View style={styles.stack}>
        <Text style={styles.meta}>Image prompt</Text>
        <Text selectable style={styles.body}>
          {str(preview.imagePrompt) ?? ""}
        </Text>
        <Text style={styles.meta}>Video prompt</Text>
        <Text selectable style={styles.body}>
          {str(preview.videoPrompt) ?? ""}
        </Text>
      </View>
    );
  }
  if (message.artefactKind === "image") {
    return (
      <View style={styles.stack}>
        <ImageFrame large swatch={str(preview.swatch)} label={str(preview.sceneTitle) ?? message.title} />
        <Text style={styles.body}>{str(preview.caption) ?? ""}</Text>
      </View>
    );
  }
  if (message.artefactKind === "clip") {
    const url = str(preview.url) ?? `mock://clip/${message.artefactId}`;
    return (
      <View style={styles.stack}>
        <PlayerCard embedded title={message.title} url={url} durationMs={num(preview.durationMs) ?? 4000} />
        <Text style={styles.body}>{str(preview.caption) ?? ""}</Text>
      </View>
    );
  }
  if (message.artefactKind === "audio") {
    return (
      <View style={styles.stack}>
        <Text style={styles.strong}>
          {str(preview.speaker) ?? "Narrator"} · {str(preview.voiceLabel) ?? ""}
        </Text>
        <Text style={styles.body}>{str(preview.line) ?? ""}</Text>
        <MockMeter durationMs={num(preview.durationMs) ?? 4000} label="Audio" />
        <Text style={styles.meta}>Mock sample. Awaaz file server pe hai.</Text>
      </View>
    );
  }
  const url = str(preview.url) ?? `mock://final/${message.artefactId}`;
  return (
    <View style={styles.stack}>
      <PlayerCard embedded title={str(preview.title) ?? message.title} url={url} durationMs={num(preview.durationMs)} />
      <Text style={styles.body}>{str(preview.caption) ?? ""}</Text>
      <Text style={styles.meta}>{Math.round((num(preview.durationMs) ?? 0) / 1000)}s</Text>
    </View>
  );
}

export function ApprovalCard({
  message,
  liveState,
  artefact,
  progress,
  voices = VOICES,
  onApprove,
  onReject,
  onPreviewRegenerate,
  onConfirmRegenerate,
  onNeedCredits,
}: {
  message: ApprovalCardMessage;
  liveState: ArtefactState;
  artefact?: ArtefactSummary;
  progress?: MediaProgressEvent;
  voices?: VoicePreset[];
  onApprove: () => void;
  onReject: (note: string) => void;
  onPreviewRegenerate: () => Promise<RegeneratePreviewResponse>;
  onConfirmRegenerate: (feedback?: string) => void;
  onNeedCredits: () => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [quote, setQuote] = useState<RegeneratePreviewResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [pendingFeedback, setPendingFeedback] = useState<string | undefined>(undefined);
  const [draft, setDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const [voiceId, setVoiceId] = useState<string | undefined>();
  const version = num(message.preview.version) ?? 1;
  const rejectionNote = readRejectNote(message);
  const review =
    message.artefactKind === "script" ? readAgentReview(artefact) ?? readAgentReview(message.preview) : undefined;
  const fixFeedback = review ? reviewFeedback(review) : "";
  const chip = providerChipLabel(artefact) ?? providerChipLabel(message.preview);
  const voiceLabel = voices.find((voice) => voice.id === voiceId)?.label;
  const generating = liveState === "generating";
  const approved = !generating && (liveState === "approved" || message.state === "approved");
  const rejected = !generating && (liveState === "rejected" || message.state === "rejected");
  const waiting = !approved && !rejected && !generating;
  const stateWord = generating ? "generating" : approved ? "approved" : rejected ? "rejected" : "waiting";

  function feedbackText(typed?: string): string | undefined {
    const noteText = typed?.trim() ?? "";
    const voiceNote = voiceLabel ? `Voice: ${voiceLabel}` : "";
    const joined = [noteText, voiceNote && !noteText.includes(voiceNote) ? voiceNote : ""].filter(Boolean).join(" ");
    return joined ? joined.slice(0, 280) : undefined;
  }

  function askQuote(feedback?: string) {
    setQuoteError(null);
    setComposing(false);
    setPendingFeedback(feedback);
    void onPreviewRegenerate()
      .then(setQuote)
      .catch((err: unknown) => {
        setPendingFeedback(undefined);
        setQuoteError(err instanceof Error ? err.message : "Cost nahi mili.");
      });
  }

  return (
    <View style={styles.card} accessibilityLabel={`${message.title}, ${chip ?? "no model"}, ${stateWord}`}>
      <View style={styles.head}>
        <Text style={styles.stamp}>
          {STAGE_LABEL[message.stage]} · {KIND_LABEL[message.artefactKind]}
        </Text>
        {chip ? (
          <View style={styles.modelChip} accessibilityLabel={`Model ${chip}`}>
            <Text style={styles.modelChipText}>{chip}</Text>
          </View>
        ) : null}
        <Text style={[styles.state, approved ? styles.ok : null, rejected ? styles.bad : null]}>{stateWord}</Text>
      </View>
      <Text style={styles.title}>
        {message.title}
        {version > 1 ? ` · v${version}` : ""}
      </Text>
      <PreviewBody message={message} voices={voices} voiceId={voiceId} onVoice={setVoiceId} />
      {review ? <AgentReviewPanel review={review} /> : null}
      {progress ? (
        <Text style={progress.status === "failed" ? styles.doubt : styles.meta}>{progressCopy(progress)}</Text>
      ) : null}
      {rejectionNote ? <Text style={styles.doubt}>Note: {rejectionNote}</Text> : null}
      {generating ? <Text style={styles.meta}>Dobara bana rahe hain.</Text> : null}
      {waiting || rejected ? (
        <View style={styles.actions} key={`actions-${version}`}>
          {waiting ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Approve ${message.title}`}
              hitSlop={hitSlop}
              onPress={onApprove}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>Approve</Text>
            </Pressable>
          ) : null}
          {rejecting ? (
            <View style={styles.stack}>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Kya badalna hai?"
                placeholderTextColor={colors.inkSoft}
                style={styles.input}
                accessibilityLabel={`Reject note for ${message.title}`}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reject ${message.title}`}
                accessibilityState={{ disabled: !note.trim() }}
                disabled={!note.trim()}
                hitSlop={hitSlop}
                onPress={() => {
                  if (!note.trim()) return;
                  onReject(note.trim());
                  setRejecting(false);
                  setNote("");
                }}
                style={[styles.secondary, !note.trim() ? styles.off : null]}
              >
                <Text style={styles.secondaryText}>Reject</Text>
              </Pressable>
            </View>
          ) : waiting ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Reject ${message.title}`}
              hitSlop={hitSlop}
              onPress={() => setRejecting(true)}
              style={styles.secondary}
            >
              <Text style={styles.secondaryText}>Reject</Text>
            </Pressable>
          ) : null}
          {quote ? (
            <View style={styles.stack}>
              <Text style={styles.body}>
                {quote.creditCost} credits lagenge. Balance {quote.balance}.
                {quote.canAfford ? "" : " Credits kam hain."}
              </Text>
              {pendingFeedback ? <Text style={styles.meta}>Feedback: {pendingFeedback}</Text> : null}
              {quote.canAfford ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Haan, ${quote.creditCost} credits kaato, ${message.title}`}
                  hitSlop={hitSlop}
                  onPress={() => {
                    const feedback = pendingFeedback;
                    setQuote(null);
                    setPendingFeedback(undefined);
                    onConfirmRegenerate(feedback);
                  }}
                  style={styles.primary}
                >
                  <Text style={styles.primaryText}>Haan, {quote.creditCost} credits kaato</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Credits kam hain, packs dekho, ${message.title}`}
                  hitSlop={hitSlop}
                  onPress={onNeedCredits}
                  style={styles.primary}
                >
                  <Text style={styles.primaryText}>Packs dekho</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Rehne do, ${message.title}`}
                hitSlop={hitSlop}
                onPress={() => {
                  setQuote(null);
                  setPendingFeedback(undefined);
                  setComposing(false);
                }}
                style={styles.secondary}
              >
                <Text style={styles.secondaryText}>Rehne do</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.stack}>
              {fixFeedback ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Apply fixes and regenerate ${message.title}`}
                  hitSlop={hitSlop}
                  onPress={() => askQuote(fixFeedback)}
                  style={styles.secondary}
                >
                  <Text style={styles.secondaryText}>Apply fixes & regenerate</Text>
                </Pressable>
              ) : null}
              {composing ? (
                <View style={styles.stack}>
                  <TextInput
                    value={draft}
                    onChangeText={setDraft}
                    placeholder="Feedback, optional"
                    placeholderTextColor={colors.inkSoft}
                    style={styles.input}
                    accessibilityLabel={`Regenerate feedback for ${message.title}`}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Show regenerate cost for ${message.title}`}
                    hitSlop={hitSlop}
                    onPress={() => askQuote(feedbackText(draft))}
                    style={styles.secondary}
                  >
                    <Text style={styles.secondaryText}>Cost dikhao</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Regenerate ${message.title}, ${message.regenerateCreditCost} credits, pehle cost dikhao`}
                  hitSlop={hitSlop}
                  onPress={() => setComposing(true)}
                  style={styles.secondary}
                >
                  <Text style={styles.secondaryText}>Regenerate · {message.regenerateCreditCost} credits</Text>
                </Pressable>
              )}
            </View>
          )}
          {quoteError ? <Text style={styles.doubt}>{quoteError}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: colors.ink,
    padding: layout.pad,
    gap: 10,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 8,
  },
  modelChip: {
    backgroundColor: colors.chip,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  modelChipText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  stamp: {
    flex: 1,
    fontSize: 13,
    letterSpacing: 0.6,
    fontWeight: "700",
    color: colors.inkSoft,
  },
  state: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
  },
  ok: {
    color: colors.ok,
  },
  bad: {
    color: colors.danger,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    color: colors.ink,
  },
  stack: {
    gap: 8,
  },
  strong: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.ink,
  },
  body: {
    fontSize: 18,
    lineHeight: 26,
    color: colors.ink,
  },
  meta: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.inkSoft,
  },
  doubt: {
    fontSize: 16,
    lineHeight: 22,
    color: colors.danger,
  },
  views: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actions: {
    gap: 8,
    marginTop: 4,
  },
  primary: {
    minHeight: layout.hit,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.ink,
    paddingHorizontal: 12,
  },
  primaryText: {
    color: colors.paper,
    fontSize: 18,
    fontWeight: "700",
  },
  secondary: {
    minHeight: layout.hit,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.ink,
    paddingHorizontal: 12,
  },
  secondaryText: {
    color: colors.ink,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  off: {
    opacity: 0.4,
  },
  input: {
    minHeight: layout.hit,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    paddingHorizontal: 12,
    fontSize: 18,
    color: colors.ink,
  },
});
