/**
 * Credit pricing. 1 credit = $0.01. A 60% margin means provider cost is 40% of
 * the price, so price = cost / 0.4, rounded up to the next credit.
 *
 * Provider cents below are estimates so reserve/quote have a number before
 * booth rates are filled in. The formula is the contract; the cents are not.
 */

export type CreditOperation =
  | "video_max"
  | "regenerate"
  | "cast_create"
  | "image"
  | "clip"
  | "audio"
  | "final";

export type ArtefactKind =
  | "identity"
  | "sheet"
  | "anchor"
  | "voice_sample"
  | "script"
  | "prompt"
  | "image"
  | "clip"
  | "audio"
  | "final";

export interface CreditQuote {
  operation: CreditOperation;
  creditCost: number;
}

/** Provider cost in US cents, before margin. */
export const PROVIDER_CENTS = {
  image: 4,
  clip: 20,
  audio: 2,
  final: 1,
  llm: 1,
} as const;

/** Ceiling used when reserving a video before scenes exist (60s cap). */
export const MAX_BILLABLE_SCENES = 8;

export function creditsForProviderCents(costCents: number): number {
  if (!Number.isInteger(costCents) || costCents < 0) {
    throw new Error("provider cost must be a non-negative integer number of cents");
  }
  if (costCents === 0) return 0;
  // price cents = ceil(cost * 5 / 2) = ceil(cost / 0.4). 1 credit = 1 cent of price.
  return Math.ceil((costCents * 5) / 2);
}

function sceneCents(): number {
  return PROVIDER_CENTS.image + PROVIDER_CENTS.clip + PROVIDER_CENTS.audio;
}

export function providerCentsFor(input: {
  operation: CreditOperation;
  artefactKind?: ArtefactKind;
}): number {
  switch (input.operation) {
    case "image":
      return PROVIDER_CENTS.image;
    case "clip":
      return PROVIDER_CENTS.clip;
    case "audio":
      return PROVIDER_CENTS.audio;
    case "final":
      return PROVIDER_CENTS.final;
    case "video_max":
      return MAX_BILLABLE_SCENES * sceneCents() + PROVIDER_CENTS.final;
    case "cast_create":
      return PROVIDER_CENTS.llm + PROVIDER_CENTS.image + PROVIDER_CENTS.image + PROVIDER_CENTS.audio;
    case "regenerate":
      return centsForArtefact(input.artefactKind);
    default: {
      const _never: never = input.operation;
      return _never;
    }
  }
}

function centsForArtefact(kind: ArtefactKind | undefined): number {
  switch (kind) {
    case "image":
    case "sheet":
    case "anchor":
      return PROVIDER_CENTS.image;
    case "clip":
      return PROVIDER_CENTS.clip;
    case "audio":
    case "voice_sample":
      return PROVIDER_CENTS.audio;
    case "final":
      return PROVIDER_CENTS.final;
    case "script":
    case "prompt":
    case "identity":
      return PROVIDER_CENTS.llm;
    case undefined:
      return sceneCents();
    default: {
      const _never: never = kind;
      return _never;
    }
  }
}

export function quote(input: {
  operation: CreditOperation;
  artefactKind?: ArtefactKind;
}): CreditQuote {
  return {
    operation: input.operation,
    creditCost: creditsForProviderCents(providerCentsFor(input)),
  };
}
