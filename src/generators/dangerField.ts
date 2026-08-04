/**
 * Pure danger-field rebuild from monster influence radii.
 * Shared by Threats.generate and Phase 4 wilderness ecology (cull / rewild).
 */
import type { Monster } from "../types/models";

export type ThreatCalculationMode = "additive" | "max" | "nonlinear";

export interface DangerFieldCells {
  readonly i: ArrayLike<number>;
  readonly c: readonly (readonly number[])[];
  danger: { [index: number]: number; fill(value: number): unknown; length: number };
}

/**
 * Clears and repaints `cells.danger` from the living monster set.
 * Does not change political ownership (`cells.state`).
 */
export function rebuildDangerFromMonsters(
  cells: DangerFieldCells,
  monsters: readonly Monster[],
  threatCalculation: ThreatCalculationMode = "additive"
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
