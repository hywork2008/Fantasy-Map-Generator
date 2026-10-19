import { describe, expect, it } from "vitest";
import {
  annualFarmlandFrames,
  estimateFarmland,
  evaluateFarmlandModel,
  type FarmlandFrame,
  fitFarmlandModel,
  summarizeFarmland
} from "./farmlandCalibration";
import type { FarmlandObservation } from "./farmlandObservation";

const cell: FarmlandObservation = {
  cellId: 1,
  burgId: 1,
  biomeKey: "grassland",
  historicalPeriod: "highMedieval",
  settlementPattern: "standard",
  ruralPeople: 800,
  urbanPeople: 200,
  physicalAreaHa: 500,
  cultivableAreaHa: 400,
  baselineAreaHa: 100,
  annualTemperatureC: 15,
  annualPrecipitationMm: 700,
  height: 25,
  river: true,
  forestCover: 0.2,
  cultivationAreaHa: 200,
  economyCultivatedAreaHa: 180,
  landUseProvenance: "authoritative",
  urbanAllocatedAreaHa: 40
};
const frame = (worldId: string, year: number, overrides: Partial<FarmlandObservation> = {}): FarmlandFrame => ({
  worldId,
  date: `${year}-12-01`,
  snapshot: { version: 1, seed: worldId, year, economyEnabled: true, cells: [{ ...cell, ...overrides }] }
});

describe("farmland calibration API", () => {
  it("summarizes area stocks rather than summing years and retains genuine zeros", () => {
    const frames = [
      frame("a", 100),
      frame("a", 101, { cultivationAreaHa: 0, urbanAllocatedAreaHa: 0 }),
      frame("a", 105)
    ];
    const periods = summarizeFarmland(frames, 5);
    expect(periods).toHaveLength(2);
    expect(periods[0].meanCultivationAreaHa).toBe(100);
    expect(periods[0].meanUrbanAllocatedAreaHa).toBe(20);
    expect(periods[0].complete).toBe(false);
    expect(periods[1].startYear).toBe(105);
    const missing = summarizeFarmland([frame("a", 100, { cultivationAreaHa: null })]);
    expect(missing[0].missingCellYears).toBe(1);
    expect(missing[0].meanCultivationAreaHa).toBeNull();
  });

  it("deduplicates within years and excludes disabled/estimated labels", () => {
    const early = { ...frame("a", 100), date: "100-01-01" };
    const off = frame("off", 100);
    off.snapshot.economyEnabled = false;
    expect(annualFarmlandFrames([frame("a", 100), early, off])).toHaveLength(1);
    const model = fitFarmlandModel([frame("a", 100, { landUseProvenance: "estimated" }), off], {
      trainingWorldIds: ["a", "off"],
      minimumCells: 1,
      minimumWorlds: 1
    });
    expect(model.groups).toEqual([]);
  });

  it("requires independent world support, caps predictions, and shares with the urban population", () => {
    const frames = [frame("a", 100), frame("a", 101), frame("b", 100)];
    const model = fitFarmlandModel(frames, { trainingWorldIds: ["a", "b"], minimumCells: 2 });
    expect(model.groups[0].cells).toBe(2);
    expect(model.groups[0].worlds).toBe(2);
    expect(estimateFarmland(cell, model).areaHa).toBe(200);
    expect(estimateFarmland(cell, model).urbanAllocatedAreaHa).toBe(40);
    expect(estimateFarmland({ ...cell, physicalAreaHa: 150 }, model).areaHa).toBe(150);
    expect(estimateFarmland({ ...cell, cultivableAreaHa: 120 }, model).areaHa).toBe(120);
    expect(() => estimateFarmland({ ...cell, ruralPeople: Number.NaN }, model)).toThrow("finite");
    expect(estimateFarmland({ ...cell, baselineAreaHa: 0 }, model).source).toBe("static-baseline");
    expect(estimateFarmland({ ...cell, biomeKey: "desert" }, model).source).toBe("static-baseline");
    expect(estimateFarmland({ ...cell, ruralPeople: 99_000 }, model).source).toBe("static-baseline");
  });

  it("refuses validation on training worlds and handles zero targets without percentage division", () => {
    const model = fitFarmlandModel([frame("a", 100)], { trainingWorldIds: ["a"], minimumCells: 1, minimumWorlds: 1 });
    expect(() => evaluateFarmlandModel([frame("a", 100)], model, ["a"])).toThrow("disjoint");
    const copy = frame("copy", 100);
    copy.snapshot.seed = "a";
    expect(() => evaluateFarmlandModel([copy], model, ["copy"])).toThrow("seeds must be disjoint");
    const evaluation = evaluateFarmlandModel([frame("b", 100, { cultivationAreaHa: 0 })], model, ["b"]);
    expect(evaluation.model.maeHa).toBe(200);
    expect(evaluation.model.wape).toBeNull();
  });
});
