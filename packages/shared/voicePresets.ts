/**
 * ElevenLabs catalogue for the cast picker.
 * `VoicePreset` in types.ts is the persisted /v1/voices row. This bank is the
 * picker shape (lang, gender, age, role). Every voice uses eleven_multilingual_v2.
 */
export interface VoiceBankPreset {
  id: string;
  voiceId: string;
  label: string;
  lang: 'hi' | 'hinglish' | 'en-IN';
  gender: 'male' | 'female' | 'neutral';
  age: 'kid' | 'young' | 'adult' | 'old';
  role: string;
  model: string;
  sampleUrl?: string;
}

const MODEL = 'eleven_multilingual_v2';

export const VOICE_PRESETS: readonly VoiceBankPreset[] = [
  { id: 'hi-male-young', voiceId: 'FZkK3TvQ0pjyDmT8fzIW', label: 'Hi-Male-Young', lang: 'hi', gender: 'male', age: 'young', role: 'character', model: MODEL },
  { id: 'hi-female-young', voiceId: 'RABOvaPec1ymXz02oDQi', label: 'Hi-Female-Young', lang: 'hi', gender: 'female', age: 'young', role: 'character', model: MODEL },
  { id: 'kid-cartoon', voiceId: 'Sm1seazb4gs7RSlUVw7c', label: 'Kid-Cartoon', lang: 'hi', gender: 'neutral', age: 'kid', role: 'cartoon', model: MODEL },
  { id: 'hinglish-funny-male', voiceId: '7b9mYhmnp0y2qSH1FnBL', label: 'Hinglish-Funny-Male', lang: 'hinglish', gender: 'male', age: 'adult', role: 'character', model: MODEL },
  { id: 'old-male', voiceId: 'iBRcUZbbi4hxPMzDCm71', label: 'Old-Male', lang: 'hi', gender: 'male', age: 'old', role: 'character', model: MODEL },
  { id: 'old-female', voiceId: 'ZthnDvLLxYzM9qeFVSJe', label: 'Old-Female', lang: 'hi', gender: 'female', age: 'old', role: 'character', model: MODEL },
  { id: 'narrator-male', voiceId: 'd0grukerEzs069eKIauC', label: 'Narrator-Male', lang: 'hi', gender: 'male', age: 'adult', role: 'narrator', model: MODEL },
  { id: 'narrator-female', voiceId: '1qEiC6qsybMkmnNdVMbK', label: 'Narrator-Female', lang: 'hi', gender: 'female', age: 'adult', role: 'narrator', model: MODEL },
  { id: 'educator-female', voiceId: 'MF4J4IDTRo0AxOO4dpFR', label: 'Educator-Female', lang: 'hi', gender: 'female', age: 'adult', role: 'educator', model: MODEL },
  { id: 'en-in-male', voiceId: 'siw1N9V8LmYeEWKyWBxv', label: 'En-IN-Male', lang: 'en-IN', gender: 'male', age: 'adult', role: 'character', model: MODEL },
  { id: 'en-in-female', voiceId: '4O1sYUnmtThcBoSBrri7', label: 'En-IN-Female', lang: 'en-IN', gender: 'female', age: 'adult', role: 'character', model: MODEL },
];
