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
import { getMilkOutput } from "./dairy";

describe("dairy (Milk -> Cheese, 2026-08-07 docs/plan/fauna-biome-realism.md §3 Phase J/K/N)", () => {
  beforeEach(() => {
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  describe("getMilkOutput", () => {
    it("is zero when no dairy species stock exists at this cell", () => {
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10]));
      expect(getMilkOutput(0)).toBe(0);
    });

    it("is zero when the herd is fully unstaffed, even with a large local herd", () => {
      const table = getOrCreateFaunaStockTable()!;
      table["0:Cattle"] = { young: 0, breeding: 500, old: 0 };
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([0])); // workerFactor 0
      expect(getMilkOutput(0)).toBe(0);
    });

    it("scales with local Cattle headcount and the husbandry labour-sufficiency ratio", () => {
      const table = getOrCreateFaunaStockTable()!;
      table["0:Cattle"] = { young: 100, breeding: 300, old: 100 }; // 500 head
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([5])); // workerFactor 0.5
      // 500 head * 0.01 (Cattle yield/head/month) * 0.5 (workerFactor) = 2.5
      expect(getMilkOutput(0)).toBeCloseTo(2.5, 5);
    });

    it("sums contributions across Cattle, Sheep, and Goats co-located at the same cell", () => {
      const table = getOrCreateFaunaStockTable()!;
      table["0:Cattle"] = { young: 0, breeding: 200, old: 0 }; // 200 * 0.01 = 2
      table["0:Sheep"] = { young: 0, breeding: 1000, old: 0 }; // 1000 * 0.003 = 3
      table["0:Goats"] = { young: 0, breeding: 400, old: 0 }; // 400 * 0.004 = 1.6
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10])); // full coverage, workerFactor 1
      expect(getMilkOutput(0)).toBeCloseTo(2 + 3 + 1.6, 5);
    });

    it("ignores non-dairy grazed species (Horses/Camels) even when present at the same cell", () => {
      const table = getOrCreateFaunaStockTable()!;
      table["0:Horses"] = { young: 0, breeding: 500, old: 0 };
      table["0:Camels"] = { young: 0, breeding: 500, old: 0 };
      setHusbandryRequiredWorkers(new Float32Array([10]));
      setHusbandryWorkers(new Float32Array([10]));
      expect(getMilkOutput(0)).toBe(0);
    });

    it("only reads this cell's own headcount, never another cell's (the geographic-mismatch fix)", () => {
      const table = getOrCreateFaunaStockTable()!;
      table["1:Cattle"] = { young: 0, breeding: 500, old: 0 }; // a neighboring/distant cell's herd
      setHusbandryRequiredWorkers(new Float32Array([10, 10]));
      setHusbandryWorkers(new Float32Array([10, 10]));
      expect(getMilkOutput(0)).toBe(0); // cell 0 has no herd of its own
      expect(getMilkOutput(1)).toBeGreaterThan(0);
    });
  });
});
