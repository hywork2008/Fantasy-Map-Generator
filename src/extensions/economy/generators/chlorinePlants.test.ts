import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getChemistryTrials,
  getChlorinePlants,
  getMarkets,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { CHLORINE_PLANT_BUDGET } from "./chemMedCommon";
import { ChlorinePlants } from "./chlorinePlants";
import { Goods } from "./goods-generator";
import { Markets } from "./markets-generator";

describe("ChlorinePlantsModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1890 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Halogen", removed: false, capital: 1, treasury: 100 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, x: 0, y: 0, removed: false, sanitation: 50 }]
    } as unknown as PackedGraph;
    setGoods([
      { i: 1, name: "Salt", tags: [], value: 3, unit: "bag", icon: "good-salt", color: "#E5E4E5" },
      { i: 2, name: "Sulfuric Acid", tags: [], value: 18, unit: "barrel", icon: "good-sulfur", color: "#c9b44a" },
      { i: 3, name: "Coal", tags: [], value: 2, unit: "wain", icon: "good-coal", color: "#5a6a75" },
      { i: 4, name: "Firebrick", tags: [], value: 6, unit: "wain", icon: "good-clay", color: "#8a4a30" },
      { i: 5, name: "Chlorine", tags: [], value: 20, unit: "barrel", icon: "good-unknown", color: "#c9e066" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 100, price: 3 },
          2: { stock: 100, price: 18 },
          3: { stock: 100, price: 2 },
          4: { stock: 100, price: 6 },
          5: { stock: 0, price: 20 }
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

  it("does not create a plant for a State where catalyticChemistry has not reached known", () => {
    setTechnologyProgressForTests([]);
    expect(ChlorinePlants.settleAnnual()).toBe(true);
    expect(getChlorinePlants()).toHaveLength(0);
    expect(worldContext.pack.states[1].treasury).toBe(100);
  });

  it("creates a plant, debits the budget, and consumes Salt/Sulfuric Acid/Coal/Firebrick once known", () => {
    setTechnologyProgressForTests([
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(ChlorinePlants.settleAnnual()).toBe(true);

    const plants = getChlorinePlants();
    expect(plants).toHaveLength(1);
    expect(plants[0]).toMatchObject({ stateId: 1, role: "trial", active: true, utilization: 1, documentedRuns: 1 });
    // Same double-debit shape as AcidPlants/SteelConverters: one charge to found, one to operate.
    expect(worldContext.pack.states[1].treasury).toBe(100 - CHLORINE_PLANT_BUDGET * 2);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[1]?.stock).toBe(100 - 0.5); // Salt consumed
    expect(market?.goods[2]?.stock).toBe(100 - 0.3); // Sulfuric Acid consumed
    expect(market?.goods[3]?.stock).toBe(100 - 0.15); // Coal consumed
    expect(market?.goods[4]?.stock).toBe(100 - 0.05); // Firebrick consumed
    // catalyticChemistry is only "known", not demonstrated — worldHasCatalyticChemistry() gates
    // actual Chlorine output the same way AcidPlants gates on chemicalIndustryFoundation.
    expect(market?.goods[5]?.stock).toBe(0);
  });

  it("produces Chlorine once catalyticChemistry reaches demonstrated somewhere", () => {
    setTechnologyProgressForTests([
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(ChlorinePlants.settleAnnual()).toBe(true);

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[5]?.stock).toBe(0.15); // trial-role Chlorine output rate
  });

  it("reduces utilization and skips output when Salt stock is scarce", () => {
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: {
          1: { stock: 0.1, price: 3 },
          2: { stock: 100, price: 18 },
          3: { stock: 100, price: 2 },
          4: { stock: 100, price: 6 },
          5: { stock: 0, price: 20 }
        }
      }
    ]);
    Markets.sync();
    setTechnologyProgressForTests([
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);

    expect(ChlorinePlants.settleAnnual()).toBe(true);

    const plants = getChlorinePlants();
    expect(plants[0]?.utilization).toBeLessThan(0.5);
    expect(plants[0]).toMatchObject({ documentedRuns: 0 });
    // ChlorinePlant uses the ChemistryTrial indirection (AcidPlant-style), not a self-held
    // lastFailureReason (PowerStation/SteelConverterPlant-style) — the failure reason lives here.
    const trial = getChemistryTrials().find(entry => entry.kind === "chlorinePlant" && entry.stateId === 1);
    expect(trial?.lastFailureReason).toBe("materialShortage");

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[5]?.stock).toBe(0); // still no output — the run failed
  });

  it("marks the plant inactive with fundingCut when the State cannot afford the annual budget", () => {
    worldContext.pack.states[1].treasury = CHLORINE_PLANT_BUDGET; // enough to found, not to operate
    setTechnologyProgressForTests([
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);

    expect(ChlorinePlants.settleAnnual()).toBe(true);

    const plants = getChlorinePlants();
    // No running ChemistryTrial exists yet at this point (the founding debit succeeded but the
    // first operating debit failed before trialFor() is ever reached), so — same as AcidPlants —
    // there is nowhere to record a failure reason this first year; only `active` flips.
    expect(plants[0]).toMatchObject({ active: false });
    expect(worldContext.pack.states[1].treasury).toBe(0);
  });

  it("promotes a trial plant to service once catalyticChemistry reaches adopted", () => {
    setTechnologyProgressForTests([
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);
    expect(ChlorinePlants.settleAnnual()).toBe(true);
    expect(getChlorinePlants()[0]?.role).toBe("trial");

    worldContext.options = { year: 1891 } as typeof worldContext.options;
    setTechnologyProgressForTests([
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "adopted", diffusion: 0 }
    ]);
    expect(ChlorinePlants.settleAnnual()).toBe(true);
    expect(getChlorinePlants()[0]?.role).toBe("service");

    const market = getMarkets().find(entry => entry.i === 1);
    expect(market?.goods[5]?.stock).toBe(0.15 + 0.6); // trial-year output, then service-role output
  });

  it("self-gates to once per simulation year", () => {
    setTechnologyProgressForTests([
      { technologyId: "catalyticChemistry", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(ChlorinePlants.settleAnnual()).toBe(true);
    expect(ChlorinePlants.settleAnnual()).toBe(false);
  });
});
