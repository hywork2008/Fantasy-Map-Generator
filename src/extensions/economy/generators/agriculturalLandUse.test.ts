import { describe, expect, it } from "vitest";
import { STAPLE_CROP_PROFILES } from "../../../data/stapleCrops";
import type { WorldContext } from "../../hostCore";
import {
  AGTECH_NO_DRAFT_EFFECT_SHARE,
  AGTECH_YIELD_BONUS_MAX,
  type AgriculturalConditions,
  advanceAgriculturalSoils,
  calculateAgriculturalLandProfile,
  FOUR_COURSE_CLOVER_LEY_SHARE,
  getCropMix,
  MEGACITY_LABOR_EXPORT_SHARE,
  reconcileForestClearanceForAgriculture,
  STATE_YIELD_BONUS_MAX
} from "./agriculturalLandUse";
import type { Good } from "./goods-generator";

function createWorld(): WorldContext {
  return {
    populationRate: 10,
    distanceScale: 1,
    biomesData: {
      habitability: [0, 80],
      tags: [[], ["forest"]]
    },
    grid: {
      cells: {
        temp: new Int8Array([12, 12]),
        prec: new Uint8Array([45, 45])
      }
    },
    pack: {
      cells: {
        i: new Uint16Array([0, 1]),
        h: new Uint8Array([30, 30]),
        g: new Uint16Array([0, 1]),
        biomeCode: new Uint8Array([1, 1]),
        area: new Float32Array([1, 1]),
        forestCover: new Float32Array([0.9, 0]),
        r: new Uint16Array([0, 0]),
        capacity: new Float32Array([5, 5]),
        pop: new Float32Array([1, 1]),
        maleAdults: new Float32Array([0.5, 0.5]),
        femaleAdults: new Float32Array([0.5, 0.5])
      },
      burgs: []
    }
  } as unknown as WorldContext;
}

function cropGood(i: number, name: string, kind: NonNullable<Good["crop"]>["kind"]): Good {
  return {
    i,
    name,
    tags: ["food", "stapleFood", "crop", kind],
    value: 1,
    unit: "wain",
    icon: "good-grain",
    color: "#ffffff",
    crop: {
      kind,
      yieldMultiplier: 1,
      temperature: { min: -2, idealMin: 5, idealMax: 20, max: 30 },
      precipitation: { min: 8, idealMin: 20, idealMax: 60, max: 85 },
      soils: ["loam", "alluvial", "sandy", "humus", "clay", "thin"]
    }
  };
}

describe("agricultural land use", () => {
  it("derives less cultivable land from higher forest cover while retaining clearing potential", () => {
    const profile = calculateAgriculturalLandProfile(createWorld());

    expect(profile.cultivableArea[0]).toBeGreaterThan(0);
    expect(profile.cultivableArea[0]).toBeLessThan(profile.cultivableArea[1]);
    expect(profile.foodPotential[0]).toBeLessThan(profile.foodPotential[1]);
  });

  it("makes newly opened forest land available to cultivation from the same forest stock", () => {
    const world = createWorld();
    world.pack.cells.forestStock = new Float32Array([0.9, 0]);
    const intact = calculateAgriculturalLandProfile(world);

    world.pack.cells.forestStock[0] = 0.45; // half of the potential forest cover has been opened
    const opened = calculateAgriculturalLandProfile(world);

    expect(opened.cultivableArea[0]).toBeGreaterThan(intact.cultivableArea[0]);
    expect(opened.cultivatedArea[0]).toBeGreaterThanOrEqual(intact.cultivatedArea[0]);
  });

  it("opens initial forest land from residents' grain requirement before calculating cultivated area", () => {
    const world = createWorld();
    world.pack.cells.forestStock = new Float32Array([0.9, 0]);
    // 40 people in cell 0 need about 50 ha including the ten-percent reserve,
    // while intact forest initially leaves only 10 ha open.
    world.pack.cells.pop[0] = 4;
    world.pack.cells.maleAdults[0] = 2;
    world.pack.cells.femaleAdults[0] = 2;

    const before = calculateAgriculturalLandProfile(world);
    const changed = reconcileForestClearanceForAgriculture(world);
    const after = calculateAgriculturalLandProfile(world);

    expect(changed).toBe(true);
    expect(world.pack.cells.forestStock[0]).toBeLessThan(0.9);
    expect(after.cultivableArea[0]).toBeGreaterThan(before.cultivableArea[0]);
    expect(after.cultivatedArea[0]).toBeCloseTo(after.cultivableArea[0], 4);
    expect(after.cultivableArea[0]).toBeGreaterThanOrEqual(after.cultivatedArea[0]);
  });

  it("reserves local Grain fields for a burg's residents except in Megacity mode", () => {
    const normalWorld = createWorld();
    normalWorld.pack.cells.forestStock = new Float32Array([0.9, 0]);
    normalWorld.pack.cells.burg = new Uint16Array([1, 0]);
    normalWorld.pack.burgs = [undefined, { i: 1, cell: 0, population: 3, removed: false }] as never;

    const megacityWorld = createWorld();
    megacityWorld.pack.cells.forestStock = new Float32Array([0.9, 0]);
    megacityWorld.pack.cells.burg = new Uint16Array([1, 0]);
    megacityWorld.pack.burgs = [undefined, { i: 1, cell: 0, population: 3, removed: false }] as never;

    reconcileForestClearanceForAgriculture(normalWorld);
    reconcileForestClearanceForAgriculture(megacityWorld, undefined, undefined, { includeUrbanFoodDemand: false });

    const normalProfile = calculateAgriculturalLandProfile(normalWorld);
    const megacityProfile = calculateAgriculturalLandProfile(megacityWorld, undefined, undefined, {
      includeUrbanFoodDemand: false
    });
    expect(normalWorld.pack.cells.forestStock[0]).toBeLessThan(megacityWorld.pack.cells.forestStock[0]);
    expect(normalProfile.cultivatedArea[0]).toBeGreaterThan(megacityProfile.cultivatedArea[0]);
  });

  it("keeps environmental potential stable when only current population changes", () => {
    const world = createWorld();
    const before = calculateAgriculturalLandProfile(world);
    // Cell 1 is naturally open, so this assertion isolates the population →
    // active-field relationship from the forest-stock opening ceiling.
    world.pack.cells.pop[1] = 4;
    world.pack.cells.maleAdults[1] = 2;
    world.pack.cells.femaleAdults[1] = 2;
    const after = calculateAgriculturalLandProfile(world);

    expect(after.cultivableArea).toEqual(before.cultivableArea);
    expect(after.yieldPerArea).toEqual(before.yieldPerArea);
    expect(after.foodPotential).toEqual(before.foodPotential);
    expect(after.ruralFoodCapacity).toEqual(before.ruralFoodCapacity);
    expect(after.cultivatedArea[1]).toBeGreaterThan(before.cultivatedArea[1]);
    expect(after.farmLaborRequired[1]).toBeGreaterThan(before.farmLaborRequired[1]);
  });

  it("matches the no-argument call when agTechStockByCell is omitted (back-compat)", () => {
    const world = createWorld();
    const withoutArg = calculateAgriculturalLandProfile(world);
    const withZeroStock = calculateAgriculturalLandProfile(world, new Float32Array(2));

    expect(withZeroStock.yieldPerArea).toEqual(withoutArg.yieldPerArea);
    expect(withZeroStock.farmLaborRequired).toEqual(withoutArg.farmLaborRequired);
  });

  it("raises yield and lowers required farm labour with rural technology investment", () => {
    // Both cells share biomeCode 1 ("forest", no draft animal), so full agTechStock on cell 1
    // lands at the no-draft-animal share of the maximum bonus (AGTECH_NO_DRAFT_EFFECT_SHARE).
    const world = createWorld();
    const baseline = calculateAgriculturalLandProfile(world);
    const withAgTech = calculateAgriculturalLandProfile(world, new Float32Array([0, 1]));

    const expectedYieldMultiplier = 1 + AGTECH_YIELD_BONUS_MAX * AGTECH_NO_DRAFT_EFFECT_SHARE;
    expect(withAgTech.yieldPerArea[1]).toBeCloseTo(baseline.yieldPerArea[1] * expectedYieldMultiplier, 4);
    // Tools save labour per hectare, so the same adults open more fields rather than sit idle.
    expect(withAgTech.cultivatedArea[1]).toBeGreaterThan(baseline.cultivatedArea[1]);
    expect(withAgTech.farmLaborRequired[1]).toBeCloseTo(baseline.farmLaborRequired[1], 3);

    // Cell 0's agTechStockByCell entry is 0, so it is untouched by the other cell's investment.
    expect(withAgTech.yieldPerArea[0]).toBe(baseline.yieldPerArea[0]);
  });

  it("reaches the full technology bonus only where a draft animal's biome is present", () => {
    // Cell 0: biomeCode 0 -> "grassland" (Cattle/Horses biomeOutputByTag, draft-capable).
    // Cell 1: biomeCode 1 -> "forest" only (no draft animal).
    const world = createWorld();
    world.biomesData.habitability = [80, 80];
    world.biomesData.tags = [["grassland"], ["forest"]];
    world.pack.cells.biomeCode = new Uint8Array([0, 1]);

    const baseline = calculateAgriculturalLandProfile(world);
    const withAgTech = calculateAgriculturalLandProfile(world, new Float32Array([1, 1]));

    const fullBonusMultiplier = 1 + AGTECH_YIELD_BONUS_MAX;
    const partialBonusMultiplier = 1 + AGTECH_YIELD_BONUS_MAX * AGTECH_NO_DRAFT_EFFECT_SHARE;
    expect(withAgTech.yieldPerArea[0]).toBeCloseTo(baseline.yieldPerArea[0] * fullBonusMultiplier, 4);
    expect(withAgTech.yieldPerArea[1]).toBeCloseTo(baseline.yieldPerArea[1] * partialBonusMultiplier, 4);
  });

  it("raises yield with State-funded infrastructure, independent of market-level agTech", () => {
    const world = createWorld();
    const baseline = calculateAgriculturalLandProfile(world);
    const withStateOnly = calculateAgriculturalLandProfile(world, undefined, new Float32Array([0, 1]));
    const withBoth = calculateAgriculturalLandProfile(world, new Float32Array([0, 1]), new Float32Array([0, 1]));

    const stateBonusMultiplier = 1 + STATE_YIELD_BONUS_MAX;
    const combinedMultiplier =
      (1 + AGTECH_YIELD_BONUS_MAX * AGTECH_NO_DRAFT_EFFECT_SHARE) * (1 + STATE_YIELD_BONUS_MAX);
    expect(withStateOnly.yieldPerArea[1]).toBeCloseTo(baseline.yieldPerArea[1] * stateBonusMultiplier, 4);
    expect(withBoth.yieldPerArea[1]).toBeCloseTo(baseline.yieldPerArea[1] * combinedMultiplier, 4);
    // State infrastructure raises yield only. Food-first planting already uses every farmable
    // adult, so the same labour tends the same area and simply harvests more grain.
    expect(withStateOnly.cultivatedArea[1]).toBeCloseTo(baseline.cultivatedArea[1], 4);
    expect(withStateOnly.farmLaborRequired[1]).toBeCloseTo(baseline.farmLaborRequired[1], 4);
  });

  it("turns adopted four-course rotation into clover forage, yield, labour, and fertility effects", () => {
    const world = createWorld();
    const crops = [cropGood(1, "Wheat", "cereal"), cropGood(2, "Peas", "legume")];
    const baseline = calculateAgriculturalLandProfile(world, undefined, undefined, {}, { cropGoods: crops });
    const fourCourseConditions = {
      cropGoods: crops,
      fourCourseRotationByCell: new Float32Array([0, 1])
    };
    const rotated = calculateAgriculturalLandProfile(world, undefined, undefined, {}, fourCourseConditions);

    expect(rotated.yieldPerArea[1]).toBeGreaterThan(baseline.yieldPerArea[1]);
    expect(rotated.cultivatedArea[1]).toBeGreaterThan(baseline.cultivatedArea[1]);
    expect(rotated.farmLaborRequired[1]).toBeCloseTo(baseline.farmLaborRequired[1], 3);
    expect(rotated.floweringForageArea[1]).toBeCloseTo(rotated.cultivatedArea[1] * FOUR_COURSE_CLOVER_LEY_SHARE, 5);

    const baselineSoil = advanceAgriculturalSoils(world, crops, new Float32Array([1, 1]), new Float32Array(2));
    const rotatedSoil = advanceAgriculturalSoils(
      world,
      crops,
      new Float32Array([1, 1]),
      new Float32Array(2),
      fourCourseConditions
    );
    expect(rotatedSoil.soilFertility[1]).toBeGreaterThan(baselineSoil.soilFertility[1]);
  });

  it("selects one culture-weighted staple and one legume for a three-field plan without an initial soil penalty", () => {
    const world = createWorld();
    const crops = [cropGood(1, "Wheat", "cereal"), cropGood(2, "Peas", "legume"), cropGood(3, "Turnips", "tuber")];
    const mix = getCropMix(world, 1, crops);

    expect(mix).toHaveLength(2);
    expect(mix.filter(entry => entry.good.crop?.kind === "legume")).toHaveLength(1);
    expect(mix.filter(entry => entry.good.crop?.kind !== "legume")).toHaveLength(1);
    expect(mix.find(entry => entry.good.name === "Wheat")?.share).toBeCloseTo(2 / 3, 6);
    expect(mix.find(entry => entry.good.name === "Peas")?.share).toBeCloseTo(1 / 3, 6);

    const next = advanceAgriculturalSoils(world, crops, new Float32Array([1, 1]), new Float32Array(2));
    expect(next.soilFertility[1]).toBeGreaterThanOrEqual(1);
  });

  it("uses culture to choose among crops that are equally viable in the same cell", () => {
    const world = createWorld();
    world.pack.cells.culture = new Uint16Array([1, 1]);
    world.pack.cultures = [undefined, { i: 1, type: "Nomadic" }] as never;
    const crops = [
      cropGood(1, "Wheat", "cereal"),
      cropGood(2, "Millet", "cereal"),
      cropGood(3, "Peas", "legume"),
      cropGood(4, "Lentils", "legume")
    ];

    const mix = getCropMix(world, 1, crops);
    expect(mix.find(entry => entry.good.crop?.kind !== "legume")?.good.name).toBe("Millet");
    expect(mix.find(entry => entry.good.crop?.kind === "legume")?.good.name).toBe("Lentils");
  });

  it("uses actual river allocation to irrigate dry cropland instead of river presence alone", () => {
    const world = createWorld();
    world.biomesData.tags = [["desert"], ["forest"]];
    world.biomesData.habitability = [80, 80];
    world.pack.cells.biomeCode = new Uint8Array([0, 1]);
    world.pack.cells.r = new Uint16Array([1, 0]);
    world.pack.cells.fl = new Uint16Array([100, 0]);
    world.pack.cells.riverDownstream = new Int32Array([-1, -1]);
    world.pack.cells.forestCover = new Float32Array([0, 0]);
    world.grid.cells.prec = new Uint8Array([5, 45]);
    const crops = [cropGood(1, "Wheat", "cereal"), cropGood(2, "Peas", "legume")];

    const rainFed = calculateAgriculturalLandProfile(world, undefined, undefined, {}, { cropGoods: crops });
    const irrigated = calculateAgriculturalLandProfile(
      world,
      undefined,
      undefined,
      {},
      {
        cropGoods: crops,
        irrigationDevelopmentByCell: new Float32Array([1, 0]),
        irrigationConveyanceEfficiencyByCell: new Float32Array([0.9, 0])
      }
    );

    expect(rainFed.foodPotential[0]).toBe(0);
    expect(irrigated.irrigation.irrigatedAreaHa[0]).toBeGreaterThan(0);
    expect(irrigated.foodPotential[0]).toBeGreaterThan(rainFed.foodPotential[0]);
    expect(irrigated.irrigation.residualFlowByCell[0]).toBeLessThan(100 * 30);
  });

  it("depletes soil under continuous cereal cultivation and accumulates salt only when dry fields receive irrigation", () => {
    const world = createWorld();
    const cerealOnly = [cropGood(1, "Wheat", "cereal")];
    const exhausted = advanceAgriculturalSoils(world, cerealOnly, new Float32Array([1, 1]), new Float32Array(2));
    expect(exhausted.soilFertility[1]).toBeLessThan(1);

    world.biomesData.tags = [["desert"], ["forest"]];
    world.pack.cells.biomeCode = new Uint8Array([0, 1]);
    world.pack.cells.r = new Uint16Array([1, 0]);
    world.grid.cells.prec = new Uint8Array([5, 45]);
    const rainFed = advanceAgriculturalSoils(world, cerealOnly, new Float32Array([1, 1]), new Float32Array(2));
    expect(rainFed.irrigationSalinity[0]).toBe(0);

    const irrigation: AgriculturalConditions["irrigation"] = {
      irrigatedAreaHa: new Float32Array([0.1, 0]),
      irrigationSupplement: new Float32Array([15, 0]),
      irrigationDeliveredWater: new Float32Array([1.5, 0]),
      irrigationWaterStress: new Float32Array(2),
      residualFlowByCell: new Float32Array(2),
      allocation: {
        status: "complete",
        allocations: [],
        residualFlowByCell: new Float32Array(2),
        withdrawnFlowByCell: new Float32Array(2),
        diagnostics: []
      }
    };
    const salted = advanceAgriculturalSoils(world, cerealOnly, new Float32Array([1, 1]), new Float32Array(2), {
      irrigation
    });
    expect(salted.irrigationSalinity[0]).toBeGreaterThan(0);
  });

  it("expands fields beyond the subsistence reserve when leftover adults can tend more land", () => {
    const world = createWorld();
    world.pack.cells.pop[1] = 1;
    world.pack.cells.maleAdults[1] = 0.22;
    world.pack.cells.femaleAdults[1] = 0.23;
    const fewHands = calculateAgriculturalLandProfile(world);

    world.pack.cells.maleAdults[1] = 2;
    world.pack.cells.femaleAdults[1] = 2;
    const manyHands = calculateAgriculturalLandProfile(world);

    expect(manyHands.cultivatedArea[1]).toBeGreaterThan(fewHands.cultivatedArea[1]);
    expect(manyHands.cultivatedArea[1]).toBeGreaterThan(fewHands.cultivatedArea[1] * 1.15);
    expect(manyHands.farmLaborRequired[1]).toBeGreaterThan(fewHands.farmLaborRequired[1]);
  });

  it("reserves this year's child→adult arrivals so extra planting cannot cancel sustainable outflow", () => {
    const world = createWorld();
    world.pack.cells.pop[1] = 10;
    world.pack.cells.maleAdults[1] = 2.2;
    world.pack.cells.femaleAdults[1] = 2.3;
    world.pack.cells.children = new Float32Array([0, 4.5]);
    world.pack.cells.elders = new Float32Array([0, 1]);

    const profile = calculateAgriculturalLandProfile(world);
    // 4.5 children / 15 years = 0.3 population points reserved for urban-bound outflow.
    expect(profile.migratableAdults[1]).toBeGreaterThanOrEqual(0.3 - 1e-6);
    expect(profile.cultivatedArea[1]).toBeGreaterThan(0);
  });

  it("reserves the megacity labour-export share so hinterland cells can ship people and extra grain", () => {
    const world = createWorld();
    // Keep the cell labour-constrained (not land-constrained) so the 32% reserve
    // actually changes planted area instead of both modes hitting the same ceiling.
    world.pack.cells.pop[1] = 2;
    world.pack.cells.maleAdults[1] = 0.45;
    world.pack.cells.femaleAdults[1] = 0.45;
    const ruralAdults = 0.9;

    const independent = calculateAgriculturalLandProfile(world);
    const megacity = calculateAgriculturalLandProfile(world, undefined, undefined, {
      includeUrbanFoodDemand: false,
      reserveLaborForUrbanExport: true
    });

    expect(megacity.migratableAdults[1]).toBeGreaterThanOrEqual(ruralAdults * MEGACITY_LABOR_EXPORT_SHARE - 1e-6);
    expect(megacity.migratableAdults[1]).toBeGreaterThan(independent.migratableAdults[1]);
    expect(megacity.cultivatedArea[1]).toBeLessThan(independent.cultivatedArea[1]);
    expect(megacity.cultivatedArea[1]).toBeGreaterThan(0);
  });

  it("selects rain-tolerant staples and still employs adults on wet cells", () => {
    const world = createWorld();
    world.grid.cells.prec = new Uint8Array([45, 45]);
    world.pack.cells.pop[1] = 2;
    world.pack.cells.maleAdults[1] = 0.45;
    world.pack.cells.femaleAdults[1] = 0.45;
    const crops: Good[] = [
      { ...cropGood(1, "Wheat", "cereal"), crop: { ...STAPLE_CROP_PROFILES.Wheat } },
      { ...cropGood(2, "Peas", "legume"), crop: { ...STAPLE_CROP_PROFILES.Peas } }
    ];

    const mix = getCropMix(world, 1, crops);
    expect(mix.length).toBeGreaterThan(0);
    expect(mix.some(entry => entry.good.name === "Peas")).toBe(true);
    expect(mix.find(entry => entry.good.name === "Peas")!.suitability).toBeGreaterThan(
      mix.find(entry => entry.good.name === "Wheat")?.suitability ?? 0
    );

    const profile = calculateAgriculturalLandProfile(world, undefined, undefined, {}, { cropGoods: crops });
    const ruralAdults = 0.9;
    const surplusShare = profile.migratableAdults[1] / ruralAdults;

    expect(profile.yieldPerArea[1]).toBeGreaterThan(0);
    expect(profile.cultivatedArea[1]).toBeGreaterThan(0);
    expect(profile.farmLaborRequired[1]).toBeGreaterThan(0);
    expect(surplusShare).toBeLessThan(0.5);
    expect(surplusShare).toBeGreaterThanOrEqual(0);
  });
});
