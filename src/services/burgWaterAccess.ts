import { MIN_NAVIGABLE_FLUX } from "../generators/river-generator";
import type { BurgWaterAccess } from "../types/burgWater";
import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";

export function updateBurgWaterAccess(burg: Burg, pack: PackedGraph): BurgWaterAccess {
  const { cells, features } = pack;
  const sea = new Set<number>();
  const lake = new Set<number>();
  // Inspect every neighbour: haven alone cannot represent several water bodies.
  for (const cell of cells.c?.[burg.cell] ?? []) {
    if (!(cells.h[cell] < 20)) continue;
    const featureId = cells.f[cell];
    const feature = features[featureId];
    if (feature?.type === "ocean") sea.add(featureId);
    if (feature?.type === "lake") lake.add(featureId);
  }
  const riverId = cells.r?.[burg.cell] || null;
  if (burg.riverPlacement && burg.riverPlacement.riverId !== riverId) delete burg.riverPlacement;
  const access: BurgWaterAccess = {
    river: riverId !== null,
    sea: sea.size > 0,
    lake: lake.size > 0,
    riverId,
    seaFeatureIds: [...sea].sort((a, b) => a - b),
    lakeFeatureIds: [...lake].sort((a, b) => a - b),
    port: {
      river: Boolean(burg.port && riverId && cells.fl?.[burg.cell] >= MIN_NAVIGABLE_FLUX),
      sea: Boolean(burg.port && sea.size),
      lake: Boolean(burg.port && lake.size)
    }
  };
  burg.waterAccess = access;
  return access;
}

export function updateAllBurgWaterAccess(pack: PackedGraph): void {
  for (const burg of pack.burgs ?? []) {
    if (burg?.i && !burg.removed) updateBurgWaterAccess(burg, pack);
  }
}
