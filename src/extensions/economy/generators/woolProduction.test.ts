import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI } from "../../hostTypes";
import {
  clearEconomyContext,
  getOrCreateFaunaStockTable,
  initEconomyContext,
  setHusbandryRequiredWorkers,
  setHusbandryWorkers
} from "../economyContext";
import { getAnnualWoolPotentialKg, getWoolOutput } from "./woolProduction";

describe("woolProduction (Wool -> Cloth, 2026-08-08 docs/plan/fauna-biome-realism.md Wool/Sheep investigation)", () => {
  beforeEach(() => {
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  describe("getWoolOutput", () => {
    it("is zero when no Sheep stock exists at this cell", () => {
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10]));
      expect(getWoolOutput(0)).toBe(0);
    });

    it("is zero when the herd is fully unstaffed, even with a large local flock", () => {
      const table = getOrCreateFaunaStockTable()!;
      table["0:Sheep"] = { young: 0, breeding: 1000, old: 0 };
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([0])); // workerFactor 0
      expect(getWoolOutput(0)).toBe(0);
    });

    it("scales with local Sheep headcount and the husbandry labour-sufficiency ratio", () => {
      const table = getOrCreateFaunaStockTable()!;
      table["0:Sheep"] = { young: 200, breeding: 600, old: 200 }; // 1000 head
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([5])); // workerFactor 0.5
      // High-medieval fleeces: 200 young * 0.28 + 800 adults * 0.7 = 616 kg/year before labor.
      expect(getWoolOutput(0)).toBeCloseTo((616 * 0.5) / 12 / 1500, 8);
    });

    it("accounts for age without treating old sheep as non-producing or lambs as full adults", () => {
      const table = getOrCreateFaunaStockTable()!;
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10]));
      table["0:Sheep"] = { young: 1000, breeding: 0, old: 0 };
      expect(getAnnualWoolPotentialKg(0)).toBeCloseTo(280);
      table["0:Sheep"] = { young: 0, breeding: 1000, old: 0 };
      expect(getAnnualWoolPotentialKg(0)).toBeCloseTo(700);
      expect(getWoolOutput(0)).toBeCloseTo(700 / 12 / 1500, 8);
      table["0:Sheep"] = { young: 0, breeding: 0, old: 1000 };
      expect(getWoolOutput(0)).toBeCloseTo(700 / 12 / 1500, 8);
    });

    it("uses the fleece weight of the world's historical period", () => {
      getOrCreateFaunaStockTable()!["0:Sheep"] = { young: 0, breeding: 1000, old: 0 };
      worldContext.options = { ...worldContext.options, historicalPeriod: "preIndustrialEra" };
      expect(getAnnualWoolPotentialKg(0)).toBeCloseTo(1300);
      worldContext.options = { ...worldContext.options, historicalPeriod: "highMedieval" };
      expect(getAnnualWoolPotentialKg(0)).toBeCloseTo(700);
    });

    it("delivers the annual raw mass over twelve smoothed months without changing the lot contract", () => {
      getOrCreateFaunaStockTable()!["0:Sheep"] = { young: 200, breeding: 600, old: 200 };
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10]));
      let lots = 0;
      for (let month = 1; month <= 12; month++) {
        simulationContext.currentMonth = month;
        lots += getWoolOutput(0);
      }
      expect(lots * 1500).toBeCloseTo(616);
    });

    it("does not cull the herd — read-only like getMilkOutput", () => {
      const table = getOrCreateFaunaStockTable()!;
      table["0:Sheep"] = { young: 0, breeding: 1000, old: 0 };
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10]));
      getWoolOutput(0);
      expect(table["0:Sheep"]).toEqual({ young: 0, breeding: 1000, old: 0 });
    });

    it("ignores non-wool grazed species (Cattle/Horses/Camels/Goats) even when present at the same cell", () => {
      const table = getOrCreateFaunaStockTable()!;
      table["0:Cattle"] = { young: 0, breeding: 500, old: 0 };
      table["0:Horses"] = { young: 0, breeding: 500, old: 0 };
      table["0:Camels"] = { young: 0, breeding: 500, old: 0 };
      table["0:Goats"] = { young: 0, breeding: 500, old: 0 };
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10]));
      expect(getWoolOutput(0)).toBe(0);
    });

    it("only reads this cell's own headcount, never another cell's", () => {
      const table = getOrCreateFaunaStockTable()!;
      table["1:Sheep"] = { young: 0, breeding: 1000, old: 0 }; // a neighboring/distant cell's flock
      setHusbandryRequiredWorkers(new Float32Array([10, 10]));
      setHusbandryWorkers(new Float32Array([10, 10]));
      expect(getWoolOutput(0)).toBe(0); // cell 0 has no flock of its own
      expect(getWoolOutput(1)).toBeGreaterThan(0);
    });
  });
});
