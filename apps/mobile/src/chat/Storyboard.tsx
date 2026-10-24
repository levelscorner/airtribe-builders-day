import { createElement, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import type { ArtefactSummary, RegeneratePreviewResponse, VoicePreset } from "@chotu/shared";
import type { MediaProgressEvent, SceneMediaArtefact, SceneMediaKind, StoryboardScene } from "../media-contract";
import { progressCopy, providerChipLabel, readFinal, readStoryboard } from "../media-contract";
import { PlayerCard, MockMeter } from "../screens/PlayerCard";
import { useWideLayout } from "../shell";
import { colors, hitSlop, layout } from "../theme";
import { ImageFrame } from "./MediaFrames";

const SWATCHES = ["marigold", "indigo", "sage", "clay"] as const;

function tickFor(
  progress: Record<string, MediaProgressEvent>,
  media: SceneMediaArtefact,
): MediaProgressEvent | undefined {
  const event = progress[media.id];
  if (!event || event.kind !== media.kind) return undefined;
  if (event.sceneId && event.sceneId !== media.sceneId) return undefined;
  return event;
}

function voiceName(voices: VoicePreset[], voiceId: string): string {
  return voices.find((voice) => voice.id === voiceId)?.label ?? "Preset voice";
}

function DownloadLink({ url }: { url: string }) {
  if (Platform.OS === "web") {
    return createElement(
      "a",
      {
        href: url,
        download: "chotu-final.mp4",
        "aria-label": "Download final cut",
        style: {
          minHeight: layout.hit,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: colors.ink,
          color: colors.paper,
          fontWeight: 700,
          fontSize: 18,
          textDecoration: "none",
          padding: "0 12px",
        },
      },
      "Download",
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Download final cut"
      hitSlop={hitSlop}
      onPress={() => {
        void Linking.openURL(url);
      }}
      style={styles.primary}
    >
      <Text style={styles.primaryText}>Download</Text>
    </Pressable>
  );
}

function SceneCard({
  scene,
  media,
  artefacts,
  progress,
  voices,
  onApprove,
  onPreview,
  onConfirm,
}: {
  scene: StoryboardScene;
  media: SceneMediaArtefact[];
  artefacts: Record<string, ArtefactSummary>;
  progress: Record<string, MediaProgressEvent>;
  voices: VoicePreset[];
  onApprove: (artefactId: string) => void;
  onPreview: (artefactId: string, scope: { sceneId: string; target: SceneMediaKind; feedback?: string }) => Promise<RegeneratePreviewResponse>;
  onConfirm: (artefactId: string, scope: { sceneId: string; target: SceneMediaKind; feedback?: string }) => void;
}) {
  const rows = media.filter((item) => item.sceneId === scene.id);
  const image = rows.find((item) => item.kind === "image");
  const clip = rows.find((item) => item.kind === "clip");
  const voice = rows.find((item) => item.kind === "voice");
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<{ target: SceneMediaKind; feedback?: string } | null>(null);
  const [quote, setQuote] = useState<RegeneratePreviewResponse | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const waiting = rows.some((item) => item.state === "awaiting_approval");
  const approved = rows.length > 0 && rows.every((item) => item.state === "approved");
  const swatch = image ? artefacts[image.id]?.payload.swatch : undefined;
  const tone = typeof swatch === "string" ? swatch : SWATCHES[(scene.index - 1) % SWATCHES.length];

  async function ask(target: SceneMediaKind, feedback: string) {
    const row = rows.find((item) => item.kind === target);
    if (!row) return;
    const note = feedback.trim();
    setQuoteError(null);
    setPending({ target, feedback: note || undefined });
    try {
      const preview = await onPreview(row.id, { sceneId: scene.id, target, feedback: note || undefined });
      setQuote(preview);
    } catch (err) {
      setQuote(null);
      setQuoteError(err instanceof Error ? err.message : "Cost nahi mili.");
    }
  }

  function line(row: SceneMediaArtefact | undefined, label: string) {
    if (!row) return null;
    const event = tickFor(progress, row);
    const copy = event ? progressCopy(event) : row.state === "failed" ? "Failed" : null;
    const failed = event?.status === "failed" || row.state === "failed";
    return (
      <View style={styles.progressRow}>
        <Text style={[styles.meta, failed ? styles.bad : null]}>
          {label}
          {copy ? ` · ${copy}` : ""}
        </Text>
        {failed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Retry ${label} for scene ${scene.index}`}
            hitSlop={hitSlop}
            onPress={() => {
              void ask(row.kind, draft);
            }}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Retry</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.card} accessibilityLabel={`Scene ${scene.index} card`}>
      <View style={styles.head}>
        <Text style={styles.title}>Scene {scene.index}</Text>
        <Text style={styles.meta}>{scene.durationSec}s</Text>
        <Text style={[styles.meta, approved ? styles.ok : null]}>{approved ? "Approved" : waiting ? "Review" : "Working"}</Text>
      </View>
      <View style={styles.chips}>
        {rows.map((row) => (
          <View key={row.id} style={styles.chip}>
            <Text style={styles.chipText}>{providerChipLabel(row) ?? row.providerLabel}</Text>
          </View>
        ))}
      </View>
      {image ? <ImageFrame label={`Scene ${scene.index}`} swatch={tone} /> : null}
      {line(image, "Image")}
      {clip ? (
        <PlayerCard
          embedded
          title={`Scene ${scene.index} clip`}
          url={clip.url ?? `mock://clip/${scene.index}`}
          durationMs={scene.durationSec * 1000}
        />
      ) : null}
      {line(clip, "Video")}
      <Text style={styles.strong}>{voiceName(voices, scene.voiceId)}</Text>
      <Text style={styles.body}>{scene.vo}</Text>
      {voice ? <MockMeter glyph durationMs={scene.durationSec * 1000} label={`${voiceName(voices, scene.voiceId)} scene ${scene.index}`} /> : null}
      {line(voice, "VO")}
      {waiting ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Approve scene ${scene.index}`}
          hitSlop={hitSlop}
          onPress={() => {
            for (const row of rows) {
              if (row.state === "awaiting_approval") onApprove(row.id);
            }
          }}
          style={styles.primary}
        >
          <Text style={styles.primaryText}>Approve</Text>
        </Pressable>
      ) : null}
      {quote ? (
        <View style={styles.stack}>
          {pending?.feedback ? <Text style={styles.meta}>Feedback: {pending.feedback}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Haan, ${quote.creditCost} credits kaato, scene ${scene.index}`}
            hitSlop={hitSlop}
            onPress={() => {
              const scope = pending;
              const row = scope ? rows.find((item) => item.kind === scope.target) : undefined;
              setQuote(null);
              setPending(null);
              if (row && scope) onConfirm(row.id, { sceneId: scene.id, target: scope.target, feedback: scope.feedback });
            }}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>Haan, {quote.creditCost} credits kaato</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Rehne do, scene ${scene.index}`}
            hitSlop={hitSlop}
            onPress={() => {
              setQuote(null);
              setPending(null);
            }}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Rehne do</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.stack}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Feedback, optional"
            placeholderTextColor={colors.inkSoft}
            accessibilityLabel={`Regenerate feedback for scene ${scene.index}`}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Regenerate image for scene ${scene.index}`}
            hitSlop={hitSlop}
            onPress={() => {
              void ask("image", draft);
            }}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Regenerate image</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Regenerate video for scene ${scene.index}`}
            hitSlop={hitSlop}
            onPress={() => {
              void ask("clip", draft);
            }}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Regenerate video</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Regenerate VO for scene ${scene.index}`}
            hitSlop={hitSlop}
            onPress={() => {
              void ask("voice", draft);
            }}
            style={styles.secondary}
          >
            <Text style={styles.secondaryText}>Regenerate VO</Text>
          </Pressable>
          {quoteError ? <Text style={styles.bad}>{quoteError}</Text> : null}
        </View>
      )}
    </View>
  );
}

export function Storyboard({
  artefacts,
  progress,
  voices,
  onApprove,
  onPreview,
  onConfirm,
}: {
  artefacts: Record<string, ArtefactSummary>;
  progress: Record<string, MediaProgressEvent>;
  voices: VoicePreset[];
  onApprove: (artefactId: string) => void;
  onPreview: (
    artefactId: string,
    scope: { sceneId: string; target: SceneMediaKind; feedback?: string },
  ) => Promise<RegeneratePreviewResponse>;
  onConfirm: (artefactId: string, scope: { sceneId: string; target: SceneMediaKind; feedback?: string }) => void;
}) {
  const wide = useWideLayout();
  const list = Object.values(artefacts);
  const board = readStoryboard(list);
  if (!board) return null;
  const ready = board.board.scenes.every((scene) => {
    const rows = board.media.filter((item) => item.sceneId === scene.id);
    const kinds = new Set(rows.map((item) => item.kind));
    return kinds.has("image") && kinds.has("clip") && kinds.has("voice") && rows.every((item) => item.state === "approved");
  });
  const finalCut = list.find((item) => item.kind === "final");
  const file = finalCut ? readFinal(finalCut) : undefined;
  return (
    <View accessibilityLabel="Storyboard" style={styles.board}>
      <Text style={styles.heading}>Storyboard</Text>
      <Text style={styles.meta}>Char scenes. Approve karo, tab final cut judegi.</Text>
      <View style={wide ? styles.grid : styles.column}>
        {board.board.scenes.map((scene) => (
          <View key={scene.id} style={wide ? styles.gridItem : styles.columnItem}>
            <SceneCard
              scene={scene}
              media={board.media}
              artefacts={artefacts}
              progress={progress}
              voices={voices}
              onApprove={onApprove}
              onPreview={onPreview}
              onConfirm={onConfirm}
            />
          </View>
        ))}
      </View>
      {ready ? (
        <View style={styles.final}>
          <Text style={styles.heading}>Final cut</Text>
          {file ? (
            <>
              <PlayerCard embedded title="Final cut" url={file.url} durationMs={20000} />
              <DownloadLink url={file.downloadUrl} />
            </>
          ) : (
            <Text style={styles.meta}>Final cut jud rahi hai.</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    gap: 12,
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.ink,
  },
  column: {
    gap: 12,
  },
  columnItem: {
    width: "100%",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  gridItem: {
    flexGrow: 1,
    flexBasis: 280,
    minWidth: 260,
    maxWidth: 360,
  },
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
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.ink,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: colors.chip,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.ink,
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
  ok: {
    color: colors.ok,
  },
  bad: {
    color: colors.danger,
    fontSize: 16,
  },
  progressRow: {
    gap: 8,
  },
  stack: {
    gap: 8,
  },
  input: {
    minHeight: layout.hit,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    color: colors.ink,
    fontSize: 18,
    paddingHorizontal: 12,
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
  },
  final: {
    gap: 10,
    backgroundColor: colors.card,
    borderColor: colors.line,
    borderWidth: 1,
    borderLeftWidth: 3,
    borderLeftColor: colors.ink,
    padding: layout.pad,
  },
});
