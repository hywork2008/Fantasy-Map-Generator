import { buildingAppearanceColors } from "../../buildings/appearance/colors";
import type { BuildingAppearance } from "../../buildings/appearance/types";
import type { BuildingLot } from "./buildingLots.types";

const MAX_BLOCK_COLORS = 8;
const rgb = (hex: string) => [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16));
const distance = (a: string, b: string) => rgb(a).reduce((sum, v, i) => sum + (v - rgb(b)[i]) ** 2, 0);

/** Quantize once on derived lots, so detailed SVG, light SVG and 3D agree on every roof. */
export function limitBuildingRoofColors(lots: BuildingLot[]): BuildingLot[] {
  const blocks = new Map<string, Map<string, { count: number; appearance?: BuildingAppearance }>>();
  for (const lot of lots) {
    if (lot.landmark || lot.residentialCluster) continue;
    const colors = blocks.get(lot.faceId) ?? new Map();
    const key = buildingAppearanceColors(lot.appearance)?.roof ?? "legacy";
    const entry = colors.get(key) ?? { count: 0, appearance: lot.appearance };
    entry.count++;
    colors.set(key, entry);
    blocks.set(lot.faceId, colors);
  }
  const replacements = new Map<string, Map<string, BuildingAppearance>>();
  for (const [faceId, colors] of blocks) {
    if (colors.size <= MAX_BLOCK_COLORS) continue;
    const sorted = [...colors]
      .filter(([key]) => key !== "legacy")
      .sort(([a, av], [b, bv]) => bv.count - av.count || a.localeCompare(b));
    const kept = sorted.slice(0, MAX_BLOCK_COLORS - (colors.has("legacy") ? 1 : 0));
    const map = new Map<string, BuildingAppearance>();
    for (const [key] of sorted.slice(kept.length)) {
      const nearest = [...kept].sort(([a], [b]) => distance(key, a) - distance(key, b) || a.localeCompare(b))[0];
      map.set(key, nearest[1].appearance!);
    }
    replacements.set(faceId, map);
  }
  return lots.map(lot => {
    if (lot.landmark || lot.residentialCluster || !lot.appearance) return lot;
    const color = buildingAppearanceColors(lot.appearance)?.roof;
    const replacement = color && replacements.get(lot.faceId)?.get(color);
    return replacement
      ? {
          ...lot,
          appearance: { ...lot.appearance, roofPaletteId: replacement.roofPaletteId, shadeBin: replacement.shadeBin }
        }
      : lot;
  });
}
