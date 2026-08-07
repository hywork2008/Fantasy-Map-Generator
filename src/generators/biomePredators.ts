/**
 * Phase 5 wild oikoumene: low-intensity biome predators (non-monster).
 * Spec: docs/plan/wild-oikoumene-frontier.md
 *
 * Forest / mountain wildlife feeds the same `cells.danger` channel as named
 * monsters, but never creates marker entities. Intensity stays well below the
 * expand ban (80) so predators texture wilderness without spawning domains alone.
 *
 * Deep-forest interior scaling (2026-08-07, docs/plan/fauna-biome-realism.md §3 Phase I) — a large
 * contiguous forest mass is meaningfully more dangerous/impenetrable than a forest edge cell next
 * to open land, mirroring how real settlement historically hugged forest margins/clearings rather
 * than pushing into unbroken deep woodland. `computeForestDepthFromNonForest()` runs a multi-source
 * BFS from every non-forest (incl. water) cell, giving each forest cell its hop-distance to the
 * nearest non-forest land; `applyBiomePredatorDanger()` layers an additional per-hop danger bonus on
 * top of the existing flat per-biome base for cells beyond the immediate edge (depth > 1). This is
 * additive on top of `getBiomePredatorBaseDanger()`, which stays "pure of map topology" per its own
 * doc-comment/contract (`threatCullEffects.ts`'s pest-hinterland job-posting scan calls it directly,
 * without a neighbor graph, and must keep working) — depth only ever gets computed and applied here.
 */
import { biomeHasTag, isForestBiome, isMountainBiome } from "../data/biomeCatalog";
import type { BiomesData } from "../types/WorldState";
import { STATE_EXPAND_DANGER_BAN } from "./dangerExpandPolicy";

/** Hard cap for predator-only contribution (before combining with monsters). */
export const BIOME_PREDATOR_DANGER_CAP = 22;

/**
 * Danger added per BFS hop beyond the forest edge (depth 1, i.e. adjacent to non-forest, gets no
 * bonus — matches today's pre-Phase-I behavior for forest-edge/patchy forest). A depth-5+ cell (the
 * center of a forest mass roughly 5 cells / tens of km across) reaches the cap below.
 */
export const DEEP_FOREST_DANGER_PER_HOP = 8;
/**
 * Combined base+depth cap, deliberately higher than `BIOME_PREDATOR_DANGER_CAP` but still short of
 * `STATE_EXPAND_DANGER_BAN` (80) by more than the governed-land halving could ever close, so a
 * biome-predator-only cell can never alone reach the annexation ban (this file's original design
 * invariant — "predators texture wilderness without spawning domains alone").
 */
export const DEEP_FOREST_DANGER_CAP = 65;

/**
 * Hop-distance from each land cell to the nearest non-forest cell (0 for non-forest cells
 * themselves, including water/ocean). Forest cells adjacent to non-forest land are depth 1.
 * O(n) multi-source BFS over the existing cell adjacency graph.
 */
function computeForestDepthFromNonForest(
  cells: BiomePredatorCells,
  biomesData: BiomesData | null | undefined
): Uint8Array {
  const depth = new Uint8Array(cells.i.length);
  if (!biomesData) return depth; // No catalog to classify forest vs. non-forest — leave flat.

  const queue: number[] = [];
  const visited = new Uint8Array(cells.i.length);
  for (let index = 0; index < cells.i.length; index++) {
    const id = cells.i[index];
    const height = cells.h[id] ?? 0;
    const forest = height >= 20 && isForestBiome(biomesData, cells.biomeCode?.[id] ?? 0);
    if (!forest) {
      visited[id] = 1;
      queue.push(id);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const nextDepth = depth[id] + 1;
    for (const neighbor of cells.c[id] ?? []) {
      if (visited[neighbor]) continue;
      visited[neighbor] = 1;
      depth[neighbor] = nextDepth;
      queue.push(neighbor);
    }
  }

  return depth;
}

export interface BiomePredatorCells {
  readonly i: ArrayLike<number>;
  readonly c: readonly (readonly number[])[];
  readonly h: ArrayLike<number>;
  readonly biomeCode?: ArrayLike<number>;
  readonly state?: ArrayLike<number>;
  danger: { [index: number]: number; length: number };
}

export interface BiomePredatorOptions {
  /**
   * Global intensity scale. highFantasy ≈ 1, darkFantasy ≈ 1.25.
   * Pass 0 to disable.
   */
  readonly intensityScale?: number;
  /**
   * When true (default), state-owned land keeps only half the predator pressure
   * (cleared / patrolled countryside). Generation-time maps have no states yet.
   */
  readonly reduceOnGovernedLand?: boolean;
  /**
   * Per-cell pest suppression 0..1 from player/anon cull contracts.
   * Formula: predatorAdd = round(base * scale * (1 - clamp01(suppression))).
   * Spec: docs/plan/player-threat-cull-jobs.md §5.5.
   */
  readonly pestSuppressionByCell?: Readonly<Record<number, number>> | null;
}

/**
 * Local predator pressure for one biome code. Pure of map topology.
 * Returns 0 for ocean / open safe biomes.
 */
export function getBiomePredatorBaseDanger(
  biomeCode: number | undefined,
  height: number,
  biomesData: BiomesData | null | undefined
): number {
  if (height < 20) return 0;

  const forest = biomesData ? isForestBiome(biomesData, biomeCode ?? 0) : isLegacyForestCode(biomeCode);
  const mountain = biomesData ? isMountainBiome(biomesData, biomeCode ?? 0) : height >= 70;
  const cold = biomesData ? biomeHasTag(biomesData, biomeCode ?? 0, "cold") : false;
  const wetland = biomesData ? biomeHasTag(biomesData, biomeCode ?? 0, "wetland") : false;

  // Height-only mountain fallback when catalog lacks a mountain tag but terrain is highland.
  const highland = !mountain && height >= 62;

  if (!forest && !mountain && !highland) return 0;

  let danger = 0;
  if (forest) danger += 10;
  if (mountain) danger += 12;
  else if (highland) danger += 8;
  if (forest && mountain) danger += 2; // montane apex predators
  if (forest && cold) danger += 2; // taiga wolves / etc.
  if (forest && wetland) danger -= 2; // dense but less open hunting

  return Math.max(0, Math.min(BIOME_PREDATOR_DANGER_CAP, danger));
}

/**
 * Adds low-intensity predator danger onto an existing field (does not clear).
 * Call after monster rebuild so named threats remain dominant where present.
 *
 * @returns number of land cells that received a predator contribution
 */
export function applyBiomePredatorDanger(
  cells: BiomePredatorCells,
  biomesData: BiomesData | null | undefined,
  options: BiomePredatorOptions = {}
): number {
  const scale = options.intensityScale ?? 1;
  if (scale <= 0 || !cells.danger) return 0;

  const reduceGoverned = options.reduceOnGovernedLand !== false;
  const local = new Uint8Array(cells.i.length);
  const forestDepth = computeForestDepthFromNonForest(cells, biomesData);
  let touched = 0;

  for (let index = 0; index < cells.i.length; index++) {
    const id = cells.i[index];
    const height = cells.h[id] ?? 0;
    if (height < 20) continue;

    let base = getBiomePredatorBaseDanger(cells.biomeCode?.[id], height, biomesData);
    if (base <= 0) continue;

    // Deep-forest interior bonus (depth 1 = forest edge, no bonus — see module doc-comment).
    const depth = forestDepth[id] ?? 0;
    if (depth > 1) base += (depth - 1) * DEEP_FOREST_DANGER_PER_HOP;

    if (reduceGoverned && (cells.state?.[id] ?? 0) > 0) {
      base = Math.max(0, Math.round(base * 0.5));
    }
    const suppression = clamp01(options.pestSuppressionByCell?.[id] ?? 0);
    const value = Math.min(DEEP_FOREST_DANGER_CAP, Math.round(base * scale * (1 - suppression)));
    if (value <= 0) continue;
    local[id] = value;
    touched++;
  }

  // Soft 1-hop bleed so forest edges feel risky without deep radius flood-fill.
  const bleed = new Uint8Array(cells.i.length);
  for (let id = 0; id < local.length; id++) {
    if (!local[id]) continue;
    const half = Math.max(1, Math.floor(local[id] * 0.45));
    for (const neighbor of cells.c[id] ?? []) {
      if ((cells.h[neighbor] ?? 0) < 20) continue;
      if (local[neighbor] >= half) continue;
      bleed[neighbor] = Math.max(bleed[neighbor], half);
    }
  }

  for (let id = 0; id < cells.danger.length; id++) {
    const add = Math.max(local[id], bleed[id]);
    if (!add) continue;
    // Never alone push a cell to the annex ban; leave headroom for monsters.
    const cap = STATE_EXPAND_DANGER_BAN - 1;
    cells.danger[id] = Math.min(cap, cells.danger[id] + add);
  }

  return touched;
}

function isLegacyForestCode(biomeCode: number | undefined): boolean {
  if (biomeCode === undefined) return false;
  // Historical Azgaar forest band when catalog tags are unavailable.
  return biomeCode >= 5 && biomeCode <= 9;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}
