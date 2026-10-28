/** Botanical model tiers, independent of the city's overall geometry budget. */
export const TREE_QUALITIES = ["low", "medium", "high", "ultra"] as const;
export type TreeQuality = (typeof TREE_QUALITIES)[number];

/** Projected crown height in pixels. Exit thresholds prevent oscillation during small camera moves. */
export function treeQualityAtPixels(pixels: number, previous?: TreeQuality): TreeQuality {
  const boundaries = [28, 90, 240];
  const prior = previous === undefined ? -1 : TREE_QUALITIES.indexOf(previous);
  let level = 0;
  for (let i = 0; i < boundaries.length; i++) {
    const threshold = boundaries[i] * (prior > i ? 0.8 : 1);
    if (pixels >= threshold) level = i + 1;
  }
  return TREE_QUALITIES[level];
}
