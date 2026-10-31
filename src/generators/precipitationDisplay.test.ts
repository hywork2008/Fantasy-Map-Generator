import { afterEach, expect, it } from "vitest";
import { simulationContext } from "../context/simulationContext";
import { usePrecipitationDisplayState } from "../store/precipitationDisplayState";
import { getCellClimateNormals } from "./cellClimateNormals";
import { ensureCellPrecipitationClimate } from "./cellPrecipitationClimate";
import { seasonalPrecipitationWorld } from "./fixtures/seasonalPrecipitationWorld";
import { createPrecipitationDisplayReader, precipitationDisplaySignature } from "./precipitationDisplay";
import { advanceSeasonalClimate } from "./seasonalClimate";

const previous = { year: simulationContext.currentYear, month: simulationContext.currentMonth };
afterEach(() => {
  usePrecipitationDisplayState.getState().setMode("annual");
  simulationContext.currentYear = previous.year;
  simulationContext.currentMonth = previous.month;
});
it("shares canonical monthly amounts and a fixed scale through date changes and same-month wind edits", () => {
  const world = seasonalPrecipitationWorld();
  const cell = 450;
  simulationContext.currentYear = 2024;
  simulationContext.currentMonth = 1;
  expect(createPrecipitationDisplayReader(world)(cell)).toBe(world.grid.cells.prec[cell]);
  usePrecipitationDisplayState.getState().setMode("month");
  const daily = ensureCellPrecipitationClimate(world);
  const annual = world.grid.cells.prec.slice();
  for (const month of [1, 7, 2]) {
    simulationContext.currentMonth = month;
    advanceSeasonalClimate({ world, simulation: simulationContext });
    expect(createPrecipitationDisplayReader(world)(cell) * 100).toBeCloseTo(
      getCellClimateNormals(world, cell, 2024)!.monthlyPrecipitationMm[month - 1],
      10
    );
    expect(ensureCellPrecipitationClimate(world)).toBe(daily);
  }
  const signature = precipitationDisplaySignature(world);
  world.options.winds[1] += 20;
  expect(precipitationDisplaySignature(world)).not.toBe(signature);
  expect(world.grid.cells.prec).toEqual(annual);
});
