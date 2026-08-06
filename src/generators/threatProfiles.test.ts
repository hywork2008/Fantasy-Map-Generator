import { describe, expect, it } from "vitest";
import {
  buildThreatBandsFromOptions,
  culturesSetUsesFrontierSettlement,
  getThreatOptionDefaults,
  getThreatSpawnProfile,
  HIGH_FANTASY_THREAT_PROFILE,
  resolveThreatCalculation,
  resolveThreatCultureMode,
  type ThreatDangerOptions
} from "./threatProfiles";

const baseOptions = (): ThreatDangerOptions => ({
  threatCalculation: "nonlinear",
  dangerRarity5Min: 1,
  dangerRarity5Max: 2,
  dangerRarity5Power: 50,
  dangerRarity5Type: "Calamity",
  dangerRarity4Min: 2,
  dangerRarity4Max: 4,
  dangerRarity4Power: 30,
  dangerRarity4Type: "Arch-Beast",
  dangerRarity3Min: 5,
  dangerRarity3Max: 10,
  dangerRarity3Power: 20,
  dangerRarity3Type: "Greater Monster",
  dangerRarity1Min: 20,
  dangerRarity1Max: 40,
  dangerRarity1Power: 5,
  dangerRarity1Type: "Beast"
});

describe("threatProfiles", () => {
  it("enables threats only for highFantasy and darkFantasy", () => {
    expect(resolveThreatCultureMode("highFantasy")).toBe("highFantasy");
    expect(resolveThreatCultureMode("darkFantasy")).toBe("darkFantasy");
    expect(resolveThreatCultureMode("world")).toBe("none");
    expect(getThreatSpawnProfile("european")).toBeNull();
  });

  it("highFantasy has no rarity 4–5 and includes r1–r2 with optional r3", () => {
    const p = HIGH_FANTASY_THREAT_PROFILE;
    const rarities = p.bands.map(b => b.rarity);
    expect(rarities).not.toContain(4);
    expect(rarities).not.toContain(5);
    expect(rarities).toContain(1);
    expect(rarities).toContain(2);
    expect(rarities).toContain(3);
    const r3 = p.bands.find(b => b.rarity === 3)!;
    expect(r3.max).toBeLessThanOrEqual(2);
    const r1 = p.bands.find(b => b.rarity === 1)!;
    const r2 = p.bands.find(b => b.rarity === 2)!;
    expect(r1.min).toBeGreaterThan(0);
    expect(r2.min).toBeGreaterThan(0);
  });

  it("fantasy culture sets use frontier settlement default", () => {
    expect(culturesSetUsesFrontierSettlement("highFantasy")).toBe(true);
    expect(culturesSetUsesFrontierSettlement("darkFantasy")).toBe(true);
    expect(culturesSetUsesFrontierSettlement("world")).toBe(false);
  });

  it("resolveThreatCalculation prefers Options over profile defaults", () => {
    expect(resolveThreatCalculation({ threatCalculation: "nonlinear" })).toBe("nonlinear");
    expect(resolveThreatCalculation({ threatCalculation: "max" })).toBe("max");
    expect(resolveThreatCalculation({ threatCalculation: "additive" })).toBe("additive");
    expect(resolveThreatCalculation(null)).toBe("nonlinear");
  });

  it("buildThreatBandsFromOptions uses Options spawn counts and power on darkFantasy", () => {
    const options = baseOptions();
    options.dangerRarity5Min = 3;
    options.dangerRarity5Max = 3;
    options.dangerRarity5Power = 99;
    options.dangerRarity3Min = 0;
    options.dangerRarity3Max = 0;
    options.dangerRarity4Min = 0;
    options.dangerRarity4Max = 0;
    options.dangerRarity1Min = 0;
    options.dangerRarity1Max = 0;

    const bands = buildThreatBandsFromOptions(options, "darkFantasy");
    expect(bands).not.toBeNull();
    const r5 = bands!.find(b => b.rarity === 5)!;
    expect(r5.min).toBe(3);
    expect(r5.max).toBe(3);
    expect(r5.power).toBe(99);
    // Profile still contributes Dire Beast (r2) texture.
    expect(bands!.some(b => b.rarity === 2)).toBe(true);
  });

  it("highFantasy ignores leftover rarity 4–5 Options values", () => {
    const options = baseOptions(); // DF-scale defaults still in store
    const bands = buildThreatBandsFromOptions(options, "highFantasy");
    expect(bands).not.toBeNull();
    expect(bands!.some(b => b.rarity === 4 || b.rarity === 5)).toBe(false);
    expect(bands!.some(b => b.rarity === 1)).toBe(true);
    expect(bands!.some(b => b.rarity === 2)).toBe(true);
    expect(bands!.some(b => b.rarity === 3)).toBe(true);
  });

  it("buildThreatBandsFromOptions returns null for non-fantasy culture sets", () => {
    expect(buildThreatBandsFromOptions(baseOptions(), "european")).toBeNull();
  });

  it("highFantasy option defaults zero out rarity 4–5 and prefer steep-decay aggregation", () => {
    const defaults = getThreatOptionDefaults("highFantasy");
    expect(defaults).not.toBeNull();
    expect(defaults!.threatCalculation).toBe("nonlinear");
    expect(defaults!.dangerRarity5Min).toBe(0);
    expect(defaults!.dangerRarity5Max).toBe(0);
    expect(defaults!.dangerRarity4Min).toBe(0);
    expect(defaults!.dangerRarity4Max).toBe(0);
    expect(defaults!.dangerRarity3Max).toBeLessThanOrEqual(2);
    expect(defaults!.dangerRarity1Min).toBeGreaterThan(0);
  });

  it("darkFantasy option defaults keep calamity ladder and steep-decay aggregation", () => {
    const defaults = getThreatOptionDefaults("darkFantasy");
    expect(defaults).not.toBeNull();
    expect(defaults!.threatCalculation).toBe("nonlinear");
    expect(defaults!.dangerRarity5Min).toBeGreaterThanOrEqual(1);
    expect(defaults!.dangerRarity5Power).toBe(50);
    expect(defaults!.dangerRarity4Power).toBe(30);
    expect(defaults!.dangerRarity3Power).toBe(20);
  });
});
