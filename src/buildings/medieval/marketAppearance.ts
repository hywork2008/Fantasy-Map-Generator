/** Art-direction palettes, not evidence of a uniform historical regional dress code. */
export const MARKET_PALETTES = ["ochre", "madder", "woad"] as const;
export type MarketPalette = (typeof MARKET_PALETTES)[number];

export const MARKET_PALETTE_OPTIONS = [
  { id: "ochre", label: "Natural linen / ochre" },
  { id: "madder", label: "Natural linen / madder" },
  { id: "woad", label: "Natural linen / woad" }
] as const;

export function isMarketPalette(value: unknown): value is MarketPalette {
  return MARKET_PALETTES.includes(value as MarketPalette);
}

export const MARKET_CLOTH_COLORS: Record<MarketPalette, number> = {
  ochre: 0xb59b62,
  madder: 0x92594c,
  woad: 0x596f83
};
