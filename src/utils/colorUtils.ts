import {
  color,
  interpolate,
  interpolateGreens,
  interpolateGreys,
  interpolateRainbow,
  interpolateRdYlGn,
  interpolateRgbBasis,
  interpolateSpectral,
  type RGBColor,
  range,
  scaleSequential,
  shuffler
} from "d3";

/**
 * Convert RGB or RGBA color to HEX
 * @param {string} rgba - The RGB or RGBA color string
 * @returns {string} - The HEX color string
 */
export const toHEX = (rgba: string): string => {
  if (rgba.charAt(0) === "#") return rgba;

  const matches = rgba.match(/^rgba?[\s+]?\([\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?,[\s+]?(\d+)[\s+]?/i);
  return matches && matches.length === 4
    ? "#" +
        `0${parseInt(matches[1], 10).toString(16)}`.slice(-2) +
        `0${parseInt(matches[2], 10).toString(16)}`.slice(-2) +
        `0${parseInt(matches[3], 10).toString(16)}`.slice(-2)
    : "";
};

/** Predefined set of 12 distinct colors */
export const C_12 = [
  "#dababf",
  "#fb8072",
  "#80b1d3",
  "#fdb462",
  "#b3de69",
  "#fccde5",
  "#c6b9c1",
  "#bc80bd",
  "#ccebc5",
  "#ffed6f",
  "#8dd3c7",
  "#eb8de7"
];

/**
 * Get an array of distinct colors
 * Uses shuffler with current Math.random to ensure seeded randomness works
 * @param {number} count - The count of colors to generate
 * @returns {string[]} - The array of HEX color strings
 */
export const getColors = (count: number): string[] => {
  const scaleRainbow = scaleSequential(interpolateRainbow);
  // Use shuffler() to create a shuffle function that uses the current Math.random
  const shuffle = shuffler(() => Math.random());
  const colors = shuffle(
    range(count).map(i => (i < 12 ? C_12[i] : color(scaleRainbow((i - 12) / (count - 12)))?.formatHex()))
  );
  return colors.filter((c): c is string => typeof c === "string");
};

/**
 * Get a random color in HEX format
 * @returns {string} - The HEX color string
 */
export const getRandomColor = (): string => {
  const colorFromRainbow: RGBColor = color(scaleSequential(interpolateRainbow)(Math.random())) as RGBColor;
  return colorFromRainbow.formatHex();
};

/**
 * Get a mixed color by blending a given color with a random color
 * @param {string} color - The base color in HEX format
 * @param {number} mix - The mix ratio (0 to 1)
 * @param {number} bright - The brightness adjustment
 * @returns {string} - The mixed HEX color string
 */
export const getMixedColor = (colorToMix: string, mix = 0.2, bright = 0.3): string => {
  const c = colorToMix && colorToMix[0] === "#" ? colorToMix : getRandomColor(); // if provided color is not hex (e.g. harching), generate random one
  const mixedColor: RGBColor = color(interpolate(c, getRandomColor())(mix)) as RGBColor;
  return mixedColor.brighter(bright).formatHex();
};

// ── Heightmap color schemes ───────────────────────────────────────────────────

export type ColorSchemeFunc = (t: number) => string;

export const heightmapColorSchemes: Record<string, ColorSchemeFunc> = {
  bright: scaleSequential(interpolateSpectral),
  light: scaleSequential(interpolateRdYlGn),
  natural: scaleSequential(interpolateRgbBasis(["white", "#EEEECC", "tan", "green", "teal"])),
  green: scaleSequential(interpolateGreens),
  olive: scaleSequential(interpolateRgbBasis(["#ffffff", "#cea48d", "#d5b085", "#0c2c19", "#151320"])),
  livid: scaleSequential(interpolateRgbBasis(["#BBBBDD", "#2A3440", "#17343B", "#0A1E24"])),
  monochrome: scaleSequential(interpolateGreys)
};

export function getColorScheme(scheme: string | null = "bright"): ColorSchemeFunc {
  const key = scheme ?? "bright";
  if (!(key in heightmapColorSchemes)) {
    heightmapColorSchemes[key] = scaleSequential(interpolateRgbBasis(key.split(",")));
  }
  return heightmapColorSchemes[key];
}

export function getColor(value: number, scheme: ColorSchemeFunc = heightmapColorSchemes.bright): string {
  return scheme(1 - (value < 20 ? value - 5 : value) / 100);
}

declare global {
  interface Window {
    toHEX: typeof toHEX;
    getColors: typeof getColors;
    getRandomColor: typeof getRandomColor;
    getMixedColor: typeof getMixedColor;
    C_12: typeof C_12;
  }
}
