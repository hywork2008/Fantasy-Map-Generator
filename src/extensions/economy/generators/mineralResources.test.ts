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
import {
  getGroundwaterPressureForCell,
  getMinedGoodName,
  isMineSuppliedGoodName,
  MineralResources
} from "./mineralResources";

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

  it("supports the chromium, nickel, molybdenum, and silicon inputs needed for stainless steel", () => {
    for (const commodity of ["chromium", "nickel", "molybdenum", "silicon"] as const) {
      expect(getMinedGoodName(commodity)).toBe(`${commodity} ore`);
      expect(isMineSuppliedGoodName(`${commodity} ore`)).toBe(true);
      expect(isMineSuppliedGoodName(`${commodity} ingot`)).toBe(true);
    }
  });

  // docs/plan/electrolytic-industry-vertical-slice.md §3.2, same "bypasses smelting" shape as coal/
  // phosphate rock above.
  it("maps bauxite to a directly mine-supplied Good, same as phosphate rock", () => {
    expect(getMinedGoodName("bauxite")).toBe("bauxite");
    expect(isMineSuppliedGoodName("Bauxite")).toBe(true);
  });

  // docs/plan/cinnabar-mercury-vertical-slice.md §3.2, same "bypasses smelting" shape as coal/
  // phosphate rock/bauxite above.
  it("maps cinnabar to a directly mine-supplied Good, same as bauxite", () => {
    expect(getMinedGoodName("cinnabar")).toBe("cinnabar");
    expect(isMineSuppliedGoodName("Cinnabar")).toBe(true);
  });

  // docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.2, same "bypasses smelting"
  // shape as coal/phosphate rock/bauxite/cinnabar above.
  it("maps crude oil to a directly mine-supplied Good, same as cinnabar", () => {
    expect(getMinedGoodName("crude oil")).toBe("crude oil");
    expect(isMineSuppliedGoodName("Crude Oil")).toBe(true);
  });

  // docs/plan/natural-gas-lng-power-generation.md §3.2, same "bypasses smelting" shape as crude
  // oil above — natural gas is crude oil's associated-commodity sibling in the same oilField
  // district.
  it("maps natural gas to a directly mine-supplied Good, same as crude oil", () => {
    expect(getMinedGoodName("natural gas")).toBe("natural gas");
    expect(isMineSuppliedGoodName("Natural Gas")).toBe(true);
  });

  it("derives greater groundwater pressure from rainfall and a river, without using it to relocate deposits", () => {
    const priorGrid = worldContext.grid;
    worldContext.pack.cells.g = Uint16Array.from([0, 1]);
    worldContext.pack.cells.r = Uint16Array.from([0, 1]);
    worldContext.grid = { cells: { prec: Uint8Array.from([15, 70]) } } as typeof worldContext.grid;

    try {
      expect(getGroundwaterPressureForCell(1)).toBeGreaterThan(getGroundwaterPressureForCell(0));
    } finally {
      worldContext.grid = priorGrid;
    }
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

  it("never classifies a province as volcanic without a real volcanic-tagged biome (old height+hash heuristic removed)", () => {
    // Same fixture as the top-level beforeEach: height cycles include 76 (>=75) on 1/5 of cells,
    // which the old independent hash-roll heuristic would sometimes tag "volcanic". cells.biomeCode
    // is absent here, so classifyProvince() now has no volcanic signal at all (docs/plan/
    // volcanic-biome-goods.md §3.1) and must never produce a "volcanic" province.
    MineralResources.generate();

    // The "volcanic" province entry always exists (PROVINCE_ORDER is a fixed list), but its
    // cell set must stay empty when no cell carries a real volcanic biome tag.
    expect(getMineralGeologicalProvinces().find(province => province.kind === "volcanic")?.cells).toEqual([]);
  });

  it("classifies a cell into the volcanic province from its real biome tag, independent of height", () => {
    const cells = Array.from({ length: 10 }, (_, i) => i);
    worldContext.seed = "volcano-tag-test";
    worldContext.pack = {
      cells: {
        i: cells,
        // Cell 0 is a low, non-mountain height (25) that would otherwise land in "basin"/"carbonate".
        h: Uint8Array.from(cells, cell => (cell === 0 ? 25 : [76, 61, 43, 32, 26][cell % 5])),
        r: Uint16Array.from(cells, () => 0),
        // Cell 0 = lavaField (code 1, tagged "volcanic"); every other cell = grassland (code 0).
        biomeCode: Uint8Array.from(cells, cell => (cell === 0 ? 1 : 0))
      }
    } as unknown as PackedGraph;
    worldContext.biomesData = {
      keys: ["grassland", "lavaField"],
      tags: [[], ["dry", "mountain", "volcanic"]]
    } as unknown as typeof worldContext.biomesData;

    MineralResources.generate();

    const volcanicProvince = getMineralGeologicalProvinces().find(province => province.kind === "volcanic");
    expect(volcanicProvince?.cells).toEqual([0]);
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

  it("tops up iron-bearing deposits to the state-scaled Generation option without changing their geology", () => {
    const cells = Array.from({ length: 1000 }, (_, i) => i);
    worldContext.options.ironDepositsPerState = 0.8;
    worldContext.pack = {
      cells: {
        i: cells,
        h: Uint8Array.from(cells, cell => [76, 61, 43, 32, 26][cell % 5]),
        r: Uint16Array.from(cells, () => 0)
      },
      states: Array.from({ length: 11 }, (_, i) => ({ i, removed: false }))
    } as unknown as PackedGraph;

    MineralResources.generate();

    const ironDeposits = getMineralDeposits().filter(deposit => deposit.commodities.includes("iron"));
    expect(ironDeposits.length).toBeGreaterThanOrEqual(8);
    expect(
      ironDeposits.every(deposit => ["bandedIron", "skarn", "chromite", "nickelLaterite"].includes(deposit.type))
    ).toBe(true);
  });

  it("generates river iron sand downstream from a reachable primary iron deposit", () => {
    const cells = Array.from({ length: 50 }, (_, i) => i);
    worldContext.pack = {
      cells: {
        i: cells,
        h: Uint8Array.from(cells, () => 55),
        r: Uint16Array.from(cells, () => 1),
        c: cells.map(cell => [cell - 1, cell + 1].filter(neighbor => neighbor >= 0 && neighbor < cells.length))
      },
      rivers: [{ i: 1, cells }],
      states: Array.from({ length: 6 }, (_, i) => ({ i, removed: false }))
    } as unknown as PackedGraph;

    MineralResources.generate();

    const deposits = getMineralDeposits();
    const ironSand = deposits.filter(deposit => deposit.type === "ironSand");
    expect(ironSand).not.toHaveLength(0);
    expect(ironSand.every(deposit => deposit.surveyEvidence?.includes("riverIronSand"))).toBe(true);
    expect(
      ironSand.every(deposit =>
        deposits.some(source => source.i === deposit.secondarySourceDepositId && source.commodities.includes("iron"))
      )
    ).toBe(true);
  });
});
