import { HeightThreshold, VolcanoConstants } from "../data/constants";
import type { Grid } from "../types/Grid";
import type { PackedGraphFeature } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";

export type LakeVolcanism = "active" | "dormant";

/**
 * Map lake feature id → volcanism for crater lakes created from tagged volcanic peaks.
 * Built once per generation pass so defineGroups / river outlets / lava-flow walks share
 * the same peak→lake match without scanning the pack for every lake.
 */
export function indexLakeVolcanism(pack: PackedGraph, grid: Grid): Map<number, LakeVolcanism> {
  const result = new Map<number, LakeVolcanism>();
  const volcanoes = grid.volcanoes;
  if (!volcanoes?.length) return result;

  const peakActive = new Map<number, boolean>();
  for (const volcano of volcanoes) peakActive.set(volcano.peakCell, volcano.active);

  const { g, f, i } = pack.cells;
  for (let cellId = 0; cellId < i.length; cellId++) {
    const active = peakActive.get(g[cellId]);
    if (active === undefined) continue;
    const feature = pack.features[f[cellId]];
    if (feature?.type !== "lake") continue;
    result.set(feature.i, active ? "active" : "dormant");
  }
  return result;
}

/** Classify one lake against tagged volcanic peaks (and a firstCell intensity fallback). */
export function getLakeVolcanism(feature: PackedGraphFeature, pack: PackedGraph, grid: Grid): LakeVolcanism | null {
  if (feature?.type !== "lake") return null;

  const indexed = indexLakeVolcanism(pack, grid).get(feature.i);
  if (indexed) return indexed;

  const gridCell = pack.cells.g[feature.firstCell];
  if (gridCell === undefined) return null;
  if ((grid.cells.volcanic?.[gridCell] ?? 0) < VolcanoConstants.CORE_MIN_INTENSITY) return null;
  return grid.cells.volcanicActive?.[gridCell] ? "active" : "dormant";
}

/** Packed land cells a lava flow crossed — used by biome assignment for cooled `lavaField`. */
export function lavaFlowLandCells(pack: PackedGraph): Set<number> {
  const cells = new Set<number>();
  for (const flow of pack.lavaFlows ?? []) {
    for (const cellId of flow.cells) {
      if (pack.cells.h[cellId] >= HeightThreshold.WATER_MAX_HEIGHT) cells.add(cellId);
    }
  }
  return cells;
}
