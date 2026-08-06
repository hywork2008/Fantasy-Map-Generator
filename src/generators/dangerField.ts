/**
 * Pure danger-field rebuild from monster influence radii (+ optional Phase 5
 * biome predators). Shared by Threats.generate and wilderness ecology.
 */
import type { Monster } from "../types/models";
import type { BiomesData } from "../types/WorldState";
import { applyBiomePredatorDanger } from "./biomePredators";

export type ThreatCalculationMode = "additive" | "max" | "nonlinear";

export interface DangerFieldCells {
  readonly i: ArrayLike<number>;
  readonly c: readonly (readonly number[])[];
  readonly h?: ArrayLike<number>;
  readonly biomeCode?: ArrayLike<number>;
  readonly state?: ArrayLike<number>;
  danger: { [index: number]: number; fill(value: number): unknown; length: number };
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
 */
export function rebuildDangerFromMonsters(
  cells: DangerFieldCells,
  monsters: readonly Monster[],
  threatCalculation: ThreatCalculationMode = "nonlinear"
): void {
  if (!cells.danger || cells.danger.length !== cells.i.length) {
    // Callers that own pack.cells should assign a new buffer first when unbound.
    return;
  }
  cells.danger.fill(0);

  for (const monster of monsters) {
    if (!monster || monster.power <= 0) continue;
    const start = monster.cell;
    if (start < 0 || start >= cells.i.length) continue;
    const power = monster.power;
    const queue = [{ cell: start, dist: 0 }];
    const visited = new Set<number>([start]);

    while (queue.length > 0) {
      const { cell, dist } = queue.shift()!;
      const remaining = Math.max(0, power - dist);
      if (remaining <= 0) continue;

      if (threatCalculation === "max") {
        cells.danger[cell] = Math.max(cells.danger[cell], Math.min(255, remaining * 5));
      } else if (threatCalculation === "nonlinear") {
        const nonLinearDanger = Math.round(255 * (remaining / power) ** 2);
        cells.danger[cell] = Math.max(cells.danger[cell], Math.min(255, nonLinearDanger));
      } else {
        cells.danger[cell] = Math.min(255, cells.danger[cell] + remaining * 4);
      }

      for (const neighbor of cells.c[cell] ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push({ cell: neighbor, dist: dist + 1 });
      }
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
