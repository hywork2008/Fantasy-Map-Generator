import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  clearEconomyContext,
  getChemistryTrials,
  getMarkets,
  getMercuryPlants,
  initEconomyContext,
  setGoods,
  setMarkets,
  setMercuryPlants
} from "../economyContext";
import { FACILITY_MAINTENANCE_RATE, MERCURY_PLANT_BUDGET } from "./chemMedCommon";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";
import { MercuryPlants } from "./mercuryPlants";

describe("MercuryPlantsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1860 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Cinnabaria", removed: false, capital: 1, treasury: 100 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Cinnabar", tags: [], value: 8, unit: "sack", icon: "good-stone", color: "#b8362b" },
      { i: 2, name: "Coal", tags: [], value: 3, unit: "wain", icon: "good-coal", color: "#2b2b2b" },
      { i: 3, name: "Firebrick", tags: [], value: 6, unit: "wain", icon: "good-clay", color: "#8a4a30" },
      { i: 4, name: "Mercury", tags: [], value: 30, unit: "flask", icon: "good-unknown", color: "#d7d7de" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 100, price: 8 },
          2: { stock: 100, price: 3 },
          3: { stock: 100, price: 6 },
          4: { stock: 0, price: 30 }
        }
      }
    ]);
    Goods.sync();
    Markets.sync();
  });

  afterEach(() => {
    clearEconomyContext();
    setTechnologyProgressForTests([]);
  });

  it("does not create a plant for a State where cinnabarRoastingAndMercuryRecovery has not reached known", () => {
    setTechnologyProgressForTests([]);
    expect(MercuryPlants.settleAnnual()).toBe(true);
    expect(getMercuryPlants()).toHaveLength(0);
    expect(worldContext.pack.states[1].treasury).toBe(100);
  });

  it("creates a plant, debits the budget, and consumes Cinnabar/Coal/Firebrick once known — but produces no output while chemicalIndustryFoundation is not yet demonstrated anywhere", () => {
    setTechnologyProgressForTests([
      { technologyId: "cinnabarRoastingAndMercuryRecovery", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(MercuryPlants.settleAnnual()).toBe(true);

    const plants = getMercuryPlants();
    expect(plants).toHaveLength(1);
    expect(plants[0]).toMatchObject({ stateId: 1, role: "trial", active: true, utilization: 1, contamination: 0.048 });
    // Same double-debit shape as PhosphateFertilizerPlants: one charge to found the plant, one for
    // this year's operation.
    // One full charge to found the plant, one reduced FACILITY_MAINTENANCE_RATE renewal charge for
    // this year's operation (docs/plan/treasury-structural-deficit-investigation.md §8.2, fix "A").
    expect(worldContext.pack.states[1].treasury).toBe(
      100 - MERCURY_PLANT_BUDGET - rn(MERCURY_PLANT_BUDGET * FACILITY_MAINTENANCE_RATE, 2)
    );

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 0.3); // Cinnabar consumed
    expect(market?.goods[2]?.stock).toBe(100 - 0.15); // Coal consumed
    expect(market?.goods[3]?.stock).toBe(100 - 0.05); // Firebrick consumed
    expect(market?.goods[4]?.stock).toBe(0); // no Mercury output yet

    const trial = getChemistryTrials().find(entry => entry.kind === "mercuryPlant" && entry.stateId === 1);
    expect(trial).toMatchObject({ status: "running", documentedRuns: 1, operatingYears: 1 });
  });

  it("produces Mercury once chemicalIndustryFoundation is demonstrated somewhere in the world", () => {
    setTechnologyProgressForTests([
      { technologyId: "cinnabarRoastingAndMercuryRecovery", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      { technologyId: "chemicalIndustryFoundation", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(MercuryPlants.settleAnnual()).toBe(true);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[4]?.stock).toBe(0.05); // trial-role output rate

    const trial = getChemistryTrials().find(entry => entry.kind === "mercuryPlant" && entry.stateId === 1);
    expect(trial?.outputsDelivered).toBe(0.05);
  });

  it("reduces utilization and fails the trial run when Cinnabar stock is scarce (no contamination accrues)", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 0.02, price: 8 },
          2: { stock: 100, price: 3 },
          3: { stock: 100, price: 6 },
          4: { stock: 0, price: 30 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "cinnabarRoastingAndMercuryRecovery", scope: "state", ownerId: 1, stage: "known", diffusion: 0 },
      { technologyId: "chemicalIndustryFoundation", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(MercuryPlants.settleAnnual()).toBe(true);

    const plants = getMercuryPlants();
    expect(plants[0]?.utilization).toBeLessThan(0.5);
    expect(plants[0]?.contamination).toBe(0); // an under-supplied year never contaminates

    const trial = getChemistryTrials().find(entry => entry.kind === "mercuryPlant" && entry.stateId === 1);
    expect(trial).toMatchObject({ documentedRuns: 0, failureCount: 1, lastFailureReason: "materialShortage" });

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[4]?.stock).toBe(0); // still no output — the run failed
  });

  it("promotes a trial plant to service once cinnabarRoastingAndMercuryRecovery reaches adopted", () => {
    setTechnologyProgressForTests([
      { technologyId: "cinnabarRoastingAndMercuryRecovery", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(MercuryPlants.settleAnnual()).toBe(true);
    expect(getMercuryPlants()[0]?.role).toBe("trial");

    worldContext.options = { year: 1861 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "cinnabarRoastingAndMercuryRecovery", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    expect(MercuryPlants.settleAnnual()).toBe(true);
    expect(getMercuryPlants()[0]?.role).toBe("service");
  });

  it("self-gates to once per simulation year", () => {
    setTechnologyProgressForTests([
      { technologyId: "cinnabarRoastingAndMercuryRecovery", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(MercuryPlants.settleAnnual()).toBe(true);
    expect(MercuryPlants.settleAnnual()).toBe(false);
  });

  // docs/plan/cinnabar-mercury-vertical-slice.md §3.7, §15 decision 10 — the health/environment
  // debt is unavoidable and cannot be waved away by abundant stock.
  it("forces a full-stoppage containment incident once contamination crosses its threshold, even with plentiful stock", () => {
    setMercuryPlants([
      {
        burgId: 1,
        stateId: 1,
        role: "service",
        active: true,
        utilization: 1,
        documentedRuns: 6,
        lastFundedYear: 1859,
        contamination: 0.55 // one more +0.08 service-tier year crosses the 0.6 threshold
      }
    ]);
    setTechnologyProgressForTests([
      {
        technologyId: "cinnabarRoastingAndMercuryRecovery",
        scope: "state",
        ownerId: 1,
        stage: "adopted",
        diffusion: 0
      },
      { technologyId: "chemicalIndustryFoundation", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(MercuryPlants.settleAnnual()).toBe(true);

    const plant = getMercuryPlants()[0];
    // 0.55 + 0.08 = 0.63, past the 0.6 threshold, so a cleanup is attempted and — since the
    // 100-treasury State can afford MERCURY_PLANT_BUDGET * 1.5 — relieved by 0.35: 0.63 - 0.35 = 0.28.
    expect(plant?.contamination).toBeCloseTo(0.28, 4);
    expect(plant?.utilization).toBe(0); // full stoppage regardless of the abundant stock below

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 0.3); // materials were still consumed...
    expect(market?.goods[4]?.stock).toBe(0); // ...but no Mercury reached the market this year

    const trial = getChemistryTrials().find(entry => entry.kind === "mercuryPlant" && entry.stateId === 1);
    expect(trial).toMatchObject({ documentedRuns: 0, failureCount: 1, lastFailureReason: "contamination" });
  });

  it("leaves contamination unrelieved when the State cannot afford the cleanup bill, but still forces the stoppage", () => {
    // Enough for the reduced annual FACILITY_MAINTENANCE_RATE renewal debit (1.4), not the 1.5x
    // cleanup bill (21) — docs/plan/treasury-structural-deficit-investigation.md §8.2, fix "A".
    worldContext.pack.states[1].treasury = MERCURY_PLANT_BUDGET;
    setMercuryPlants([
      {
        burgId: 1,
        stateId: 1,
        role: "service",
        active: true,
        utilization: 1,
        documentedRuns: 6,
        lastFundedYear: 1859,
        contamination: 0.55
      }
    ]);
    setTechnologyProgressForTests([
      {
        technologyId: "cinnabarRoastingAndMercuryRecovery",
        scope: "state",
        ownerId: 1,
        stage: "adopted",
        diffusion: 0
      },
      { technologyId: "chemicalIndustryFoundation", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(MercuryPlants.settleAnnual()).toBe(true);

    const plant = getMercuryPlants()[0];
    expect(plant?.contamination).toBeCloseTo(0.63, 4); // unrelieved — the cleanup bill went unpaid
    expect(plant?.utilization).toBe(0); // the stoppage still happens either way
  });
});
