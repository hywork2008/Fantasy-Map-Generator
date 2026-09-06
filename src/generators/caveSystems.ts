/**
 * Cave system generation — Phase 1 of docs/plan/underground-realm-and-supernatural-areas.md.
 *
 * Assigns every land cell a cavity fraction (`subterraneanVoid`) from its geological province
 * (§2.1), then groups cells whose void clears a habitability threshold into connected
 * `SubterraneanDomain` ("wildCavern") entries (§3.3) — the raw material `seedDwarfHoldOikoumene`
 * (Phase 2) later claims one of for a Dwarf hold, and that other domain kinds (§5.3) can be
 * built from later.
 *
 * Fantasy-gated: non-Fantasy culture sets skip generation entirely (§3.3), leaving
 * `pack.subterraneanDomains` empty and every underground column absent, exactly like a legacy
 * save — every downstream reader must treat "absent" as "no underground geography".
 */

import type { SubterraneanDomain } from "../types/models";
import type { BiomesData } from "../types/WorldState";
import { classifyGeologicalProvince, type GeologicalProvinceKind, geologyHash } from "./geologicalProvinces";

/** Base cavity fraction range per province (docs §2.1), for cells that DO have a cave. */
const VOID_RANGE_BY_PROVINCE: Record<GeologicalProvinceKind, readonly [number, number]> = {
  carbonate: [0.55, 0.85],
  volcanic: [0.4, 0.65],
  basin: [0.25, 0.45],
  orogen: [0.2, 0.4],
  granite: [0.05, 0.15],
  shield: [0.05, 0.15],
  placer: [0, 0]
};

/**
 * Chance an individual land cell of this province even has a cave at all — independent of
 * `VOID_RANGE_BY_PROVINCE`, which sizes a cave once one exists rather than gating whether one
 * does. Karst/lava-tube/fissure caves are a minority of their host rock, not the whole of it:
 * `basin` (the height<38 lowland default — most ordinary farmland) sizing straight off its 0.25
 * void floor against a naive threshold made nearly all farmland "cave-riddled" (found via live
 * map verification: a near-total-landmass hatch on the Underground layer, docs §3.3's "rare,
 * special feature" intent violated). Kept well under the ~0.3–0.4 site-percolation threshold for
 * FMG's ~6-connected cell graph so passing cells form scattered small pockets, not a single
 * spanning blob covering the map.
 */
const CAVE_OCCURRENCE_CHANCE_BY_PROVINCE: Record<GeologicalProvinceKind, number> = {
  carbonate: 0.12,
  volcanic: 0.08,
  basin: 0.03,
  orogen: 0.05,
  granite: 0.02,
  shield: 0.02,
  placer: 0
};

/** Cells with void at or above this become candidate cave-system members (in addition to the occurrence roll above). */
export const CAVE_VOID_THRESHOLD = 0.3;
/** Discard connected components smaller than this — too small to be a meaningful domain. */
export const MIN_CAVE_DOMAIN_SIZE = 3;

/** Layer-1 (shallow) / layer-2 (deep) / layer-3 (abyssal) height+void bands, docs §1.2. */
function reachForCell(height: number, voidFraction: number): 0 | 1 | 2 | 3 {
  if (voidFraction < CAVE_VOID_THRESHOLD) return 0;
  if (height >= 70 && voidFraction >= 0.6) return 3;
  if (height >= 45 || voidFraction >= 0.5) return 2;
  return 1;
}

export interface CaveSystemCells {
  readonly i: ArrayLike<number>;
  readonly c: readonly (readonly number[])[];
  readonly h: ArrayLike<number>;
  readonly r: ArrayLike<number>;
  readonly area: ArrayLike<number>;
  readonly biomeCode?: ArrayLike<number>;
  subterraneanVoid?: Float32Array;
  subterraneanReach?: Uint8Array;
  subterraneanDomain?: Uint16Array;
}

/**
 * Per-cell cavity fraction from geology + small deterministic jitter, gated by a sparse
 * occurrence roll so caves stay a minority feature of their host province rather than blanketing
 * it (see `CAVE_OCCURRENCE_CHANCE_BY_PROVINCE`). Land cells only (h >= 20).
 */
export function computeSubterraneanVoid(
  seed: string,
  cells: CaveSystemCells,
  biomesData: Pick<BiomesData, "tags"> | undefined
): Float32Array {
  const voidFraction = new Float32Array(cells.i.length);
  for (let index = 0; index < cells.i.length; index++) {
    const cellId = cells.i[index];
    if ((cells.h[cellId] ?? 0) < 20) continue;
    const province = classifyGeologicalProvince(seed, cellId, cells, biomesData);
    const [min, max] = VOID_RANGE_BY_PROVINCE[province];
    if (max <= 0) continue;
    const occurrenceRoll = geologyHash(seed, "cave-occurrence", cellId);
    if (occurrenceRoll >= CAVE_OCCURRENCE_CHANCE_BY_PROVINCE[province]) continue;
    const jitter = geologyHash(seed, "void", cellId);
    voidFraction[cellId] = min + (max - min) * jitter;
  }
  return voidFraction;
}

/**
 * Finds connected components (stack-based flood fill over `cells.c`) of cells at or above
 * `CAVE_VOID_THRESHOLD` in a given void-fraction array and turns each large-enough one into a
 * `wildCavern` SubterraneanDomain. Pure — split out from `generateCaveSystems` so the grouping
 * algorithm is testable independently of the geology hash. Also fills `reach`/`domainByCell`
 * (both zero-initialized by the caller) in place.
 */
export function buildDomainsFromVoid(
  cells: CaveSystemCells,
  voidFraction: Float32Array,
  reach: Uint8Array,
  domainByCell: Uint16Array
): SubterraneanDomain[] {
  const count = cells.i.length;
  for (let index = 0; index < count; index++) {
    const cellId = cells.i[index];
    reach[cellId] = reachForCell(cells.h[cellId] ?? 0, voidFraction[cellId]);
  }

  const domains: SubterraneanDomain[] = [];
  const visited = new Uint8Array(count);

  for (let index = 0; index < count; index++) {
    const startCell = cells.i[index];
    if (visited[startCell] || reach[startCell] === 0) continue;

    const component: number[] = [];
    const queue = [startCell];
    visited[startCell] = 1;
    while (queue.length) {
      const cell = queue.pop()!;
      component.push(cell);
      for (const neighbor of cells.c[cell] ?? []) {
        if (visited[neighbor] || reach[neighbor] === 0) continue;
        visited[neighbor] = 1;
        queue.push(neighbor);
      }
    }

    if (component.length < MIN_CAVE_DOMAIN_SIZE) continue;

    const maxReach = component.reduce((max, cell) => Math.max(max, reach[cell]), 1) as 1 | 2 | 3;
    const voidVolume = component.reduce((sum, cell) => {
      const depthFactor = reach[cell] === 3 ? 3 : reach[cell] === 2 ? 1.6 : 1;
      return sum + (cells.area[cell] ?? 1) * voidFraction[cell] * depthFactor;
    }, 0);
    const entrances = findEntrances(cells, component);

    const domain: SubterraneanDomain = {
      i: domains.length + 1,
      kind: "wildCavern",
      cells: component,
      entrances,
      depth: maxReach,
      voidVolume
    };
    domains.push(domain);
    for (const cell of component) domainByCell[cell] = domain.i;
  }

  return domains;
}

/**
 * Assigns cavity fraction from geology (§2.1), groups it into domains (§3.3), and writes
 * `cells.subterraneanVoid`/`subterraneanReach`/`subterraneanDomain` in place.
 */
export function generateCaveSystems(
  seed: string,
  cells: CaveSystemCells,
  biomesData: Pick<BiomesData, "tags"> | undefined
): SubterraneanDomain[] {
  const count = cells.i.length;
  const voidFraction = computeSubterraneanVoid(seed, cells, biomesData);
  const reach = new Uint8Array(count);
  const domainByCell = new Uint16Array(count);
  const domains = buildDomainsFromVoid(cells, voidFraction, reach, domainByCell);

  cells.subterraneanVoid = voidFraction;
  cells.subterraneanReach = reach;
  cells.subterraneanDomain = domainByCell;
  return domains;
}

/** A component cell bordering a non-member cell is a candidate mouth; prefer higher ground / rivers. */
function findEntrances(cells: CaveSystemCells, component: readonly number[]): number[] {
  const componentSet = new Set(component);
  const perimeter = component.filter(cell => (cells.c[cell] ?? []).some(neighbor => !componentSet.has(neighbor)));
  const pool = perimeter.length ? perimeter : component;
  const scored = pool
    .map(cell => ({ cell, score: (cells.h[cell] ?? 0) + (cells.r[cell] ? 15 : 0) }))
    .sort((a, b) => b.score - a.score);
  const take = Math.max(1, Math.min(3, Math.ceil(pool.length / 12)));
  return scored.slice(0, take).map(entry => entry.cell);
}
