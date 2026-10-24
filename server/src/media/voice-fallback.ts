/** ElevenLabs is primary. Seedance native audio covers a scene only when that call fails. */
export function needsSeedanceNativeAudio(url: string | undefined, error?: unknown): boolean {
  if (error) return true;
  return !url?.trim();
}

export function seedanceFallbackNote(sceneNumber: number): string {
  return `voice fallback: seedance native audio (scene ${sceneNumber})`;
}
