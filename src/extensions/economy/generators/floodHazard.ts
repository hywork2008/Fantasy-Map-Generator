/**
 * Shared natural flood-risk hazard formula — extracted from urbanWaterSystem.ts's
 * readBurgWaterGeography() so rural flood-protection consumers (agriculturalLandUse.ts,
 * leveeSites.ts) can reuse the same 0..1 proxy without duplicating the tuning.
 * Design: docs/plan/river-levee-and-flood-damage.md §3.1.
 */

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export interface FloodHazardCells {
  h?: ArrayLike<number>;
  r?: ArrayLike<number>;
  fl?: ArrayLike<number>;
  biomeCode?: ArrayLike<number>;
  g?: ArrayLike<number>;
}

/**
 * 0..1 proxy for flood exposure: low elevation, high river flux, wetland biome, and heavy
 * precipitation each push it up. Deliberately independent of urban stormwater drainage
 * (urbanWaterSystem.ts's own `floodExposure`) — see economyContext.ts:558's "intentionally
 * remain independent investments" note, which this formula's rural/urban split continues.
 */
export function computeNaturalFloodRisk(args: {
  cellId: number;
  cells: FloodHazardCells;
  biomesTags?: ReadonlyArray<ReadonlyArray<string> | undefined>;
  gridPrec?: ArrayLike<number>;
}): number {
  const { cellId, cells } = args;
  const height = cells.h?.[cellId] ?? 50;
  const riverId = cells.r?.[cellId] ?? 0;
  const riverFlux = riverId > 0 ? Math.max(0, cells.fl?.[cellId] ?? 0) : 0;
  const biomeCode = cells.biomeCode?.[cellId] ?? 0;
  const tags = args.biomesTags?.[biomeCode] ?? [];
  const isWetland = tags?.includes("wetland") ?? false;
  const gridCell = cells.g?.[cellId] ?? cellId;
  const precipitation = args.gridPrec?.[gridCell] ?? 45;

  const lowLand = clamp01((40 - height) / 25);
  const fluxRisk = clamp01(Math.log1p(riverFlux) / 8);
  const wetRisk = isWetland ? 0.45 : 0;
  const rainRisk = clamp01((precipitation - 30) / 80);
  return clamp01(0.35 * lowLand + 0.3 * fluxRisk + 0.25 * wetRisk + 0.2 * rainRisk);
}
