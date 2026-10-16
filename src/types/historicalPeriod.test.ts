import { describe, expect, it } from "vitest";
import { TRADITION_PERIODS } from "../data/civilizationTraditions";
import { windmillsAllowed } from "../extensions/economy/generators/millCapacity";
import { waterTechCeilings } from "../extensions/economy/generators/urbanWaterTech";
import { periodUnitModifier, periodUnitTypeModifier } from "../generators/military-generator";
import { domesticRoadHubPolicy } from "../generators/routes-generator";
import { bridgeCrossingLimitForPeriod } from "../utils/bridgeCrossingPolicy";
import { bridgeSkewLimitForTier, bridgeSkewTierForPeriod } from "../utils/bridgeSkewPolicy";
import { defaultGunpowderEraEnabled } from "../utils/gunpowderEra";
import { riverBridgeTechnology } from "../utils/riverCrossing";
import { residentialStoreys, supportsUrbanMorphology } from "../utils/urbanMorphology";
import { HISTORICAL_PERIODS, historicalPeriodIndex, isHistoricalPeriod } from "./historicalPeriod";

const ANTIQUITY = ["classicalAntiquity", "lateAntiquity"] as const;

describe("historical periods", () => {
  it("orders antiquity before the medieval periods and shares the order with traditions", () => {
    expect(HISTORICAL_PERIODS.slice(0, 3)).toEqual(["classicalAntiquity", "lateAntiquity", "earlyMedieval"]);
    expect(TRADITION_PERIODS).toEqual(HISTORICAL_PERIODS);
    expect(historicalPeriodIndex("lateAntiquity")).toBeLessThan(historicalPeriodIndex("earlyMedieval"));
    expect(historicalPeriodIndex("unknown")).toBe(-1);
    expect(isHistoricalPeriod("classicalAntiquity")).toBe(true);
    expect(isHistoricalPeriod("hellenisticAge")).toBe(false);
  });

  it.each(ANTIQUITY)("%s keeps ancient bridge limits (AGENTS.md)", period => {
    const tier = bridgeSkewTierForPeriod(period);
    expect(tier).toBe(0);
    expect(bridgeSkewLimitForTier(tier, "stone")).toBe(15);
    expect(bridgeSkewLimitForTier(tier, "timber")).toBe(20);
    expect(bridgeCrossingLimitForPeriod(period)).toBe(300);
  });

  it.each(ANTIQUITY)("%s has no windmills, aqueduct-level water supply, and no modern sanitary engineering", period => {
    expect(windmillsAllowed(period)).toBe(false);
    const ceilings = waterTechCeilings(period);
    expect(ceilings.waterLifting).toBeGreaterThan(waterTechCeilings("earlyMedieval").waterLifting);
    expect(ceilings.sanitaryEngineering).toBeLessThan(waterTechCeilings("lateMedieval").sanitaryEngineering);
    expect(supportsUrbanMorphology(period)).toBe(true);
  });
});

describe("antiquity roads, armies and bridges", () => {
  it("joins more hubs to the capital by paved road in antiquity", () => {
    expect(domesticRoadHubPolicy("classicalAntiquity").maxHubs).toBeGreaterThan(
      domesticRoadHubPolicy("lateAntiquity").maxHubs
    );
    expect(domesticRoadHubPolicy("lateAntiquity").maxHubs).toBeGreaterThan(
      domesticRoadHubPolicy("earlyMedieval").maxHubs
    );
    expect(domesticRoadHubPolicy("highMedieval")).toEqual({ maxHubs: 3, perSqrt: 1 });
  });

  it("weights Roman armies toward infantry and away from stirrupless cavalry", () => {
    expect(periodUnitTypeModifier("classicalAntiquity", "melee")).toBeGreaterThan(1);
    expect(periodUnitTypeModifier("classicalAntiquity", "mounted")).toBeLessThan(
      periodUnitTypeModifier("lateAntiquity", "mounted")
    );
    expect(periodUnitTypeModifier("highMedieval", "mounted")).toBe(1);
  });

  it("defaults the gunpowder switch off until the high Middle Ages", () => {
    expect(defaultGunpowderEraEnabled("classicalAntiquity")).toBe(false);
    expect(defaultGunpowderEraEnabled("lateAntiquity")).toBe(false);
    expect(defaultGunpowderEraEnabled("earlyMedieval")).toBe(false);
    expect(defaultGunpowderEraEnabled("highMedieval")).toBe(true);
    expect(defaultGunpowderEraEnabled("ageOfExploration")).toBe(true);
  });

  it("recruits siege engines from antiquity to the late Middle Ages, then retires them for guns", () => {
    const siege = { name: "siegeEngines", type: "machinery" };
    expect(periodUnitModifier("classicalAntiquity", siege)).toBe(1);
    expect(periodUnitModifier("lateMedieval", siege)).toBe(1);
    expect(periodUnitModifier("ageOfExploration", siege)).toBe(0);
    expect(periodUnitModifier(undefined, siege)).toBe(0);
    expect(periodUnitModifier("ageOfExploration", { name: "artillery", type: "machinery" })).toBe(1);
  });

  it("lets Roman arches span about 30 m, without drawbridges", () => {
    expect(riverBridgeTechnology("classicalAntiquity").maxSupportedSpanMeters).toBe(30);
    expect(riverBridgeTechnology("classicalAntiquity").movableOpeningMeters).toBe(0);
    expect(riverBridgeTechnology("earlyMedieval").maxSupportedSpanMeters).toBe(20);
  });

  it("lets Roman insulae rise higher under population pressure", () => {
    expect(residentialStoreys("classicalAntiquity").maximum).toBe(5);
    expect(residentialStoreys("earlyMedieval").maximum).toBe(3);
  });
});
