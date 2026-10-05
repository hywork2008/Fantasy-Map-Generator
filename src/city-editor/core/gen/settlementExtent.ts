import { polygonArea } from "./geom";
import { makeRng } from "./prng";
import type { Cell } from "./types";

/** Matches `CITY_SIZE_PRESETS.small.extentMeters`. Windows below this are
 * Micro / Tiny maps and forts (`CITY_SIZE_PRESETS.micro` is 300 m,
 * `CITY_SIZE_PRESETS.tiny` is 600 m). */
export const SMALL_CITY_EXTENT_METERS = 1200;
/** Small / Medium / Large cities keep at least two map-edge approach roads so
 * they are not a single-road dead end. */
export const MIN_CITY_EXTERNAL_ROADS = 2;
/** Micro / Tiny maps and forts: one last-stand approach (背水の陣). */
export const MIN_FORT_EXTERNAL_ROADS = 1;

/** Minimum map-edge approach roads a generated settlement must keep.
 * Small / Medium / Large cities: 2. Micro / Tiny maps (smaller than Small) may keep 1.
 * FMG descriptors are exempt. */
export function minExternalRoadsForExtent(extentMeters: number): number {
  return extentMeters < SMALL_CITY_EXTENT_METERS ? MIN_FORT_EXTERNAL_ROADS : MIN_CITY_EXTERNAL_ROADS;
}

/**
 * Road width in meters scaled by settlement extent, aligning with medieval European
 * street width standards (Tiny/village: ~3.5m, Small town: ~4.5m, Medium city: ~6m, Large city: ~7.5m).
 */
/** Civic window. A widened display frame keeps walls, roads, and landmarks on the unexpanded town. */
export function townExtentMeters(frame: { extentMeters: number; settlementExtentMeters?: number }): number {
  const settlement = frame.settlementExtentMeters;
  if (settlement === undefined || !Number.isFinite(settlement) || settlement <= 0) return frame.extentMeters;
  return Math.min(frame.extentMeters, settlement);
}

export function defaultRoadWidthMeters(extentMeters: number): number {
  if (extentMeters <= 600) return 3.5;
  if (extentMeters <= 1200) return 4.5;
  if (extentMeters <= 2400) return 6.0;
  return 7.5;
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

/** Join a capacity-limited core to its built-up waterfront, keeping the shore
 * as a natural defense boundary. Paths stay inside the original settlement;
 * no rural cells are annexed merely to reach distant water. */
export function extendCoreToCoast(
  cells: Cell[],
  core: Set<number>,
  builtUp: Set<number>,
  sea: Set<number>
): Set<number> {
  const byId = new Map(cells.map(cell => [cell.id, cell]));
  const shore = new Set([...builtUp].filter(id => byId.get(id)?.neighbors.some(n => sea.has(n))));
  const result = new Set(core);
  if (!shore.size || !core.size) return result;
  const previous = new Map<number, number>();
  const seen = new Set(core);
  const queue = [...core];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const neighbor of byId.get(id)?.neighbors ?? []) {
      if (seen.has(neighbor) || !builtUp.has(neighbor) || sea.has(neighbor)) continue;
      seen.add(neighbor);
      previous.set(neighbor, id);
      queue.push(neighbor);
    }
  }
  for (const id of shore) {
    if (!seen.has(id)) continue;
    let cursor = id;
    while (!result.has(cursor)) {
      result.add(cursor);
      const parent = previous.get(cursor);
      if (parent === undefined) break;
      cursor = parent;
    }
  }
  return result;
}

/** Grid-evolution curtain inset, in cell rings, measured inward from the
 * settlement edge. Tiny moves one cell. Small moves one or two, from the seed.
 * Micro and Medium / Large stay put (those already use an area share). Other
 * grids, unwalled towns, and an explicit capacity below the whole settlement
 * keep the current line. */
export function evolutionWallInsetRings(
  preset: "micro" | "tiny" | "small" | "medium" | "large",
  seed: string,
  gridKind: string | undefined,
  walls: boolean,
  walledShare: number
): number {
  if (!walls || gridKind !== "evolution" || !(walledShare >= 1)) return 0;
  if (preset === "tiny") return 1;
  if (preset === "small") return makeRng(`${seed}:evolution-wall-inset`).int(1, 3);
  return 0;
}

/** Pull `urban` in by `rings` cells from its boundary. Peeled cells leave the
 * curtain and stay in the town. A ring that would erase the core is skipped.
 * When a ring splits the remainder, the largest component stays walled.
 * `anchor`, when it already belongs to the core, is the burg cell and is never peeled. */
export function insetWalledCore(
  cells: Cell[],
  urban: Set<number>,
  rings: number,
  anchor?: number
): { urban: Set<number>; peeled: Set<number> } {
  const peeled = new Set<number>();
  let core = new Set(urban);
  const steps = Number.isFinite(rings) ? Math.max(0, Math.floor(rings)) : 0;
  if (!steps || !core.size) return { urban: core, peeled };
  const byId = new Map(cells.map(cell => [cell.id, cell]));
  const keepAnchor = anchor !== undefined && core.has(anchor);
  for (let step = 0; step < steps; step++) {
    const boundary: number[] = [];
    for (const id of core) {
      const cell = byId.get(id);
      if (!cell) {
        boundary.push(id);
        continue;
      }
      if (!cell.neighbors.length || cell.neighbors.some(neighbor => !core.has(neighbor))) boundary.push(id);
    }
    if (!boundary.length) break;
    const next = new Set(core);
    for (const id of boundary) if (id !== anchor || !keepAnchor) next.delete(id);
    if (!next.size || next.size === core.size) break;
    const components = connectedCellComponents(byId, next);
    let kept = components[0];
    for (const component of components) {
      const anchored = keepAnchor && component.has(anchor!);
      const keptAnchored = keepAnchor && kept.has(anchor!);
      if ((anchored && !keptAnchored) || (anchored === keptAnchored && component.size > kept.size)) kept = component;
    }
    for (const id of core) {
      if (!kept.has(id)) peeled.add(id);
    }
    core = kept;
  }
  return { urban: core, peeled };
}

function connectedCellComponents(byId: Map<number, Cell>, ids: Set<number>): Set<number>[] {
  const unseen = new Set(ids);
  const components: Set<number>[] = [];
  for (const start of ids) {
    if (!unseen.has(start)) continue;
    const component = new Set<number>();
    const queue = [start];
    unseen.delete(start);
    while (queue.length) {
      const id = queue.pop() as number;
      component.add(id);
      const cell = byId.get(id);
      if (!cell) continue;
      for (const neighbor of cell.neighbors) {
        if (!unseen.has(neighbor)) continue;
        unseen.delete(neighbor);
        queue.push(neighbor);
      }
    }
    components.push(component);
  }
  return components;
}
