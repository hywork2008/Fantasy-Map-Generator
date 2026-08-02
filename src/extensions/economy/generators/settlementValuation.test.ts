import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useOptionsState, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setConstructionOperations, setGoods } from "../economyContext";
import type { ConstructionOperation } from "./constructionEmploymentTypes";
import { getHousingRecipe } from "./housingRecipes";
import {
  BRICK_PER_DWELLING,
  fortificationPremium,
  getBurgSettlementValue,
  getStateSettlementValue,
  STONE_PER_DWELLING,
  unitCost,
  WOOD_PER_DWELLING
} from "./settlementValuation";

function setUpWorld(options: { walls?: number; citadel?: number; state?: number } = {}): void {
  worldContext.populationRate = 1000;
  worldContext.pack = {
    burgs: [
      { i: 0, removed: 1 },
      {
        i: 1,
        cell: 0,
        x: 0,
        y: 0,
        market: 1,
        removed: 0,
        population: 5,
        group: "town",
        type: "Generic",
        culture: 1,
        state: options.state ?? 1,
        walls: options.walls ?? 0,
        citadel: options.citadel ?? 0
      },
      {
        i: 2,
        cell: 1,
        x: 1,
        y: 1,
        market: 1,
        removed: 0,
        population: 3,
        group: "town",
        type: "Generic",
        culture: 1,
        state: options.state ?? 1,
        walls: 0,
        citadel: 0
      },
      {
        i: 3,
        cell: 2,
        x: 2,
        y: 2,
        market: 1,
        removed: 0,
        population: 2,
        group: "fort",
        type: "Generic",
        culture: 1,
        state: options.state ?? 1
      }
    ],
    cultures: [null, { i: 1, name: "Test", type: "Generic" }],
    states: [undefined, { i: 1, name: "A" }, { i: 2, name: "B" }]
  } as unknown as PackedGraph;

  setGoods([
    { i: 1, name: "Wood", tags: ["construction"], value: 1, unit: "pile", icon: "good-wood", color: "#966F33" },
    { i: 2, name: "Stone", tags: ["construction"], value: 1, unit: "pallet", icon: "good-stone", color: "#979EA2" },
    { i: 3, name: "Brick", tags: ["construction"], value: 2, unit: "wain", icon: "good-clay", color: "#a65d3f" }
  ]);
}

function op(partial: Partial<ConstructionOperation> & Pick<ConstructionOperation, "burgId">): ConstructionOperation {
  return {
    i: partial.i ?? partial.burgId,
    burgId: partial.burgId,
    marketId: partial.marketId ?? 1,
    masonWorkers: partial.masonWorkers ?? 0,
    carpenterWorkers: partial.carpenterWorkers ?? 0,
    buildingStock: partial.buildingStock ?? 0,
    dwellingStock: partial.dwellingStock ?? 0,
    hasQuarryAccess: partial.hasQuarryAccess ?? true,
    active: partial.active ?? true
  };
}

describe("unitCost / fortificationPremium", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    setUpWorld();
  });
  afterEach(() => clearEconomyContext());

  it("combines recipe shares with per-dwelling material bundles", () => {
    const recipe = getHousingRecipe({
      cultureType: "Generic",
      hasQuarryAccess: true,
      highFantasy: false,
      brickAvailable: true
    });
    // Wood=1, Stone=1, Brick=2
    const expected =
      1 * recipe.wood * WOOD_PER_DWELLING +
      1 * recipe.stone * STONE_PER_DWELLING +
      2 * recipe.brick * BRICK_PER_DWELLING;
    expect(unitCost(recipe)).toBeCloseTo(expected, 5);
    // Generic + default values (Wood/Stone=1, Brick=2) ≈ 2.1; order-of-magnitude modest by design.
    expect(expected).toBeGreaterThan(1);
    expect(expected).toBeLessThan(20);
  });

  it("stacks walls and citadel premiums", () => {
    expect(fortificationPremium({})).toBe(0);
    expect(fortificationPremium({ walls: 1 })).toBeCloseTo(0.15, 5);
    expect(fortificationPremium({ citadel: 1 })).toBeCloseTo(0.25, 5);
    expect(fortificationPremium({ walls: 1, citadel: 1 })).toBeCloseTo(0.4, 5);
  });
});

describe("getBurgSettlementValue", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    useOptionsState.setState({ culturesSet: "world" });
    setUpWorld();
  });
  afterEach(() => {
    clearEconomyContext();
    useOptionsState.setState({ culturesSet: "world" });
  });

  it("returns null when there is no construction operation", () => {
    setConstructionOperations([]);
    expect(getBurgSettlementValue(1)).toBeNull();
  });

  it("returns null for forts even if an op were present", () => {
    setConstructionOperations([op({ burgId: 3, dwellingStock: 50, buildingStock: 1 })]);
    expect(getBurgSettlementValue(3)).toBeNull();
  });

  it("scales housing value with dwellingStock", () => {
    setConstructionOperations([
      op({ burgId: 1, dwellingStock: 10, buildingStock: 0.1, hasQuarryAccess: true }),
      op({ burgId: 2, dwellingStock: 20, buildingStock: 0.2, hasQuarryAccess: true })
    ]);
    const a = getBurgSettlementValue(1);
    const b = getBurgSettlementValue(2);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(b!.housingValue).toBeCloseTo(a!.housingValue * 2, 1);
    expect(a!.infrastructureValue).toBe(0);
    expect(a!.total).toBeCloseTo(a!.housingValue, 2);
  });

  it("applies fortification premium to total", () => {
    setUpWorld({ walls: 1, citadel: 1 });
    setConstructionOperations([op({ burgId: 1, dwellingStock: 10, buildingStock: 0.5, hasQuarryAccess: true })]);
    const value = getBurgSettlementValue(1);
    expect(value).not.toBeNull();
    expect(value!.fortificationPremium).toBeCloseTo(0.4, 5);
    expect(value!.total).toBeCloseTo(value!.housingValue * 1.4, 2);
  });

  it("uses current recipe replacement cost (brick share raises unitCost when Brick is valuable)", () => {
    setConstructionOperations([op({ burgId: 1, dwellingStock: 10, hasQuarryAccess: false })]);
    // River without quarry is brick-heavy when Brick exists
    worldContext.pack.burgs[1].type = "River";
    worldContext.pack.cultures[1].type = "River";
    const river = getBurgSettlementValue(1);
    worldContext.pack.burgs[1].type = "Nomadic";
    worldContext.pack.cultures[1].type = "Nomadic";
    const nomadic = getBurgSettlementValue(1);
    expect(river!.unitCost).toBeGreaterThan(nomadic!.unitCost);
  });
});

describe("getStateSettlementValue", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    setUpWorld({ state: 1 });
  });
  afterEach(() => clearEconomyContext());

  it("sums active market burgs in the state and ignores forts / other states", () => {
    setConstructionOperations([
      op({ burgId: 1, dwellingStock: 10, hasQuarryAccess: true }),
      op({ burgId: 2, dwellingStock: 5, hasQuarryAccess: true }),
      op({ burgId: 3, dwellingStock: 100, hasQuarryAccess: true }) // fort — ignored
    ]);
    const v1 = getBurgSettlementValue(1)!.total;
    const v2 = getBurgSettlementValue(2)!.total;
    expect(getStateSettlementValue(1)).toBeCloseTo(v1 + v2, 2);
    expect(getStateSettlementValue(2)).toBe(0);
    expect(getStateSettlementValue(0)).toBe(0);
  });
});
