import type {
  ArtefactKind,
  CastMember,
  CreditPack,
  Genre,
  Language,
  VoicePreset,
} from "@chotu/shared";

/** Open question in docs/13. Mock grants this many credits at signup. */
export const STARTER_CREDITS = 80;

/** Shown on the card before Regenerate. Not a live price list. */
export const REGEN_COST: Record<ArtefactKind, number> = {
  identity: 2,
  sheet: 6,
  anchor: 4,
  voice_sample: 2,
  script: 3,
  prompt: 1,
  image: 4,
  clip: 8,
  audio: 3,
  final: 5,
};

/**
 * Pack catalogue is Mars's. These two rows exist so the mock can answer
 * GET /v1/packs without inventing a checkout UI.
 */
export const PACKS: CreditPack[] = [
  { id: "pack_100", label: "100 credits", credits: 100, amountInr: 99 },
  { id: "pack_300", label: "300 credits", credits: 300, amountInr: 249 },
];

export const VOICES: VoicePreset[] = [
  {
    id: "warm_kid_female",
    elevenlabsVoiceId: "mock_warm_kid_female",
    label: "Warm kid-friendly",
    languageHint: "Hindi, Hinglish",
    stability: 0.4,
    style: 0.2,
    defaultCastName: "Mini",
    isPreset: true,
  },
  {
    id: "playful_young_male",
    elevenlabsVoiceId: "mock_playful_young_male",
    label: "Playful young male",
    languageHint: "Hinglish",
    stability: 0.45,
    style: 0.35,
    defaultCastName: "Chintu",
    isPreset: true,
  },
  {
    id: "confident_presenter_female",
    elevenlabsVoiceId: "mock_confident_presenter_female",
    label: "Confident presenter",
    languageHint: "Hinglish, English",
    stability: 0.4,
    style: 0.25,
    defaultCastName: "Riya",
    isPreset: true,
  },
  {
    id: "deep_storyteller_male",
    elevenlabsVoiceId: "mock_deep_storyteller_male",
    label: "Deep storyteller",
    languageHint: "Hindi, English",
    stability: 0.55,
    style: 0.15,
    defaultCastName: "Narrator",
    isPreset: true,
  },
];

export const CAST: CastMember[] = [
  {
    id: "cast_chintu",
    name: "Chintu",
    role: "mascot",
    identityText:
      "A cheerful eight-year-old boy, round face, short black hair, yellow kurta, red sneakers, one chipped front tooth.",
    dnaChips: ["round face", "yellow kurta", "red sneakers", "chipped tooth", "short black hair"],
    artStyle: "bright_2d",
    voiceId: "playful_young_male",
    version: 1,
    status: "approved",
    isPreset: true,
    higgsfieldElementId: "el_chintu",
  },
  {
    id: "cast_mini",
    name: "Mini",
    role: "mascot",
    identityText:
      "A curious eight-year-old girl, two braids, green pinafore, cloth satchel, a small scar on her left eyebrow.",
    dnaChips: ["two braids", "green pinafore", "cloth satchel", "eyebrow scar", "curious eyes"],
    artStyle: "bright_2d",
    voiceId: "warm_kid_female",
    version: 1,
    status: "approved",
    isPreset: true,
    higgsfieldElementId: "el_mini",
  },
  {
    id: "cast_riya",
    name: "Riya",
    role: "presenter",
    identityText:
      "A friendly woman in her twenties, shoulder-length wavy hair, indigo cotton shirt, small gold studs, warm half-smile.",
    dnaChips: ["wavy hair", "indigo shirt", "gold studs", "half-smile", "shoulder length"],
    artStyle: "product_studio",
    voiceId: "confident_presenter_female",
    version: 1,
    status: "approved",
    isPreset: true,
    higgsfieldElementId: "el_riya",
  },
  {
    id: "cast_narrator",
    name: "Narrator",
    role: "narrator",
    identityText: "No on-screen character. A calm adult voice, unhurried, never shouting.",
    dnaChips: ["off screen", "calm", "adult", "unhurried"],
    artStyle: "cinematic",
    voiceId: "deep_storyteller_male",
    version: 1,
    status: "approved",
    isPreset: true,
  },
];

export const CAST_BUNDLES: Record<string, string[]> = {
  kids_pair: ["cast_chintu", "cast_mini"],
  riya: ["cast_riya"],
  narrator: ["cast_narrator"],
};

export interface IntakeQuestion {
  field: string;
  prompt: string;
  options?: { id: string; label: string }[];
  allowFreeText?: boolean;
  allowSkip?: boolean;
  allowDefaults?: boolean;
}

export const INTAKE: IntakeQuestion[] = [
  {
    field: "topic",
    prompt: "Video kis baare mein hai? Ek seedhi line.",
    allowFreeText: true,
    allowDefaults: true,
  },
  {
    field: "genre",
    prompt: "Kis tarah ka video banana hai?",
    options: [
      { id: "kids", label: "Kids edu-fun" },
      { id: "ad", label: "Ad" },
      { id: "faceless", label: "Faceless" },
    ],
    allowDefaults: true,
  },
  {
    field: "aspect_ratio",
    prompt: "Aspect ratio kya rakhein? Reel ke liye 9:16.",
    options: [
      { id: "9:16", label: "9:16 reel" },
      { id: "1:1", label: "1:1 square" },
      { id: "16:9", label: "16:9 wide" },
    ],
    allowSkip: true,
    allowDefaults: true,
  },
  {
    field: "resolution",
    prompt: "Resolution — 720p ya 1080p?",
    options: [
      { id: "720p", label: "720p" },
      { id: "1080p", label: "1080p" },
    ],
    allowDefaults: true,
  },
  {
    field: "target_seconds",
    prompt: "Kitne second ka? 60 se upar nahi.",
    options: [
      { id: "25", label: "25s" },
      { id: "45", label: "45s" },
      { id: "60", label: "60s" },
    ],
    allowFreeText: true,
    allowDefaults: true,
  },
  {
    field: "language",
    prompt: "Zubaan kaunsi ho?",
    options: [
      { id: "hi", label: "Hindi" },
      { id: "hinglish", label: "Hinglish" },
      { id: "en", label: "English" },
    ],
    allowDefaults: true,
  },
  {
    field: "audience",
    prompt: "Kaun dekhega? Ek chhoti line.",
    allowFreeText: true,
    allowSkip: true,
    allowDefaults: true,
  },
  {
    field: "art_style",
    prompt: "Art style chuno, ya apne words mein likho. Artist ya brand ka naam mat likho.",
    options: [
      { id: "bright_2d", label: "Bright 2D cartoon" },
      { id: "soft_3d", label: "Soft 3D toon" },
      { id: "product_studio", label: "Product studio" },
      { id: "cinematic", label: "Cinematic" },
      { id: "folk_flat", label: "Folk-art flat" },
    ],
    allowFreeText: true,
    allowSkip: true,
    allowDefaults: true,
  },
  {
    field: "cast",
    prompt: "Cast kaun? 1 ya 2 members chuno.",
    options: [
      { id: "cast_chintu", label: "Chintu" },
      { id: "cast_mini", label: "Mini" },
      { id: "cast_riya", label: "Riya" },
      { id: "cast_narrator", label: "Narrator (off screen)" },
    ],
    allowDefaults: true,
  },
];

const STYLE_LABEL: Record<string, string> = {
  bright_2d: "Bright 2D cartoon",
  soft_3d: "Soft 3D toon",
  product_studio: "Product studio",
  cinematic: "Cinematic",
  folk_flat: "Folk-art flat",
};

const STYLE_TRAITS: Record<string, string[]> = {
  bright_2d: ["flat shapes", "bold outlines", "warm daylight", "simple faces"],
  soft_3d: ["soft clay forms", "gentle shadows", "rounded shapes", "even light"],
  product_studio: ["clean backdrop", "softbox light", "sharp product", "uncluttered"],
  cinematic: ["natural light", "shallow depth", "muted colour", "real textures"],
  folk_flat: ["flat folk shapes", "earth pigments", "patterned borders", "even light"],
};

export function styleLabel(id: string): string {
  return STYLE_LABEL[id] ?? id;
}

export function styleTraits(id: string): string[] {
  return STYLE_TRAITS[id] ?? [id];
}

export function defaultsFor(genre: Genre): {
  aspectRatio: string;
  resolution: "720p" | "1080p";
  targetSeconds: number;
  language: Language;
  audience: string;
  artStyle: string;
  castBundle: string;
} {
  if (genre === "ad") {
    return {
      aspectRatio: "9:16",
      resolution: "1080p",
      targetSeconds: 25,
      language: "hinglish",
      audience: "local shoppers",
      artStyle: "product_studio",
      castBundle: "riya",
    };
  }
  if (genre === "faceless") {
    return {
      aspectRatio: "9:16",
      resolution: "1080p",
      targetSeconds: 50,
      language: "hi",
      audience: "general",
      artStyle: "cinematic",
      castBundle: "narrator",
    };
  }
  return {
    aspectRatio: "9:16",
    resolution: "720p",
    targetSeconds: 45,
    language: "hinglish",
    audience: "parents and kids",
    artStyle: "bright_2d",
    castBundle: "kids_pair",
  };
}

export function castById(id: string): CastMember | undefined {
  return CAST.find((member) => member.id === id);
}

export function voiceLabel(voiceId: string | undefined): string {
  return VOICES.find((voice) => voice.id === voiceId)?.label ?? "Preset voice";
}

export interface DraftScene {
  idx: number;
  title: string;
  narration: string;
  durationMs: number;
  doubts: string[];
  castIds: string[];
}

export function buildScenes(input: {
  genre: Genre;
  language: Language;
  topic: string;
  targetSeconds: number;
  castIds: string[];
}): { title: string; scenes: DraftScene[] } {
  const topic = input.topic.trim() || "aaj ka topic";
  const per = Math.round((input.targetSeconds * 1000) / 3);
  const names = input.castIds
    .map((id) => castById(id)?.name)
    .filter((name): name is string => Boolean(name));
  const who = names[0] ?? "Narrator";
  const beats = beatsFor(input.language, input.genre, topic, who);
  const titles = ["Hook", "Beats", "Payoff"];
  return {
    title: topic.slice(0, 48),
    scenes: beats.map((narration, index) => ({
      idx: index + 1,
      title: titles[index] ?? `Scene ${index + 1}`,
      narration,
      durationMs: per,
      doubts: index === 1 ? [doubtLine(input.language)] : [],
      castIds: input.castIds,
    })),
  };
}

function doubtLine(language: Language): string {
  if (language === "en") return "Age band is unclear — six or ten?";
  return "Umra clear nahi — 6 saal ya 10?";
}

function beatsFor(language: Language, genre: Genre, topic: string, who: string): string[] {
  if (language === "hi") {
    return [
      `${who} seedha sawal puchta hai: ${topic}?`,
      "तीन बातें, छोटे वाक्य. एक बात, एक उदाहरण.",
      "अंत में एक सवाल. जवाब दर्शक खुद सोचे.",
    ];
  }
  if (language === "en") {
    const shape = genre === "ad" ? "the offer" : "the question";
    return [
      `${who} opens on ${topic}. Start with ${shape}, not a lecture.`,
      "One fact, then one picture the viewer can repeat.",
      "End on a short question so the last line stays.",
    ];
  }
  const mid = genre === "ad" ? "Product dikhao, phir ek fayda, phir offer." : "Beech ki baat simple. Ek fact, ek example.";
  return [
    `${topic} — ${who} seedha hook maarta hai, bina jhanjhat.`,
    mid,
    "End pe chhota sawal, taaki video yaad rahe.",
  ];
}
