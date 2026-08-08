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
import { getWoolOutput } from "./woolProduction";

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
      // 1000 head * 0.08 fleece/head/month * 0.5 worker factor / 1000 fleeces per market lot = 0.04.
      expect(getWoolOutput(0)).toBeCloseTo(0.04, 5);
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
