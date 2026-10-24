/** Character timings for captions. Milliseconds, same order as `chars`. */
export interface CaptionAlignment {
  chars: string[];
  startMs: number[];
  endMs: number[];
}

/** Mock cadence. Live ElevenLabs timings replace this. */
export const MOCK_CAPTION_MS = 80;

export function mockAlignment(text: string): CaptionAlignment {
  const chars = [...text];
  return {
    chars,
    startMs: chars.map((_, index) => index * MOCK_CAPTION_MS),
    endMs: chars.map((_, index) => (index + 1) * MOCK_CAPTION_MS),
  };
}

export function alignmentDurationMs(alignment: CaptionAlignment): number {
  if (alignment.endMs.length === 0) return 0;
  return alignment.endMs[alignment.endMs.length - 1] ?? 0;
}

export function alignmentFromSeconds(alignment: {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
} | null | undefined): CaptionAlignment {
  if (!alignment) return { chars: [], startMs: [], endMs: [] };
  return {
    chars: alignment.characters,
    startMs: alignment.character_start_times_seconds.map((seconds) => Math.round(seconds * 1000)),
    endMs: alignment.character_end_times_seconds.map((seconds) => Math.round(seconds * 1000)),
  };
}
