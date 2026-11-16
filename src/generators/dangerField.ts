/**
 * Pure danger-field rebuild from monster influence radii (+ optional Phase 5
 * biome predators). Shared by Threats.generate and wilderness ecology.
 */

import type { Monster } from "../types/models";
import type { BiomesData } from "../types/WorldState";
import { applyBiomePredatorDanger } from "./biomePredators";
import { type MonsterMedium, monsterContribution, natureForMonster } from "./monsterNature";

export type ThreatCalculationMode = "additive" | "max" | "nonlinear";

export interface DangerFieldCells {
  readonly i: ArrayLike<number>;
  readonly c: readonly (readonly number[])[];
  readonly h?: ArrayLike<number>;
  readonly biomeCode?: ArrayLike<number>;
  readonly state?: ArrayLike<number>;
  danger: { [index: number]: number; fill(value: number): unknown; length: number };
  /** Highest rarity whose radius still covers the cell. 0 when none do. */
  threatRarity?: Uint8Array;
}

export interface RebuildDangerFieldOptions {
  /** When set with intensity &gt; 0, forest/mountain predator pressure is layered on. */
  readonly biomesData?: BiomesData | null;
  /** Scale for biome predators (0 = off). highFantasy 1, darkFantasy ~1.25. */
  readonly biomePredatorScale?: number;
  /** See biomePredators.applyBiomePredatorDanger. */
  readonly reducePredatorsOnGovernedLand?: boolean;
  /**
   * Pest suppression 0..1 by cell; multiplies predator contribution only
   * (docs/plan/player-threat-cull-jobs.md §5.5).
   */
  readonly pestSuppressionByCell?: Readonly<Record<number, number>> | null;
}

/**
 * Clears and repaints `cells.danger` from the living monster set.
 * Does not change political ownership (`cells.state`).
 *
 * The aggregation mode is ignored. Peaks come from rarity, radius from `power`,
 * and `medium` only chooses which cells receive the paint
 * (docs/plan/dnd/danger-calculation.md, docs/plan/dnd/monster-nature.md).
 */
export function rebuildDangerFromMonsters(
  cells: DangerFieldCells,
  monsters: readonly Monster[],
  _threatCalculation: ThreatCalculationMode = "nonlinear"
): void {
  if (!cells.danger || cells.danger.length !== cells.i.length) {
    // Callers that own pack.cells should assign a new buffer first when unbound.
    return;
  }
  cells.danger.fill(0);
  const threatRarity = ensureThreatRarity(cells);
  threatRarity.fill(0);

  for (const monster of monsters) {
    if (!monster || monster.power <= 0 || monster.rarity <= 0) continue;
    paintMonsterDanger(cells, monster, natureForMonster(monster).medium, threatRarity);
  }
}

/**
 * Paints one monster onto an existing field. Does not clear other monsters.
 * `medium` overrides the kind card so callers can test masks without a new kind.
 */
export function paintMonsterDanger(
  cells: DangerFieldCells,
  monster: Pick<Monster, "cell" | "power" | "rarity">,
  medium: MonsterMedium,
  threatRarity: Uint8Array = ensureThreatRarity(cells)
): void {
  const power = monster.power;
  const rarity = monster.rarity;
  const start = monster.cell;
  if (power <= 0 || rarity <= 0 || start < 0 || start >= cells.i.length) return;

  const queue = [{ cell: start, dist: 0 }];
  const visited = new Set<number>([start]);
  const waterContribution = medium === "water" ? new Map<number, number>() : null;

  while (queue.length > 0) {
    const { cell, dist } = queue.shift()!;
    if (dist >= power) continue;
    if (cellAcceptsMedium(cells, cell, medium)) {
      const contribution = monsterContribution(rarity, power, dist);
      if (contribution > cells.danger[cell]) cells.danger[cell] = contribution;
      if (rarity > threatRarity[cell]) threatRarity[cell] = rarity;
      waterContribution?.set(cell, contribution);
    }
    for (const neighbor of cells.c[cell] ?? []) {
      if (visited.has(neighbor)) continue;
      if (!canTraverse(cells, neighbor, medium)) continue;
      visited.add(neighbor);
      queue.push({ cell: neighbor, dist: dist + 1 });
    }
  }

  if (!waterContribution) return;
  for (const [cell, contribution] of waterContribution) {
    for (const neighbor of cells.c[cell] ?? []) {
      if (!isLandCell(cells, neighbor)) continue;
      if (contribution > cells.danger[neighbor]) cells.danger[neighbor] = contribution;
      if (rarity > threatRarity[neighbor]) threatRarity[neighbor] = rarity;
    }
  }
}

/**
 * Full fantasy danger rebuild: monsters first, then low-intensity biome predators.
 * Prefer this over calling monster rebuild alone on fantasy maps.
 */
export function rebuildDangerField(
  cells: DangerFieldCells,
  monsters: readonly Monster[],
  threatCalculation: ThreatCalculationMode = "nonlinear",
  options: RebuildDangerFieldOptions = {}
): void {
  rebuildDangerFromMonsters(cells, monsters, threatCalculation);

  const scale = options.biomePredatorScale ?? 0;
  if (scale <= 0 || !cells.h) return;

  applyBiomePredatorDanger(
    {
      i: cells.i,
      c: cells.c,
      h: cells.h,
      biomeCode: cells.biomeCode,
      state: cells.state,
      danger: cells.danger
    },
    options.biomesData ?? null,
    {
      intensityScale: scale,
      reduceOnGovernedLand: options.reducePredatorsOnGovernedLand,
      pestSuppressionByCell: options.pestSuppressionByCell
    }
  );
}

/** Intensity scale for Phase 5 predators from culture-set threat mood. */
export function biomePredatorScaleForMode(mode: "highFantasy" | "darkFantasy" | "none" | string): number {
  if (mode === "darkFantasy") return 1.25;
  if (mode === "highFantasy") return 1;
  return 0;
}

const LAND_HEIGHT = 20;

function ensureThreatRarity(cells: DangerFieldCells): Uint8Array {
  if (!cells.threatRarity || cells.threatRarity.length !== cells.i.length) {
    cells.threatRarity = new Uint8Array(cells.i.length);
  }
  return cells.threatRarity;
}

function heightOf(cells: DangerFieldCells, cell: number): number | null {
  if (!cells.h) return null;
  return cells.h[cell] ?? 0;
}

/** Missing height is a land graph, so existing callers without `h` keep a full disk. */
function isLandCell(cells: DangerFieldCells, cell: number): boolean {
  const height = heightOf(cells, cell);
  if (height === null) return true;
  return height >= LAND_HEIGHT;
}

function isWaterCell(cells: DangerFieldCells, cell: number): boolean {
  const height = heightOf(cells, cell);
  if (height === null) return false;
  return height < LAND_HEIGHT;
}

function cellAcceptsMedium(cells: DangerFieldCells, cell: number, medium: MonsterMedium): boolean {
  if (medium === "air") return true;
  if (medium === "water") return isWaterCell(cells, cell);
  return isLandCell(cells, cell);
}

function canTraverse(cells: DangerFieldCells, cell: number, medium: MonsterMedium): boolean {
  return cellAcceptsMedium(cells, cell, medium);
}
