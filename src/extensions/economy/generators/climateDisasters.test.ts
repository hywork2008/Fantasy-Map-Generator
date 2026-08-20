import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getClimateFoodStress,
  initEconomyContext,
  setIrrigationDevelopment
} from "../economyContext";
import {
  advanceDisasterStage,
  ClimateDisasters,
  climateFoodStressForStage,
  computeDroughtSeverity,
  computeStateAridity,
  DROUGHT_RELIEF_BUDGET_ACTIVE,
  rollClimateAnomaly
} from "./climateDisasters";

const NO_SHOCK_RNG = { gauss: () => 0 };
const DRY_SHOCK_RNG = { gauss: () => 100 };
const WET_SHOCK_RNG = { gauss: () => -100 };

describe("computeStateAridity", () => {
  it("returns ~1 for a dry, hot state", () => {
    expect(computeStateAridity(0, 40)).toBeCloseTo(1, 5);
  });

  it("returns ~0 for a wet, mild state", () => {
    expect(computeStateAridity(20, 8)).toBeCloseTo(0, 5);
  });

  it("increases monotonically as precipitation drops", () => {
    const wetter = computeStateAridity(12, 15);
    const drier = computeStateAridity(6, 15);
    expect(drier).toBeGreaterThan(wetter);
  });
});

describe("rollClimateAnomaly", () => {
  it("mean-reverts toward 0 with no shock", () => {
    expect(rollClimateAnomaly(1, NO_SHOCK_RNG)).toBeCloseTo(0.6, 5);
    expect(rollClimateAnomaly(-1, NO_SHOCK_RNG)).toBeCloseTo(-0.6, 5);
  });

  it("clamps to [-1, 1]", () => {
    expect(rollClimateAnomaly(1, DRY_SHOCK_RNG)).toBeLessThanOrEqual(1);
    expect(rollClimateAnomaly(-1, WET_SHOCK_RNG)).toBeGreaterThanOrEqual(-1);
  });
});

describe("computeDroughtSeverity", () => {
  it("ignores a wet anomaly (only the dry half of the swing matters)", () => {
    const withWetAnomaly = computeDroughtSeverity(0.5, -1, 0);
    const withNoAnomaly = computeDroughtSeverity(0.5, 0, 0);
    expect(withWetAnomaly).toBeCloseTo(withNoAnomaly, 5);
  });

  it("raises severity with a dry anomaly", () => {
    const base = computeDroughtSeverity(0.5, 0, 0);
    const dry = computeDroughtSeverity(0.5, 1, 0);
    expect(dry).toBeGreaterThan(base);
  });

  it("reduces severity as state-average irrigation development rises", () => {
    const none = computeDroughtSeverity(1, 1, 0);
    const half = computeDroughtSeverity(1, 1, 0.5);
    const full = computeDroughtSeverity(1, 1, 1);
    expect(half).toBeLessThan(none);
    expect(full).toBeLessThan(half);
  });
});

describe("advanceDisasterStage", () => {
  it("walks calm -> watch -> active -> severe as severity climbs", () => {
    expect(advanceDisasterStage("calm", 0.1, 0)).toBe("calm");
    expect(advanceDisasterStage("calm", 0.3, 0)).toBe("watch");
    expect(advanceDisasterStage("watch", 0.55, 0)).toBe("active");
    expect(advanceDisasterStage("active", 0.8, 0)).toBe("severe");
  });

  it("escalates a sustained active year to severe after 2 consecutive years", () => {
    expect(advanceDisasterStage("active", 0.6, 1)).toBe("active");
    expect(advanceDisasterStage("active", 0.6, 2)).toBe("severe");
  });

  it("lingers in recovering for at least a year before returning to calm", () => {
    expect(advanceDisasterStage("severe", 0.1, 3)).toBe("recovering");
    expect(advanceDisasterStage("recovering", 0.25, 0)).toBe("recovering");
    expect(advanceDisasterStage("recovering", 0.1, 0)).toBe("calm");
  });
});

describe("climateFoodStressForStage", () => {
  it("is 0 at calm and scales up through the stages", () => {
    expect(climateFoodStressForStage("calm", 0.9)).toBe(0);
    expect(climateFoodStressForStage("watch", 0.4)).toBeCloseTo(0.1, 5);
    expect(climateFoodStressForStage("active", 0.6)).toBeCloseTo(0.6, 5);
    expect(climateFoodStressForStage("severe", 0.9)).toBeCloseTo(1, 5);
    expect(climateFoodStressForStage("recovering", 0.5)).toBeCloseTo(0.2, 5);
  });
});

describe("ClimateDisasters.settleAnnual", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1000 } as typeof worldContext.options;
    worldContext.grid = {
      cells: {
        // Cell 0/1 → dry state 1 (drought-prone); cell 2/3 → wet state 2 (never dry).
        prec: [1, 1, 20, 20],
        temp: [30, 30, 10, 10]
      }
    } as unknown as typeof worldContext.grid;
    worldContext.pack = {
      states: [
        { i: 0 },
        { i: 1, name: "Dryland", removed: false, treasury: 100 },
        { i: 2, name: "Wetland", removed: false, treasury: 100 }
      ],
      cells: {
        i: [0, 1, 2, 3],
        h: [30, 30, 30, 30],
        g: [0, 1, 2, 3],
        state: { 0: 1, 1: 1, 2: 2, 3: 2 }
      }
    } as unknown as PackedGraph;
    setIrrigationDevelopment(new Float32Array(4));
  });

  afterEach(() => {
    clearEconomyContext();
  });

  it("does nothing the second time it is called in the same simulation year", () => {
    expect(ClimateDisasters.settleAnnual(DRY_SHOCK_RNG)).toBe(true);
    const stageAfterFirst = worldContext.pack.states[1].droughtStage;
    expect(ClimateDisasters.settleAnnual(DRY_SHOCK_RNG)).toBe(false);
    expect(worldContext.pack.states[1].droughtStage).toBe(stageAfterFirst);
  });

  it("escalates a dry, hot, unirrigated State toward drought and spends emergency relief", () => {
    ClimateDisasters.settleAnnual(DRY_SHOCK_RNG);

    const dryland = worldContext.pack.states[1];
    expect(dryland.droughtStage).not.toBe("calm");
    expect(dryland.droughtSeverity).toBeGreaterThan(0);
    expect(dryland.climateFoodStress).toBeGreaterThan(0);
    expect(dryland.treasury).toBeLessThan(100);
    expect(dryland.lastDisasterRelief).toBeGreaterThan(0);
    expect(dryland.disasterLog).toHaveLength(1);
    expect(dryland.disasterLog?.[0]?.kind).toBe("drought");
  });

  it("leaves a wet, mild State calm with no relief spent and no chronicle entry", () => {
    ClimateDisasters.settleAnnual(WET_SHOCK_RNG);

    const wetland = worldContext.pack.states[2];
    expect(wetland.droughtStage).toBe("calm");
    expect(wetland.climateFoodStress ?? 0).toBe(0);
    expect(wetland.treasury).toBe(100);
    expect(wetland.disasterLog ?? []).toHaveLength(0);
  });

  it("broadcasts each State's climateFoodStress onto its own cells only", () => {
    ClimateDisasters.settleAnnual(DRY_SHOCK_RNG);

    const stress = getClimateFoodStress();
    const dryland = worldContext.pack.states[1];
    const wetland = worldContext.pack.states[2];
    expect(stress[0]).toBeCloseTo(dryland.climateFoodStress ?? 0, 5);
    expect(stress[1]).toBeCloseTo(dryland.climateFoodStress ?? 0, 5);
    expect(stress[2]).toBeCloseTo(wetland.climateFoodStress ?? 0, 5);
    expect(stress[3]).toBeCloseTo(wetland.climateFoodStress ?? 0, 5);
  });

  it("only partially funds relief when the treasury cannot cover the full budget", () => {
    worldContext.pack.states[1].treasury = 2;
    ClimateDisasters.settleAnnual(DRY_SHOCK_RNG);

    const dryland = worldContext.pack.states[1];
    expect(dryland.treasury).toBe(0);
    expect(dryland.lastDisasterRelief).toBe(2);
    expect(dryland.lastDisasterRelief).toBeLessThan(DROUGHT_RELIEF_BUDGET_ACTIVE);
  });
});
