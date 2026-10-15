import { afterEach, expect, it, vi } from "vitest";
import * as blockInfill from "./blockInfill";
import { createGridDocument } from "./document";
import { FabricCache } from "./localInfill";
import * as populationHousing from "./populationHousing";
import { fitPopulationHousing } from "./populationHousingFit";
import { defaultPopulationSettings, planPopulation } from "./populationPlan";
import * as capacity from "./residentialCapacity";

afterEach(() => vi.restoreAllMocks());

it.each([
  { shortfalls: [0], best: 0, exhausted: false },
  { shortfalls: [20, 0], best: 1, exhausted: false },
  { shortfalls: [30, 20, 10], best: 2, exhausted: true },
  { shortfalls: [10, 20, 10], best: 0, exhausted: true },
  { shortfalls: [20, 10, 30], best: 1, exhausted: true }
])("reuses the selected fabric for $shortfalls", ({ shortfalls, best, exhausted }) => {
  const document = createGridDocument({ size: "tiny", grid: "hex", seed: "fit-reuse" });
  document.populationPlan = planPopulation(defaultPopulationSettings(3000));
  const fabrics = shortfalls.map(() => ({ buildings: [], farms: [], lanes: [], entrances: new Map() }));
  let pass = 0;
  const build = vi.spyOn(blockInfill, "buildBlockFabric").mockImplementation(() => fabrics[pass++]);
  let measure = 0;
  vi.spyOn(capacity, "measureHousingCapacity").mockImplementation(
    () =>
      ({
        unplacedDwellings: shortfalls[measure++]
      }) as ReturnType<typeof capacity.measureHousingCapacity>
  );
  const finish = vi.spyOn(populationHousing, "finishPopulationHousing").mockImplementation(() => {});
  const observe = vi.fn();
  fitPopulationHousing(document, new FabricCache(), observe);
  expect(build).toHaveBeenCalledTimes(shortfalls.length);
  expect(observe).toHaveBeenCalledTimes(shortfalls.length);
  expect(finish).toHaveBeenCalledExactlyOnceWith(document, fabrics[best]);
  expect(document.populationPlan.housingFit).toMatchObject({ pass: best + 1, exhausted });
});
