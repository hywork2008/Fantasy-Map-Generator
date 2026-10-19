import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import type { Burg } from "../types/models";
import { burgFarmlandAreaHectares } from "./burgFarmland";

function fixture() {
  const burg = { cell: 0, population: 10 } as Burg;
  const world = {
    populationRate: 1000,
    urbanization: 2,
    pack: {
      cells: { pop: [30] },
      landUse: {
        cells: {
          0: {
            patches: [
              { kind: "cultivation", areaHa: 100 },
              { kind: "cultivation", areaHa: 50 },
              { kind: "pasture", areaHa: 80 }
            ]
          }
        }
      }
    }
  } as unknown as WorldContext;
  return { world, burg };
}

describe("urban farmland allocation", () => {
  it("allocates cultivation by the CellInfo rural/urban population ratio", () => {
    const { world, burg } = fixture();
    expect(burgFarmlandAreaHectares(world, burg)).toBe(60);
    world.pack.cells.pop[0] = 0;
    expect(burgFarmlandAreaHectares(world, burg)).toBe(150);
    burg.population = 0;
    expect(burgFarmlandAreaHectares(world, burg)).toBe(0);
  });

  it("distinguishes zero cultivation from missing survey data", () => {
    const { world, burg } = fixture();
    world.pack.landUse!.cells[0].patches = [];
    expect(burgFarmlandAreaHectares(world, burg)).toBe(0);
    delete world.pack.landUse;
    expect(burgFarmlandAreaHectares(world, burg)).toBeUndefined();
  });
});
