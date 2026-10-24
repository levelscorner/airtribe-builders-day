const BLOCKED =
  /\b(disney|pixar|ghibli|miyazaki|dreamworks|marvel|dc comics|nintendo|pokemon|pokémon|hello kitty|warner|illumination|barbie|star wars|van gogh|picasso|monet)\b/gi;

const STYLE_OF =
  /\b(?:in the style of|inspired by)\s+[A-Za-z][\w.'-]*(?:\s+[A-Za-z][\w.'-]*){0,3}/gi;

export function stripBlockedNames(text: string): string {
  return text.replace(STYLE_OF, " ").replace(BLOCKED, " ").replace(/\s+/g, " ").trim();
}

export function traitsFromArtText(text: string): { artStyle: string; artStyleTraits: string[] } {
  const cleaned = stripBlockedNames(text);
  const parts = cleaned
    .split(/[,;/]|\band\b/i)
    .map((part) =>
      part
        .replace(/[^a-z0-9\s-]/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase(),
    )
    .filter((part) => part.length > 2 && part.length < 60);
  const traits = [...new Set(parts)].slice(0, 6);
  const artStyleTraits = traits.length > 0 ? traits : ["simple illustrated look"];
  return { artStyle: artStyleTraits.join(", "), artStyleTraits };
}
