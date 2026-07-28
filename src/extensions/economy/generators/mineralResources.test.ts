import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getMineralDeposits,
  getMineralDistricts,
  getMineralGeologicalProvinces,
  initEconomyContext
} from "../economyContext";
import { getMinedGoodName, isMineSuppliedGoodName, MineralResources } from "./mineralResources";

describe("MineralResourcesModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    const cells = Array.from({ length: 240 }, (_, i) => i);
    worldContext.seed = "mineral-phase-1";
    worldContext.pack = {
      cells: {
        i: cells,
        h: Uint8Array.from(cells, cell => [76, 61, 43, 32, 26][cell % 5]),
        r: Uint16Array.from(cells, cell => (cell % 5 === 4 ? 1 : 0))
      }
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("is deterministic and independent of biome catalog changes", () => {
    MineralResources.generate();
    const initial = {
      provinces: structuredClone(getMineralGeologicalProvinces()),
      districts: structuredClone(getMineralDistricts()),
      deposits: structuredClone(getMineralDeposits())
    };

    worldContext.biomesData = { name: ["changed"], habitability: [0] } as typeof worldContext.biomesData;
    MineralResources.generate();

    expect(getMineralGeologicalProvinces()).toEqual(initial.provinces);
    expect(getMineralDistricts()).toEqual(initial.districts);
    expect(getMineralDeposits()).toEqual(initial.deposits);
  });

  it("maps extracted metals to Ore while excluding both Ore and Ingot from natural production", () => {
    expect(getMinedGoodName("iron")).toBe("iron ore");
    expect(getMinedGoodName("coal")).toBe("coal");
    expect(isMineSuppliedGoodName("Iron Ore")).toBe(true);
    expect(isMineSuppliedGoodName("Iron Ingot")).toBe(true);
    expect(isMineSuppliedGoodName("Coal")).toBe(true);
    expect(isMineSuppliedGoodName("Tools")).toBe(false);
  });

  it("keeps tin in granite or placer districts and primarily pairs silver with lead", () => {
    MineralResources.generate();
    const deposits = getMineralDeposits();
    const tinDeposits = deposits.filter(deposit => deposit.commodities.includes("tin"));
    const silverDeposits = deposits.filter(deposit => deposit.commodities.includes("silver"));

    expect(tinDeposits).not.toHaveLength(0);
    expect(tinDeposits.every(deposit => deposit.type === "graniteTin" || deposit.type === "placer")).toBe(true);
    expect(silverDeposits).not.toHaveLength(0);
    expect(silverDeposits.filter(deposit => deposit.commodities.includes("lead")).length).toBeGreaterThanOrEqual(
      Math.ceil(silverDeposits.length / 2)
    );
  });

  it("keeps scaling district count with land area well past the old 40-district cap", () => {
    // Regression for docs/plan/mineral-resource-circulation-fixes.md Fix 1: districtCount
    // used to be Math.min(40, ...), so any map with >4,400 land cells produced exactly 40
    // districts no matter how much larger it got.
    const largeCells = Array.from({ length: 20000 }, (_, i) => i);
    worldContext.pack = {
      cells: {
        i: largeCells,
        h: Uint8Array.from(largeCells, cell => [76, 61, 43, 32, 26][cell % 5]),
        r: Uint16Array.from(largeCells, cell => (cell % 5 === 4 ? 1 : 0))
      }
    } as unknown as PackedGraph;

    MineralResources.generate();

    expect(getMineralDistricts().length).toBeGreaterThan(40);
  });
});
