import type { MediaProviderName } from "@chotu/shared";
import { moduleMock, type EnvLike } from "./flags.js";

/**
 * Provider that was actually asked to run. Failure rows must not say "mock"
 * when Seedance, gpt-image-2, or ElevenLabs was the call.
 */
export function providerAfterFailure(
  kind: "image" | "clip" | "voice",
  env: EnvLike,
): MediaProviderName {
  if (kind === "clip") return moduleMock(env, "CLIP_MOCK") ? "mock" : "ark";
  if (kind === "voice") return moduleMock(env, "VOICE_MOCK") ? "mock" : "elevenlabs";
  if (moduleMock(env, "IMAGE_MOCK")) return "mock";
  const explicit = env.IMAGE_PROVIDER?.trim().toLowerCase();
  if (explicit === "mock") return "mock";
  if (explicit === "openai") return "openai";
  if (explicit === "ark") return "ark";
  if (explicit === "higgsfield") return "higgsfield";
  return "ark";
}
