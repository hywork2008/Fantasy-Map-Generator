import { describe, expect, it, vi } from "vitest";
import type { WorldContext } from "../context/worldContext";
import { collectFarmlandSnapshot } from "./farmlandObservation";

vi.mock("../generators/landUse", () => ({
  resolveStaticLandUseInputs: () => [{ id: 0, cultivableAreaHa: 80 }]
}));
vi.mock("../generators/settlementClearance", () => ({
  planSettlementLandUse: () => ({
    cells: { 0: { physicalLandAreaHa: 100, patches: [{ kind: "cultivation", areaHa: 20 }] } }
  })
}));

function world(): WorldContext {
  return {
    seed: "123",
    populationRate: 1000,
    urbanization: 2,
    options: { historicalPeriod: "highMedieval", initialSettlementPattern: "standard" },
    biomesData: { keys: ["grassland"] },
    grid: { cells: { temp: [15], prec: [7] } },
    pack: {
      cells: { i: [0], h: [25], pop: [3], burg: [1], biomeCode: [0], r: [0] },
      burgs: [{}, { i: 1, population: 1 }],
      landUse: {
        provenance: "authoritative",
        cells: {
          0: {
            patches: [
              { kind: "cultivation", areaHa: 50 },
              { kind: "pasture", areaHa: 20 }
            ]
          }
        }
      }
    }
  } as unknown as WorldContext;
}

describe("farmland observation", () => {
  it("records real people, precipitation units, footprint and Economy area separately", () => {
    const row = collectFarmlandSnapshot(world(), 100, true, [40]).cells[0];
    expect(row.ruralPeople).toBe(3000);
    expect(row.urbanPeople).toBe(2000);
    expect(row.annualPrecipitationMm).toBe(700);
    expect(row.baselineAreaHa).toBe(20);
    expect(row.cultivationAreaHa).toBe(50);
    expect(row.economyCultivatedAreaHa).toBe(40);
    expect(row.urbanAllocatedAreaHa).toBe(20);
  });

  it("never labels an OFF or estimated snapshot as an Economy measurement", () => {
    const data = world();
    expect(collectFarmlandSnapshot(data, 100, false, [40]).cells[0].cultivationAreaHa).toBeNull();
    data.pack.landUse!.provenance = "estimated";
    expect(collectFarmlandSnapshot(data, 100, true, [40]).cells[0].cultivationAreaHa).toBeNull();
  });
});
