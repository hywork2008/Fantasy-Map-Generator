/**
 * A LocalTerrainSampler that reads the terrain tiles instead of the per-prefecture rasters in
 * japan-local/ (docs/plan/japan-terrain-tiles.md, T7). River snapping, carving and the DEM coast
 * of `createLocalTerrainField` then run on the same heights the tiles draw.
 *
 * The region raster sampler (`base`, japan.bin) still answers the georeference check, the real
 * rivers, and any point no loaded tile covers.
 */
import { demLevelOrder, type LocalTerrainSampler } from "../localTerrainSampler";
import type { TerrainTileLayer } from "./terrainTileLayer";

/** Steps the local terrain field asks for (river carve 100 m, snap 250 m, outer ground). */
const FIELD_STEPS_METERS = [100, 250, 500, 1000];

export function createTileTerrainSampler(
  layer: TerrainTileLayer,
  base: LocalTerrainSampler,
  graphWidth: number,
  graphHeight: number
): LocalTerrainSampler {
  const steps = layer.levelStepsMeters;
  const orders = new Map<number, number[]>();
  const orderFor = (stepMeters: number) => {
    let order = orders.get(stepMeters);
    if (!order) {
      order = demLevelOrder(steps, stepMeters);
      orders.set(stepMeters, order);
    }
    return order;
  };
  // The level each field step reads first; those are the tiles a window must have in memory.
  const wanted = [...new Set(FIELD_STEPS_METERS.map(step => orderFor(step)[0]).filter(z => z !== undefined))];

  return {
    consistency: base.consistency,
    realRivers: base.realRivers,
    load: base.load,
    levelSteps: [...steps].sort((a, b) => a - b),
    pendingLevels: bounds => layer.pendingArea(bounds, wanted, graphWidth, graphHeight),
    ensureLevels: bounds => layer.ensureArea(bounds, wanted, graphWidth, graphHeight),
    metersAt: (x, y, stepMeters) => {
      if (stepMeters !== undefined)
        for (const z of orderFor(stepMeters)) {
          const raw = layer.rawMetersAt(x, y, z, graphWidth, graphHeight);
          if (raw !== null) return Math.max(0, raw);
        }
      return base.metersAt(x, y);
    },
    landAt: (x, y) => {
      // Finest loaded level first, as the prefecture sampler does.
      for (const z of orderFor(0)) {
        const raw = layer.rawMetersAt(x, y, z, graphWidth, graphHeight);
        if (raw !== null) return raw > 0.5 ? true : raw < -5 ? false : undefined;
      }
      return base.landAt(x, y);
    }
  };
}
