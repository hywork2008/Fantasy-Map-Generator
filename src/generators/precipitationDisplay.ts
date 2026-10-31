import { simulationContext } from "../context/simulationContext";
import type { WorldContext } from "../context/worldContext";
import { usePrecipitationDisplayState } from "../store/precipitationDisplayState";
import { createCellClimateNormalsReader, ensureCellClimateNormals } from "./cellClimateNormals";

/** Fixed mm-to-radius scale in every month: one symbol unit is 100 mm. */
export function createPrecipitationDisplayReader(world: WorldContext): (cell: number) => number {
  if (usePrecipitationDisplayState.getState().mode === "annual") return cell => world.grid.cells.prec[cell] ?? 0;
  const read = createCellClimateNormalsReader(world, simulationContext.currentYear);
  const month = simulationContext.currentMonth - 1;
  const values = new Float64Array(world.grid.cells.i.length).fill(NaN);
  return cell => {
    if (Number.isNaN(values[cell])) values[cell] = (read(cell)?.monthlyPrecipitationMm[month] ?? 0) / 100;
    return values[cell];
  };
}

export function precipitationDisplaySignature(world: WorldContext): string {
  const mode = usePrecipitationDisplayState.getState().mode;
  return mode === "annual"
    ? mode
    : `${mode}:${simulationContext.currentYear}:${simulationContext.currentMonth}:${ensureCellClimateNormals(world, simulationContext.currentYear).revision}`;
}
