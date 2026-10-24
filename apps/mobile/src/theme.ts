export const colors = {
  paper: "#F3EEE6",
  ink: "#1C1915",
  inkSoft: "#5E584E",
  card: "#FFFCF7",
  line: "rgba(28,25,21,0.16)",
  stripe: "#8F5A12",
  chip: "#E6DFD2",
  ok: "#245C3E",
  danger: "#8C3A2F",
  swatch: {
    marigold: "#E2C48A",
    indigo: "#C5CDE0",
    sage: "#C9D5C4",
    clay: "#E0C8BC",
  } as Record<string, string>,
};

export const layout = {
  maxWidth: 440,
  /** Chat plus a media side panel. Used from 1024px up. */
  desktop: 1120,
  side: 380,
  pad: 16,
  hit: 48,
};

/** Extra press area so a 48px control stays easy to hit with a thumb. */
export const hitSlop = { top: 8, bottom: 8, left: 8, right: 8 };
