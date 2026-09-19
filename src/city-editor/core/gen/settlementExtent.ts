import { polygonArea } from "./geom";
import type { Cell } from "./types";

/** Matches `CITY_SIZE_PRESETS.small.extentMeters`. Windows below this are
 * Tiny maps / forts (`CITY_SIZE_PRESETS.tiny` is 600 m). */
export const SMALL_CITY_EXTENT_METERS = 1200;
/** Small / Medium / Large cities keep at least two map-edge approach roads so
 * they are not a single-road dead end. */
export const MIN_CITY_EXTERNAL_ROADS = 2;
/** Tiny maps and forts: one last-stand approach (背水の陣). */
export const MIN_FORT_EXTERNAL_ROADS = 1;

/** Minimum map-edge approach roads a generated settlement must keep.
 * Small / Medium / Large cities: 2. Tiny maps (smaller than Small) may keep 1.
 * FMG descriptors are exempt. */
export function minExternalRoadsForExtent(extentMeters: number): number {
  return extentMeters < SMALL_CITY_EXTENT_METERS ? MIN_FORT_EXTERNAL_ROADS : MIN_CITY_EXTERNAL_ROADS;
}

/** Floor for the whole flood-fill settlement, as a fraction of πR². Independent
 * of wall capacity (Small 100% / Medium 45% / Large 20%). Sites where water has
 * eaten the centre fall short of this. */
export const MIN_SETTLEMENT_AREA_SHARE = 0.45;

/** Area is a capacity proxy, not an exact household/population count. */
export function defaultWalledAreaShare(extentMeters: number): number {
  return extentMeters >= 4800 ? 0.2 : extentMeters >= 2400 ? 0.45 : 1;
}

export function resolveWalledAreaShare(value: number | undefined, extentMeters: number): number {
  return value !== undefined && Number.isFinite(value)
    ? Math.max(0.05, Math.min(1, value))
    : defaultWalledAreaShare(extentMeters);
}

/** Keep a connected prefix of the urban flood-fill inside the wall. The rest
 * remains residential land, so reducing wall capacity never shrinks the town.
 * Whole-cell area quantisation is unavoidable on an editable coarse mesh. */
export function splitUrbanCore(cells: Cell[], builtUp: Set<number>, share: number) {
  if (share >= 1) return { urban: new Set(builtUp), residentialOutskirts: new Set<number>() };
  const areas = new Map(cells.map(c => [c.id, Math.abs(polygonArea(c.polygon))]));
  const target = [...builtUp].reduce((sum, id) => sum + (areas.get(id) ?? 0), 0) * share;
  const urban = new Set<number>();
  const residentialOutskirts = new Set<number>();
  let area = 0;
  let full = false;
  for (const id of builtUp) {
    const next = areas.get(id) ?? 0;
    if (!full && urban.size && Math.abs(area - target) <= Math.abs(area + next - target)) full = true;
    if (full) residentialOutskirts.add(id);
    else {
      urban.add(id);
      area += next;
    }
  }
  return { urban, residentialOutskirts };
}
