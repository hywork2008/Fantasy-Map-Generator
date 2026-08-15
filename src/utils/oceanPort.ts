import type { Burg } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";

/**
 * True salt-water harbor: the adjacent haven cell sits on an ocean feature.
 *
 * `burg.port` is not consulted. That field stores the water feature the burg
 * trades on, and lake/river drain resolution can set it to the downstream
 * ocean even when the burg is many cells inland. Shipyards and fleets must
 * look at `cells.haven` instead.
 *
 * When the feature table is missing (unit fixtures), any haven is treated as
 * ocean so existing route tests keep working.
 */
export function isTrueOceanHarborCell(cellId: number, pack: PackedGraph): boolean {
  const haven = pack.cells.haven?.[cellId];
  if (!haven) return false;
  const featureId = pack.cells.f?.[haven];
  const features = pack.features;
  // Unit fixtures often omit the feature table; a haven still means "on water".
  if (!features?.length) return true;
  if (featureId === undefined || featureId === null) return false;
  const feature = features[featureId];
  return typeof feature === "object" && feature?.type === "ocean";
}

/** A burg that is actually on the open ocean, not a drain-resolved inland port. */
export function isTrueOceanPortBurg(burg: Burg | undefined, pack: PackedGraph): boolean {
  if (!burg?.i || burg.removed || !burg.port) return false;
  return isTrueOceanHarborCell(burg.cell, pack);
}
