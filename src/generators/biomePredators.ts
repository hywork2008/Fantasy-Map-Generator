/**
 * Phase 5 wild oikoumene: low-intensity biome predators (non-monster).
 * Spec: docs/plan/wild-oikoumene-frontier.md
 *
 * Forest / mountain wildlife feeds the same `cells.danger` channel as named
 * monsters, but never creates marker entities. Intensity stays well below the
 * expand ban (80) so predators texture wilderness without spawning domains alone.
 */
import { biomeHasTag, isForestBiome, isMountainBiome } from "../data/biomeCatalog";
import type { BiomesData } from "../types/WorldState";
import { STATE_EXPAND_DANGER_BAN } from "./dangerExpandPolicy";

/** Hard cap for predator-only contribution (before combining with monsters). */
export const BIOME_PREDATOR_DANGER_CAP = 22;

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
  let touched = 0;

  for (let index = 0; index < cells.i.length; index++) {
    const id = cells.i[index];
    const height = cells.h[id] ?? 0;
    if (height < 20) continue;

    let base = getBiomePredatorBaseDanger(cells.biomeCode?.[id], height, biomesData);
    if (base <= 0) continue;

    if (reduceGoverned && (cells.state?.[id] ?? 0) > 0) {
      base = Math.max(0, Math.round(base * 0.5));
    }
    const suppression = clamp01(options.pestSuppressionByCell?.[id] ?? 0);
    const value = Math.min(BIOME_PREDATOR_DANGER_CAP, Math.round(base * scale * (1 - suppression)));
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
