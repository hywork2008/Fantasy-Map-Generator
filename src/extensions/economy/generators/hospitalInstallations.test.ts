import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getHospitalInstallations,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { Goods } from "./goods-generator";
import { HospitalInstallations } from "./hospitalInstallations";
import { Markets } from "./markets-generator";

describe("HospitalInstallations", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1200 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Care", removed: false, capital: 1, treasury: 200 }],
      burgs: [
        { i: 0 },
        { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 40, medicalCare: 50 }
      ],
      provinces: [{ i: 0 }, { i: 1, removed: false }]
    } as unknown as PackedGraph;
    simulationContext.currentYear = 1200;
    setGoods([
      {
        i: 1,
        name: "Medicines",
        tags: [],
        value: 16,
        unit: "chest",
        icon: "good-medicinal-herbs",
        color: "#6b8f71",
        requiredTechnology: "apothecaryCompounding"
      },
      { i: 2, name: "Soap", tags: [], value: 6, unit: "barrel", icon: "good-soap", color: "#eee" },
      { i: 3, name: "Vinegar", tags: [], value: 6, unit: "barrel", icon: "good-vinegar", color: "#900" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 8, price: 16 },
          2: { stock: 8, price: 6 },
          3: { stock: 8, price: 6 }
        }
      }
    ]);
    setTechnologyProgressForTests([
      { technologyId: "apothecaryCompounding", scope: "state", ownerId: 1, stage: "adopted", diffusion: 1 },
      { technologyId: "hospitalMedicine", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => {
    clearEconomyContext();
    setTechnologyProgressForTests([]);
  });

  it("auto-founds a trial hospital at known and writes burg.medicalCare the same year", () => {
    expect(HospitalInstallations.settleAnnual()).toBe(true);
    const hospital = getHospitalInstallations().find(row => row.stateId === 1);
    expect(hospital?.role).toBe("trial");
    expect(hospital?.documentedRuns).toBeGreaterThan(0);
    expect(worldContext.pack.burgs[1].medicalCare).toBeGreaterThan(50);
    expect(worldContext.pack.burgs[1].sanitation).toBe(40);
    expect(worldContext.pack.states[1].treasury).toBeLessThan(200);
  });

  it("returns medical care to 50 when the hospital cannot consume medicines", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 0, price: 16 },
          2: { stock: 0, price: 6 },
          3: { stock: 0, price: 6 }
        }
      }
    ]);
    Markets.sync();
    HospitalInstallations.settleAnnual();
    expect(worldContext.pack.burgs[1].medicalCare).toBe(50);
    expect(worldContext.pack.burgs[1].sanitation).toBe(40);
  });
});
