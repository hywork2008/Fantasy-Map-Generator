/**
 * Deep Worm ecology — Phase 4 of docs/plan/underground-realm-and-supernatural-areas.md §4.3a.
 *
 * Deep Worms are ordinary `Monster`s (type "deepWorm") confined to underground domain cells, so
 * they participate in the existing generic danger field + player/threat-cull-job pipeline for
 * free (`threatCullEffects.ts`'s `CullTargetKind: "monster"` is type-agnostic — nothing there
 * branches on `Monster.type`). Two things ARE new here, both specific to worms:
 *   - **they dig** (`growVoidFromWormActivity`): a living worm slowly raises `subterraneanVoid`
 *     at its own cell and neighbors — the domain's physical capacity ceiling
 *     (`undergroundFoodWeb.ts`'s `physicalCeiling`) grows over time purely from an uncullled worm
 *     population. Culling worms therefore trades away a real future benefit (more cavity to
 *     expand into later) for a real present one (meat, lower danger), not a one-sided
 *     "danger is always bad" tradeoff (§4.3a's stated design intent).
 *   - **meat yield feeds the food web** (`wormMeatYieldFromCull`): the `wormOfftakePerCell` input
 *     `undergroundFoodWeb.ts` already accepts, sized from how much power a hunt actually reduced.
 */
import type { Monster, SubterraneanDomain } from "../types/models";

export const DEEP_WORM_TYPE = "deepWorm";

/** Worms per unit of domain cavity volume — bigger caverns support more of them. Placeholder (calibration TBD). */
const WORMS_PER_VOID_VOLUME = 1 / 400;
const MAX_WORMS_PER_DOMAIN = 4;
/** Dire-Beast-tier rarity (wild-oikoumene-frontier.md's High Fantasy rarity-2 band): dangerous, huntable, not world-ending. */
const WORM_RARITY = 2;
const WORM_POWER_MIN = 6;
const WORM_POWER_MAX = 10;

export interface DeepWormNeighborCells {
  readonly c: readonly (readonly number[])[];
}

/**
 * Spawns Deep Worms into every underground domain — wildCavern and dwarfHold alike, worms do not
 * care who claimed the cavern. Returns new Monster entries only; the caller appends them
 * (`Threats.appendMonstersAndRebuildDanger`) so the danger field is rebuilt exactly once.
 */
export function spawnDeepWorms(
  domains: readonly SubterraneanDomain[],
  nextMonsterId: number,
  random: () => number = Math.random
): Monster[] {
  const spawned: Monster[] = [];
  let monsterId = nextMonsterId;
  for (const domain of domains) {
    if (!domain.cells.length) continue;
    const count = Math.min(MAX_WORMS_PER_DOMAIN, Math.round(domain.voidVolume * WORMS_PER_VOID_VOLUME));
    for (let i = 0; i < count; i++) {
      const cell = domain.cells[Math.floor(random() * domain.cells.length)]!;
      const power = WORM_POWER_MIN + Math.round(random() * (WORM_POWER_MAX - WORM_POWER_MIN));
      spawned.push({
        i: monsterId,
        cell,
        name: `Deep Worm ${monsterId}`,
        rarity: WORM_RARITY,
        power,
        basePower: power,
        type: DEEP_WORM_TYPE
      });
      monsterId++;
    }
  }
  return spawned;
}

/**
 * Annual dig pass: every living Deep Worm raises void a little at its own cell and immediate
 * neighbors, capped at 1. Mutates `voidFraction` in place; returns the cells actually changed so
 * a caller can invalidate any cached per-domain `voidVolume`.
 */
export function growVoidFromWormActivity(
  monsters: readonly Monster[],
  cells: DeepWormNeighborCells,
  voidFraction: Float32Array,
  incrementPerYear = 0.01
): number[] {
  const touched = new Set<number>();
  for (const monster of monsters) {
    if (monster.type !== DEEP_WORM_TYPE || monster.power <= 0) continue;
    const targets = [monster.cell, ...(cells.c[monster.cell] ?? [])];
    for (const cell of targets) {
      if (cell === undefined || cell < 0 || cell >= voidFraction.length) continue;
      const next = Math.min(1, voidFraction[cell] + incrementPerYear);
      if (next !== voidFraction[cell]) {
        voidFraction[cell] = next;
        touched.add(cell);
      }
    }
  }
  return Array.from(touched);
}

/**
 * Worm meat yield when a hunt reduces a Deep Worm's power, sized relative to an equivalent-human
 * surface cell (same `referenceDensity` normalization as `undergroundFoodWeb.ts`) so it composes
 * directly with that module's `wormOfftakePerCell` input.
 */
export function wormMeatYieldFromCull(powerReduced: number, referenceDensity: number): number {
  return Math.max(0, powerReduced) * Math.max(0, referenceDensity) * 0.5;
}
