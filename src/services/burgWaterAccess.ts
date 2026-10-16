import { MIN_NAVIGABLE_FLUX } from "../data/waterNavigation";
import type { BurgWaterAccess } from "../types/burgWater";
import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { lakeCanHostPorts } from "./lakePorts";

export function updateBurgWaterAccess(burg: Burg, pack: PackedGraph): BurgWaterAccess {
  const { cells, features } = pack;
  const placement = burg.riverPlacement;
  const physicalCell = placement?.physicalCellId ?? burg.cell;
  const sea = new Set<number>();
  const lake = new Set<number>();
  // Inspect every neighbour: haven alone cannot represent several water bodies.
  for (const cell of cells.c?.[physicalCell] ?? []) {
    if (!(cells.h[cell] < 20)) continue;
    const featureId = cells.f[cell];
    const feature = features[featureId];
    if (feature?.type === "ocean") sea.add(featureId);
    if (feature?.type === "lake") lake.add(featureId);
  }
  const riverId = placement?.physicalCellId !== undefined ? placement.riverId : cells.r?.[burg.cell] || null;
  const riverCell = cells.r?.[physicalCell] === riverId ? physicalCell : burg.cell;
  if (burg.riverPlacement && burg.riverPlacement.riverId !== riverId) delete burg.riverPlacement;
  const access: BurgWaterAccess = {
    river: riverId !== null,
    sea: sea.size > 0,
    lake: lake.size > 0,
    riverId,
    seaFeatureIds: [...sea].sort((a, b) => a - b),
    lakeFeatureIds: [...lake].sort((a, b) => a - b),
    port: {
      river: Boolean(burg.port && burg.riverPort !== false && riverId && cells.fl?.[riverCell] >= MIN_NAVIGABLE_FLUX),
      sea: Boolean(burg.port && burg.seaPort !== false && sea.size),
      // Only a lake big enough for lake ports gives a lake frontage; a river port beside a small
      // lake must not grow a lake harbour on it.
      lake: Boolean(
        burg.port && [...lake].some(id => lakeCanHostPorts(features[id], cells.i?.length ?? cells.h.length))
      )
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
