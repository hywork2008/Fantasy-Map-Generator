import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { PackedGraph } from "../types/PackedGraph";
import { simulateDemographics } from "./demography-simulator";
import { getFuneralRemainsAtCell, resetFuneralState, takePendingFuneralMaterials } from "./funeralRites";

describe("urban funeral headcount", () => {
  const originalWorld = {
    pack: worldContext.pack,
    populationRate: worldContext.populationRate,
    urbanization: worldContext.urbanization
  };
  const originalOptions = useOptionsState.getState();

  beforeEach(() => {
    resetFuneralState();
    worldContext.populationRate = 10;
    worldContext.urbanization = 4;
    useOptionsState.setState({ demographicBirthRate: 0, demographicChildMortalityRate: 0 });
  });

  afterEach(() => {
    Object.assign(worldContext, originalWorld);
    useOptionsState.setState(originalOptions);
    resetFuneralState();
  });

  it.each([
    { cause: "natural mortality", capacity: 100000, foodSecurity: 1, waterSecurity: 1 },
    { cause: "overcrowding", capacity: 100, foodSecurity: 1, waterSecurity: 1 },
    { cause: "food famine", capacity: 100000, foodSecurity: 0, waterSecurity: 1 },
    { cause: "epidemic", capacity: 100000, foodSecurity: 1, waterSecurity: 0 }
  ])("scales remains and material demand for $cause", ({ capacity, foodSecurity, waterSecurity }) => {
    worldContext.pack = {
      cells: { i: [], h: [25], culture: [1], c: [[]] },
      cultures: [{ i: 0 }, { i: 1, type: "Generic", funeralRite: "inhumation" }],
      states: [{ i: 0 }, { i: 1, culture: 1 }],
      burgs: [
        { i: 0 },
        {
          i: 1,
          cell: 0,
          state: 1,
          population: 1000,
          // Suppress replacement births so population loss measures deaths exactly.
          group: "fort",
          foodSecurity,
          waterSecurity,
          demographics: { children: 200, maleAdults: 300, femaleAdults: 400, elders: 100, capacity }
        }
      ]
    } as unknown as PackedGraph;

    simulateDemographics(1);

    const deadPeople = (1000 - worldContext.pack.burgs[1].population!) * 10 * 4;
    expect(deadPeople).toBeGreaterThan(0);
    expect(getFuneralRemainsAtCell(0)).toBeCloseTo(deadPeople * 0.8);
    expect(takePendingFuneralMaterials()[0].wood).toBeCloseTo(deadPeople * 0.02);
  });
});
