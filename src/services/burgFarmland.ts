import type { WorldContext } from "../context/worldContext";
import type { Burg } from "../types/models";

/** Share the cell's surveyed cultivation between its rural and urban inhabitants. */
export function burgFarmlandAreaHectares(world: WorldContext, burg: Burg): number | undefined {
  const budget = world.pack.landUse?.cells[burg.cell];
  if (!budget) return undefined;
  const cultivated = budget.patches
    .filter(patch => patch.kind === "cultivation")
    .reduce((sum, patch) => sum + patch.areaHa, 0);
  const rural = Math.max(0, world.pack.cells.pop?.[burg.cell] ?? 0);
  const urban = Math.max(0, burg.population ?? 0) * (world.urbanization ?? 1);
  if (![cultivated, rural, urban].every(Number.isFinite) || cultivated < 0) return undefined;
  return rural + urban > 0 ? (cultivated * urban) / (rural + urban) : 0;
}
