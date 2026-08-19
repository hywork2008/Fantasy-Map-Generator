import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext, worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getOrCreateFaunaStockTable,
  getOrCreateMarketGoodProductionTotals,
  getOrCreateNonFoodFaunaDemandHistory,
  getOrCreateNonFoodFaunaDemandSnapshot,
  getOrCreateNonFoodFaunaProductionSnapshot,
  initEconomyContext,
  setCaravans,
  setCultivatedArea,
  setGoods,
  setMarketCellColumn,
  setMarkets
} from "../economyContext";
import {
  AMBIENT_CATS_DEMAND_PER_PERSON,
  AMBIENT_DOGS_DEMAND_PER_PERSON,
  clearFaunaPopulation,
  DOMESTICATED_CAPACITY_MONTHS_PROXY,
  drawDomesticatedFaunaOfftake,
  drawWildFaunaOfftake,
  getDomesticatedCarryingCapacity,
  getDomesticatedCullSelectivity,
  getRealNonMarketDemand,
  getRuralEcosystemDetail,
  getWildCarryingCapacity,
  getWildCullSelectivity,
  hasWildGameHabitat,
  MIN_NON_FOOD_DEMAND_CAPACITY_FRACTION,
  previewDomesticatedFaunaOfftake,
  previewWildFaunaOfftake,
  recordQuarterlyNonFoodDemand,
  updateAnnualFaunaCohorts,
  WILD_GAME_DEFAULT_DENSITY_PER_HECTARE,
  WILD_GAME_DENSITY_PER_HECTARE_BY_TAG,
  WILD_SPECIES_KEY
} from "./faunaPopulation";

const CATTLE_GOOD = {
  i: 1,
  name: "Cattle",
  value: 5,
  tags: ["food", "liveAnimal"],
  unit: "head",
  icon: "icon",
  color: "#fff",
  chance: 4,
  biomeOutputByTag: { grassland: 0.1 },
  demandCoverage: {}
};

// Not in husbandry.ts's HUSBANDRY_SPECIES_PROFILES (unlike Cattle, Phase 3), so it stays on the
// Phase 1/2 flat-rate x months proxy — used where a test wants a plain non-grazed food species.
const PIG_GOOD = {
  i: 3,
  name: "Pig",
  value: 2,
  tags: ["food", "liveAnimal"],
  unit: "head",
  icon: "icon",
  color: "#fff",
  chance: 3,
  biomeOutputByTag: { forest: 0.08 },
  demandCoverage: {}
};

const CATS_GOOD = {
  i: 2,
  name: "Cats",
  value: 3,
  tags: ["liveAnimal", "pestControl"],
  unit: "head",
  icon: "icon",
  color: "#fff",
  chance: 0,
  biomeOutputByTag: { arable: 0.005 },
  demandCoverage: {}
};

const DOGS_GOOD = {
  i: 5,
  name: "Dogs",
  value: 4,
  tags: ["liveAnimal", "herding"],
  unit: "head",
  icon: "icon",
  color: "#fff",
  chance: 0,
  biomeOutputByTag: { arable: 0.005 },
  demandCoverage: {}
};

const HORSES_GOOD = {
  i: 6,
  name: "Horses",
  value: 5,
  tags: ["supply", "military", "draft", "liveAnimal"],
  unit: "head",
  icon: "icon",
  color: "#fff",
  chance: 0,
  biomeOutputByTag: { grassland: 0.05 },
  demandCoverage: {}
};

const CAMELS_GOOD = {
  i: 7,
  name: "Camels",
  value: 5,
  tags: ["supply", "military", "liveAnimal"],
  unit: "head",
  icon: "icon",
  color: "#fff",
  chance: 0,
  biomeOutputByTag: { dry: 0.05 },
  demandCoverage: {}
};

// Not covered by any getRealNonMarketDemand() branch — falls through to `default: return 0`, used
// to test the generic demand-absorption-history/floor mechanics in isolation from the
// species-specific real-use terms (military mounts, draft teams, ambient settlement upkeep).
const ELEPHANTS_GOOD = {
  i: 8,
  name: "Elephants",
  value: 6,
  tags: ["supply", "military", "liveAnimal"],
  unit: "head",
  icon: "icon",
  color: "#fff",
  chance: 0,
  biomeOutputByTag: { forest: 0.01 },
  demandCoverage: {}
};

function biomesData(tagsByCode: Record<number, string[]>) {
  const maxCode = Math.max(...Object.keys(tagsByCode).map(Number));
  const tags: string[][] = [];
  for (let i = 0; i <= maxCode; i++) tags[i] = tagsByCode[i] ?? [];
  return { tags, habitability: tags.map(() => 100) };
}

function forestCellWorld(): void {
  worldContext.pack = {
    cells: {
      i: new Uint16Array([0]),
      h: new Uint8Array([30]),
      biomeCode: new Uint8Array([1]),
      pop: new Float32Array([50]),
      area: new Float32Array([100]), // 100 map-area units
      culture: new Uint16Array([0]),
      burg: new Uint16Array([0]),
      state: new Uint16Array([0]),
      c: [[]]
    },
    burgs: [],
    cultures: [],
    states: []
  } as unknown as PackedGraph;
  worldContext.distanceScale = 1; // physicalHectares = area * scale^2 * 100 = 100 * 1 * 100 = 10,000 ha
  worldContext.biomesData = biomesData({ 1: ["forest"] }) as never;
  setCultivatedArea(new Float32Array([0]));
}

describe("faunaPopulation", () => {
  beforeEach(() => {
    simulationContext.extensions = {};
    initEconomyContext({ worldContext, simulationContext } as unknown as ExtensionAPI);
  });

  afterEach(() => {
    clearEconomyContext();
    simulationContext.extensions = {};
  });

  describe("getRuralEcosystemDetail", () => {
    it("defaults to detailed when options.ruralEcosystemDetail is unset", () => {
      worldContext.options = {} as typeof worldContext.options;
      expect(getRuralEcosystemDetail()).toBe("detailed");
    });

    it("respects an explicit simplified setting", () => {
      worldContext.options = { ruralEcosystemDetail: "simplified" } as typeof worldContext.options;
      expect(getRuralEcosystemDetail()).toBe("simplified");
    });
  });

  describe("getWildCarryingCapacity", () => {
    // 2026-08-07 (docs/plan/fauna-biome-realism.md §2.2/§3 Phase A): no longer forest-only — a
    // habitable biome without a matching density tag falls back to
    // WILD_GAME_DEFAULT_DENSITY_PER_HECTARE (some wildlife) rather than exactly 0. Only a
    // habitability-0 biome (glacier/marine-like) yields 0.
    it("falls back to the default density for a biome with no matching density tag", () => {
      forestCellWorld();
      worldContext.biomesData = biomesData({ 1: [] }) as never; // no tags -> default density applies
      expect(getWildCarryingCapacity(0)).toBeCloseTo(WILD_GAME_DEFAULT_DENSITY_PER_HECTARE * 10000, 5);
    });

    it("is 0 for a habitability-0 biome", () => {
      forestCellWorld();
      const data = biomesData({ 1: [] });
      data.habitability = [0, 0];
      worldContext.biomesData = data as never;
      expect(getWildCarryingCapacity(0)).toBe(0);
    });

    it("uses the best-matching tag's density, not the default, for a tagged biome", () => {
      forestCellWorld();
      worldContext.biomesData = biomesData({ 1: ["grassland"] }) as never;
      expect(getWildCarryingCapacity(0)).toBeCloseTo(WILD_GAME_DENSITY_PER_HECTARE_BY_TAG.grassland! * 10000, 5);
    });

    it("scales with unclaimed (physicalArea - cultivatedArea) hectares", () => {
      forestCellWorld();
      // physicalArea = 10,000 ha, no cultivation yet -> full area is wild habitat.
      expect(getWildCarryingCapacity(0)).toBeCloseTo(WILD_GAME_DENSITY_PER_HECTARE_BY_TAG.forest! * 10000, 5);

      setCultivatedArea(new Float32Array([4000])); // Grain claims 4,000 ha
      expect(getWildCarryingCapacity(0)).toBeCloseTo(WILD_GAME_DENSITY_PER_HECTARE_BY_TAG.forest! * 6000, 5);
    });

    it("never goes negative when cultivation exceeds physical area", () => {
      forestCellWorld();
      setCultivatedArea(new Float32Array([999999]));
      expect(getWildCarryingCapacity(0)).toBe(0);
    });
  });

  describe("hasWildGameHabitat", () => {
    it("is true for any habitable land biome, not just forest", () => {
      forestCellWorld();
      worldContext.biomesData = biomesData({ 1: ["grassland"] }) as never; // e.g. Savanna
      expect(hasWildGameHabitat(0)).toBe(true);
    });

    it("is false for a habitability-0 biome", () => {
      forestCellWorld();
      const data = biomesData({ 1: [] });
      data.habitability = [0, 0];
      worldContext.biomesData = data as never;
      expect(hasWildGameHabitat(0)).toBe(false);
    });

    it("is false below the land-cell height threshold", () => {
      forestCellWorld();
      worldContext.pack.cells.h = new Uint8Array([10]); // water/below-threshold
      expect(hasWildGameHabitat(0)).toBe(false);
    });
  });

  describe("drawWildFaunaOfftake", () => {
    it("passes the desired amount through unchanged in simplified mode, without touching the stock table", () => {
      forestCellWorld();
      worldContext.options = { ruralEcosystemDetail: "simplified" } as typeof worldContext.options;

      expect(drawWildFaunaOfftake(0, 42)).toBe(42);
      expect(getOrCreateFaunaStockTable()).toEqual({});
    });

    it("caps offtake at the harvestable stock once demand exceeds what's actually out there", () => {
      forestCellWorld();
      worldContext.options = { ruralEcosystemDetail: "detailed" } as typeof worldContext.options;

      // First call seeds the stock at 60% of a very large capacity (10,000 ha of unclaimed
      // forest) — comfortably above a modest desired amount, so it's granted in full.
      const modestDesired = 5;
      const granted = drawWildFaunaOfftake(0, modestDesired);
      expect(granted).toBeCloseTo(modestDesired, 5);

      // Now shrink the cell down to almost nothing by claiming nearly all its area as cropland,
      // and reset the stock table so ensureStock re-seeds against the new tiny capacity.
      clearFaunaPopulation();
      setCultivatedArea(new Float32Array([9999.9995])); // leaves ~0.0005 ha wild
      const tinyCapacity = getWildCarryingCapacity(0);
      expect(tinyCapacity).toBeGreaterThan(0);
      expect(tinyCapacity).toBeLessThan(1);

      const hugeDesired = 1000;
      const grantedFromTinyStock = drawWildFaunaOfftake(0, hugeDesired);
      // Seeded stock = 60% of tinyCapacity, well under 1 — offtake can't exceed what exists.
      expect(grantedFromTinyStock).toBeLessThan(1);
      expect(grantedFromTinyStock).toBeGreaterThan(0);
    });

    it("draws down the persisted stock so a second identical draw within the same period yields less", () => {
      forestCellWorld();
      worldContext.options = { ruralEcosystemDetail: "detailed" } as typeof worldContext.options;
      setCultivatedArea(new Float32Array([9999])); // small habitat -> small, easily-exhausted stock

      const capacity = getWildCarryingCapacity(0);
      const initialStock = capacity * 0.6; // INITIAL_STOCK_FRACTION_OF_CAPACITY

      const first = drawWildFaunaOfftake(0, initialStock); // draw (almost) everything
      const second = drawWildFaunaOfftake(0, initialStock); // stock is now near-empty
      expect(first).toBeGreaterThan(0);
      expect(second).toBeLessThan(first);
    });
  });

  describe("previewWildFaunaOfftake", () => {
    // Regression coverage for the 2026-08-07 bug: production-utils.ts's getCellProduction()/
    // getRuralProductionContributions() are also invoked from read-only contexts (map redraw,
    // CellInfo/tooltip hover, the Goods editor's report table) — those must call the preview
    // variant, or every hover/redraw was silently culling live animals (see production-utils.ts's
    // doc-comment on getRuralProductionContributions()).
    it("passes the desired amount through unchanged in simplified mode, without touching the stock table", () => {
      forestCellWorld();
      worldContext.options = { ruralEcosystemDetail: "simplified" } as typeof worldContext.options;

      expect(previewWildFaunaOfftake(0, 42)).toBe(42);
      expect(getOrCreateFaunaStockTable()).toEqual({});
    });

    it("agrees with drawWildFaunaOfftake's first grant but never shrinks the stock on repeat calls", () => {
      forestCellWorld();
      worldContext.options = { ruralEcosystemDetail: "detailed" } as typeof worldContext.options;
      setCultivatedArea(new Float32Array([9999])); // small habitat -> small, easily-exhausted stock

      const desired = getWildCarryingCapacity(0) * 0.6; // = the seeded initial stock exactly

      // Repeated preview calls (simulating repeated mouse hover / redraw) must return the exact
      // same figure every time and never write to the stock table.
      const firstPreview = previewWildFaunaOfftake(0, desired);
      const secondPreview = previewWildFaunaOfftake(0, desired);
      const thirdPreview = previewWildFaunaOfftake(0, desired);
      expect(secondPreview).toBe(firstPreview);
      expect(thirdPreview).toBe(firstPreview);
      expect(getOrCreateFaunaStockTable()).toEqual({});

      // A real draw for the same amount grants exactly what the preview promised...
      const realDraw = drawWildFaunaOfftake(0, desired);
      expect(realDraw).toBeCloseTo(firstPreview, 5);
      // ...and only THAT actually shrinks the stock available to a subsequent draw.
      const drawAfter = drawWildFaunaOfftake(0, desired);
      expect(drawAfter).toBeLessThan(realDraw);
    });
  });

  describe("previewDomesticatedFaunaOfftake", () => {
    it("passes desired amount through unchanged in simplified mode", () => {
      worldContext.options = { ruralEcosystemDetail: "simplified" } as typeof worldContext.options;
      expect(previewDomesticatedFaunaOfftake(0, CATTLE_GOOD as never, 7)).toBe(7);
    });

    it("never shrinks stock on repeat calls (cell 0), unlike drawDomesticatedFaunaOfftake (cell 1)", () => {
      forestCellWorld();
      worldContext.options = { ruralEcosystemDetail: "detailed" } as typeof worldContext.options;

      // Cell 0: preview-only. Repeated hover/redraw-style calls must return the same figure and
      // must never write to the stock table.
      const first = previewDomesticatedFaunaOfftake(0, PIG_GOOD as never, 2);
      const second = previewDomesticatedFaunaOfftake(0, PIG_GOOD as never, 2);
      expect(second).toBe(first);
      expect(getOrCreateFaunaStockTable()).toEqual({});

      // Cell 1: pin a tiny existing stock directly (the flat-rate proxy's capacity otherwise
      // scales with the desired amount itself, so it can never bind on a fresh seed — see
      // getDomesticatedCarryingCapacity's non-grazed branch) and draw well above it, to show that
      // path IS throttled by the second call — the contrast previewDomesticatedFaunaOfftake must avoid.
      getOrCreateFaunaStockTable()!["1:Pig"] = { young: 1, breeding: 1, old: 1 };
      const hugeDesired = 100;
      const realDraw = drawDomesticatedFaunaOfftake(1, PIG_GOOD as never, hugeDesired);
      const drawAfter = drawDomesticatedFaunaOfftake(1, PIG_GOOD as never, hugeDesired);
      expect(drawAfter).toBeLessThan(realDraw);

      // Cell 0's preview is still untouched by cell 1's real draws.
      expect(previewDomesticatedFaunaOfftake(0, PIG_GOOD as never, 2)).toBe(first);
    });
  });

  describe("age-selective culling", () => {
    it("weights wild selectivity toward selective for a Hunting culture at peacetime", () => {
      forestCellWorld();
      worldContext.pack.cultures = [{ i: 0, type: "Hunting" }] as never;
      const huntingSelectivity = getWildCullSelectivity(0);

      worldContext.pack.cultures = [{ i: 0, type: "Generic" }] as never;
      const genericSelectivity = getWildCullSelectivity(0);

      expect(huntingSelectivity).toBeGreaterThan(genericSelectivity);
    });

    it("defaults domesticated culling to selective", () => {
      forestCellWorld();
      expect(getDomesticatedCullSelectivity(0)).toBeGreaterThan(0.5);
    });

    it("draws from old-then-breeding-then-young preferentially when selectivity is high", () => {
      forestCellWorld();
      worldContext.options = { ruralEcosystemDetail: "detailed" } as typeof worldContext.options;
      worldContext.pack.cultures = [{ i: 0, type: "Hunting" }] as never; // high selectivity
      const table = getOrCreateFaunaStockTable()!;
      table[`0:${WILD_SPECIES_KEY}`] = { young: 10, breeding: 10, old: 10 };

      drawWildFaunaOfftake(0, 8); // less than the 10 in `old` alone
      const after = table[`0:${WILD_SPECIES_KEY}`];
      // Highly selective (Hunting, peacetime): old should be drawn down the most.
      expect(after.old).toBeLessThan(10);
      expect(after.young).toBeCloseTo(10, 0); // young barely touched at high selectivity
    });
  });

  describe("getDomesticatedCarryingCapacity", () => {
    it("non-grazed food species (e.g. Pig) use the flat-rate x months proxy directly", () => {
      const flatRate = 2;
      expect(getDomesticatedCarryingCapacity(0, PIG_GOOD as never, flatRate)).toBeCloseTo(
        flatRate * DOMESTICATED_CAPACITY_MONTHS_PROXY,
        5
      );
    });

    it("caps non-food species by the demand-absorption history once it exists, down to the floor", () => {
      forestCellWorld();
      setMarketCellColumn(new Uint16Array([1]));

      const flatRate = 10; // rawCapacity = 10 * 24 = 240, comfortably above any demand cap below
      const rawCapacity = flatRate * DOMESTICATED_CAPACITY_MONTHS_PROXY;
      expect(getDomesticatedCarryingCapacity(0, ELEPHANTS_GOOD as never, flatRate)).toBeCloseTo(rawCapacity, 5);

      const historyTable = getOrCreateNonFoodFaunaDemandHistory()!;
      // average 1 x 1.2 buffer = 1.2 raw cap — but MIN_NON_FOOD_DEMAND_CAPACITY_FRACTION (5% of
      // rawCapacity = 12) now backstops it: a quiet market shrinks the herd, it doesn't erase it.
      historyTable[`1:${ELEPHANTS_GOOD.i}`] = [1, 1, 1, 1];
      expect(getDomesticatedCarryingCapacity(0, ELEPHANTS_GOOD as never, flatRate)).toBeCloseTo(
        rawCapacity * MIN_NON_FOOD_DEMAND_CAPACITY_FRACTION,
        5
      );

      // A genuinely strong market (average well above the floor, still below rawCapacity) wins
      // over both the floor and the earlier weak-history figure.
      historyTable[`1:${ELEPHANTS_GOOD.i}`] = [100, 100, 100, 100];
      expect(getDomesticatedCarryingCapacity(0, ELEPHANTS_GOOD as never, flatRate)).toBeCloseTo(100 * 1.2, 5);
    });

    it("never lets a fully-undemanded non-food species' capacity collapse below the floor", () => {
      forestCellWorld();
      setMarketCellColumn(new Uint16Array([1]));

      const flatRate = 10;
      const rawCapacity = flatRate * DOMESTICATED_CAPACITY_MONTHS_PROXY;
      const historyTable = getOrCreateNonFoodFaunaDemandHistory()!;
      historyTable[`1:${ELEPHANTS_GOOD.i}`] = [0, 0, 0, 0]; // nobody bought any, 4 quarters running

      expect(getDomesticatedCarryingCapacity(0, ELEPHANTS_GOOD as never, flatRate)).toBeCloseTo(
        rawCapacity * MIN_NON_FOOD_DEMAND_CAPACITY_FRACTION,
        5
      );
    });
  });

  describe("getRealNonMarketDemand", () => {
    it("is 0 for a species with no modeled real (off-market) use, e.g. Elephants", () => {
      forestCellWorld();
      expect(getRealNonMarketDemand(0, ELEPHANTS_GOOD as never)).toBe(0);
    });

    it("scales Cats/Dogs ambient demand with real population, Cats higher than Dogs", () => {
      forestCellWorld(); // pop = 50 population points, populationRate unset -> real population 50
      expect(getRealNonMarketDemand(0, CATS_GOOD as never)).toBeCloseTo(50 * AMBIENT_CATS_DEMAND_PER_PERSON, 5);
      expect(getRealNonMarketDemand(0, DOGS_GOOD as never)).toBeCloseTo(50 * AMBIENT_DOGS_DEMAND_PER_PERSON, 5);
      expect(getRealNonMarketDemand(0, CATS_GOOD as never)).toBeGreaterThan(
        getRealNonMarketDemand(0, DOGS_GOOD as never)
      );
    });

    it("attributes a non-Nomadic state's mounted regiment headcount to Horses, not Camels", () => {
      forestCellWorld();
      worldContext.pack.cells.state = new Uint16Array([1]);
      worldContext.pack.cultures = [{ i: 0, type: "Generic" }] as never;
      // getStateMountedHeadcount() sums regiment.u[unitName] for unit names options.military tags
      // "mounted" — it no longer reads regiment.type/regiment.a directly.
      worldContext.options = { military: [{ name: "cavalry", type: "mounted" }] } as typeof worldContext.options;
      worldContext.pack.states = [
        {},
        {
          i: 1,
          culture: 0,
          military: [
            { u: { cavalry: 300, melee: 900 } } // non-mounted headcount must not count toward mount demand
          ]
        }
      ] as never;

      expect(getRealNonMarketDemand(0, HORSES_GOOD as never)).toBeGreaterThanOrEqual(300);
      expect(getRealNonMarketDemand(0, CAMELS_GOOD as never)).toBe(0);
    });

    it("attributes a Nomadic state's mounted regiment headcount to Camels, not Horses", () => {
      forestCellWorld();
      worldContext.pack.cells.state = new Uint16Array([1]);
      worldContext.pack.cultures = [{ i: 0, type: "Nomadic" }] as never;
      worldContext.options = { military: [{ name: "cavalry", type: "mounted" }] } as typeof worldContext.options;
      worldContext.pack.states = [{}, { i: 1, culture: 0, military: [{ u: { cavalry: 300 } }] }] as never;

      expect(getRealNonMarketDemand(0, CAMELS_GOOD as never)).toBe(300);
      // Horses can still pick up caravan-draft demand (world-average, independent of culture), but
      // none is registered here since no caravans exist in this fixture.
      expect(getRealNonMarketDemand(0, HORSES_GOOD as never)).toBe(0);
    });

    it("adds caravan draft-animal usage to Horses' demand, world-averaged across markets", () => {
      forestCellWorld();
      setMarkets([{ i: 1 }, { i: 2 }] as never); // 2 markets
      setCaravans([
        { i: 1, draftAnimalId: "horse" },
        { i: 2, draftAnimalId: "horse" },
        { i: 3, draftAnimalId: "ox" } // not a horse -> excluded
      ] as never);

      expect(getRealNonMarketDemand(0, HORSES_GOOD as never)).toBeCloseTo(2 / 2, 5); // 2 horse-caravans / 2 markets
      expect(getRealNonMarketDemand(0, CAMELS_GOOD as never)).toBe(0); // no camel-drafted caravans exist in this system
    });
  });

  describe("drawDomesticatedFaunaOfftake", () => {
    it("passes desired amount through unchanged in simplified mode", () => {
      worldContext.options = { ruralEcosystemDetail: "simplified" } as typeof worldContext.options;
      expect(drawDomesticatedFaunaOfftake(0, CATTLE_GOOD as never, 7)).toBe(7);
    });

    it("grants the full desired amount when stock comfortably covers it (non-grazed food species)", () => {
      forestCellWorld();
      worldContext.options = { ruralEcosystemDetail: "detailed" } as typeof worldContext.options;
      expect(drawDomesticatedFaunaOfftake(0, PIG_GOOD as never, 2)).toBeCloseTo(2, 5);
    });
  });

  describe("recordQuarterlyNonFoodDemand", () => {
    it("records net stock decrease as consumed, and 0 when stock merely piled up", () => {
      worldContext.options = { ruralEcosystemDetail: "detailed" } as typeof worldContext.options;
      setGoods([CATS_GOOD] as never);
      setMarkets([{ i: 1, goods: { [CATS_GOOD.i]: { stock: 10, price: 3 } } }] as never);

      recordQuarterlyNonFoodDemand(); // first snapshot: no prior baseline, consumed = 0
      let history = getOrCreateNonFoodFaunaDemandHistory()![`1:${CATS_GOOD.i}`];
      expect(history).toEqual([0]);

      setMarkets([{ i: 1, goods: { [CATS_GOOD.i]: { stock: 4, price: 3 } } }] as never); // sold 6
      recordQuarterlyNonFoodDemand();
      history = getOrCreateNonFoodFaunaDemandHistory()![`1:${CATS_GOOD.i}`];
      expect(history).toEqual([0, 6]);

      setMarkets([{ i: 1, goods: { [CATS_GOOD.i]: { stock: 9, price: 3 } } }] as never); // piled back up
      recordQuarterlyNonFoodDemand();
      history = getOrCreateNonFoodFaunaDemandHistory()![`1:${CATS_GOOD.i}`];
      expect(history).toEqual([0, 6, 0]);
    });

    it("keeps only the last 4 quarterly samples", () => {
      worldContext.options = { ruralEcosystemDetail: "detailed" } as typeof worldContext.options;
      setGoods([CATS_GOOD] as never);
      let stock = 100;
      for (let i = 0; i < 6; i++) {
        stock -= 1;
        setMarkets([{ i: 1, goods: { [CATS_GOOD.i]: { stock, price: 3 } } }] as never);
        recordQuarterlyNonFoodDemand();
      }
      const history = getOrCreateNonFoodFaunaDemandHistory()![`1:${CATS_GOOD.i}`];
      expect(history.length).toBe(4);
    });

    it("recovers demand from production+stock delta when stock stays chronically near zero (2026-08-08 fix)", () => {
      // Regression test: a good bought up almost as fast as it's produced (e.g. Sheep, entirely
      // consumed by Wool's `recipes: [{ Sheep: 1 }]`) must not read as "no demand" just because its
      // stock never has room to visibly drop between quarterly snapshots.
      worldContext.options = { ruralEcosystemDetail: "detailed" } as typeof worldContext.options;
      setGoods([CATS_GOOD] as never);
      setMarkets([{ i: 1, goods: { [CATS_GOOD.i]: { stock: 1, price: 3 } } }] as never);

      recordQuarterlyNonFoodDemand(); // first snapshot: no prior baseline, consumed = 0
      expect(getOrCreateNonFoodFaunaDemandHistory()![`1:${CATS_GOOD.i}`]).toEqual([0]);

      // 50 units flowed into the market this quarter, but stock still reads ~1 — it was bought up
      // almost as fast as it arrived. A bare stock delta (previousStock - currentStock) would see
      // this as 0 demand and crash the species' carrying capacity to 0 within a year.
      const productionTotals = getOrCreateMarketGoodProductionTotals()!;
      productionTotals[`1:${CATS_GOOD.i}`] = 50;
      setMarkets([{ i: 1, goods: { [CATS_GOOD.i]: { stock: 1, price: 3 } } }] as never);
      recordQuarterlyNonFoodDemand();
      const history = getOrCreateNonFoodFaunaDemandHistory()![`1:${CATS_GOOD.i}`];
      expect(history).toEqual([0, 50]);
    });

    it("does nothing in simplified mode", () => {
      worldContext.options = { ruralEcosystemDetail: "simplified" } as typeof worldContext.options;
      setGoods([CATS_GOOD] as never);
      setMarkets([{ i: 1, goods: { [CATS_GOOD.i]: { stock: 10, price: 3 } } }] as never);
      recordQuarterlyNonFoodDemand();
      expect(getOrCreateNonFoodFaunaDemandHistory()).toEqual({});
    });
  });

  describe("updateAnnualFaunaCohorts", () => {
    it("no-ops and returns false in simplified mode", () => {
      forestCellWorld();
      worldContext.options = { ruralEcosystemDetail: "simplified" } as typeof worldContext.options;
      expect(updateAnnualFaunaCohorts()).toBe(false);
      expect(getOrCreateFaunaStockTable()).toEqual({});
    });

    it("seeds stock for a fresh forest cell and grows breeding-cohort young the following year", () => {
      forestCellWorld();
      worldContext.options = { ruralEcosystemDetail: "detailed" } as typeof worldContext.options;
      // getSimulationYear() prefers simulationContext.currentYear over options.year once a live
      // simulationContext is wired up (as it is here, for the fauna slice) — drive the guard
      // through that, not options.year (see academyKnowledge.test.ts's contrasting worldContext-only pattern).
      simulationContext.currentYear = 500;

      expect(updateAnnualFaunaCohorts()).toBe(true); // seeds stock
      const table = getOrCreateFaunaStockTable()!;
      const seeded = table[`0:${WILD_SPECIES_KEY}`];
      expect(seeded).toBeDefined();
      expect(seeded.breeding).toBeGreaterThan(0);

      // Same year again -> guarded, no change.
      expect(updateAnnualFaunaCohorts()).toBe(false);

      simulationContext.currentYear = 501;
      expect(updateAnnualFaunaCohorts()).toBe(true);
      const grown = table[`0:${WILD_SPECIES_KEY}`];
      // Breeding cohort with room under capacity should have produced young.
      expect(grown.young).toBeGreaterThan(0);
    });

    it("shrinks stock toward a newly-reduced carrying capacity instead of leaving it stranded above it", () => {
      forestCellWorld();
      worldContext.options = { ruralEcosystemDetail: "detailed" } as typeof worldContext.options;
      simulationContext.currentYear = 500;
      updateAnnualFaunaCohorts();

      const table = getOrCreateFaunaStockTable()!;
      const key = `0:${WILD_SPECIES_KEY}`;
      table[key] = { young: 1000, breeding: 1000, old: 1000 }; // far above any plausible capacity

      setCultivatedArea(new Float32Array([9999])); // shrink habitat sharply
      simulationContext.currentYear = 501;
      updateAnnualFaunaCohorts();

      const after = table[key];
      const total = after.young + after.breeding + after.old;
      const capacity = getWildCarryingCapacity(0);
      expect(total).toBeLessThanOrEqual(capacity + 1e-6);
    });
  });

  describe("clearFaunaPopulation", () => {
    it("empties the stock, demand history, demand snapshot, and production snapshot tables", () => {
      worldContext.options = { ruralEcosystemDetail: "detailed" } as typeof worldContext.options;
      const table = getOrCreateFaunaStockTable()!;
      table["0:Game"] = { young: 1, breeding: 1, old: 1 };
      const history = getOrCreateNonFoodFaunaDemandHistory()!;
      history["1:2"] = [1, 2];
      const snapshot = getOrCreateNonFoodFaunaDemandSnapshot()!;
      snapshot["1:2"] = 5;
      const productionSnapshot = getOrCreateNonFoodFaunaProductionSnapshot()!;
      productionSnapshot["1:2"] = 50;

      clearFaunaPopulation();

      expect(getOrCreateFaunaStockTable()).toEqual({});
      expect(getOrCreateNonFoodFaunaDemandHistory()).toEqual({});
      expect(getOrCreateNonFoodFaunaDemandSnapshot()).toEqual({});
      expect(getOrCreateNonFoodFaunaProductionSnapshot()).toEqual({});
    });
  });
});
