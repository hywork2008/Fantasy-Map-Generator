import { describe, expect, it } from "vitest";
import { tradeRibbonMeters } from "./roadTraffic";
import { sanitizeBurgSiteEconomy } from "./site/burgSiteEconomy";
import { suburbanProfile } from "./suburbanLanduse";

const use = (traffic: number, trafficRank: number, paved = true) => ({ traffic, trafficRank, paved });

describe("suburbanProfile", () => {
  it("keeps the neighbour's role when the road has no traffic", () => {
    expect(suburbanProfile("granary", 1200, true, null)).toMatchObject({ profile: "granary", length: 50 });
    expect(suburbanProfile("city", 1200, true, null)).toMatchObject({ profile: "trade", length: 200, clearance: 25 });
    expect(suburbanProfile("enemy", 1200, true, null)).toMatchObject({
      profile: "frontier",
      length: 60,
      clearance: 70
    });
  });

  it("turns a busy road into a trade ribbon and scales the length with traffic", () => {
    expect(suburbanProfile("granary", 1200, true, use(36, 0.8))).toMatchObject({ profile: "trade", length: 300 });
    expect(suburbanProfile("city", 1200, true, use(12, 0.8))).toMatchObject({ profile: "trade", length: 100 });
    expect(tradeRibbonMeters(24)).toBe(200);
    expect(tradeRibbonMeters(80)).toBe(480);
    expect(tradeRibbonMeters(1)).toBe(60);
  });

  it("leaves a quiet recorded road as fields even when the neighbour is a great city", () => {
    expect(suburbanProfile("city", 1200, true, use(2, 0.2))).toMatchObject({ profile: "rural", length: 60 });
    expect(suburbanProfile("granary", 1200, true, use(2, 0.2))).toMatchObject({ profile: "granary", length: 50 });
  });

  it("keeps the glacis on a busy road that faces an enemy", () => {
    expect(suburbanProfile("enemy", 1200, true, use(40, 0.95))).toMatchObject({
      profile: "frontier",
      length: 60,
      clearance: 70
    });
  });
});

describe("sanitizeBurgSiteEconomy lodging", () => {
  it("keeps wayside inns and caravanserais and drops other facility kinds", () => {
    const economy = sanitizeBurgSiteEconomy({
      version: 1,
      year: 1350,
      commerce: {},
      guilds: [],
      facilities: [
        { kind: "inn", count: 1, scale: 0.8, stableSpaces: 4 },
        { kind: "market", count: 2, scale: 1, stableSpaces: 8 },
        { kind: "caravanserai", count: 1, scale: 1.4, stableSpaces: 36.2 },
        { kind: "inn", count: 0, scale: 1, stableSpaces: 2 }
      ]
    });
    expect(economy?.facilities).toEqual([
      { kind: "inn", count: 1, scale: 0.8, stableSpaces: 4 },
      { kind: "caravanserai", count: 1, scale: 1, stableSpaces: 36 }
    ]);
  });
});
