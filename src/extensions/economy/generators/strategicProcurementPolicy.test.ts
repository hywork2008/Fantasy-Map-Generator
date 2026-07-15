import { describe, expect, it } from "vitest";
import {
  getMarketStateId,
  getStrategicMarketRelationship,
  isStrategicProcurementPermitted,
  rankStrategicProcurementCandidates,
  type StrategicProcurementCandidate
} from "./strategicProcurementPolicy";

const burgs = [undefined, { state: 1 }, { state: 1 }, { state: 2 }, { state: 3 }, { state: 0 }];

const states = [
  undefined,
  { diplomacy: [undefined, "x", "Enemy", "Neutral"] },
  { diplomacy: [undefined, "Enemy", "x", "Neutral"] },
  { diplomacy: [undefined, "Neutral", "Neutral", "x"] }
];

describe("strategicProcurementPolicy", () => {
  it("derives market state from its center burg and treats missing centers as neutral", () => {
    expect(getMarketStateId({ centerBurgId: 1 }, burgs)).toBe(1);
    expect(getMarketStateId({ centerBurgId: 99 }, burgs)).toBe(0);
  });

  it("recognizes domestic, foreign, Enemy, and stateless market relationships", () => {
    const destination = { centerBurgId: 1 };

    expect(getStrategicMarketRelationship(destination, { centerBurgId: 2 }, burgs, states)).toBe("domestic");
    expect(getStrategicMarketRelationship(destination, { centerBurgId: 3 }, burgs, states)).toBe("enemy");
    expect(getStrategicMarketRelationship(destination, { centerBurgId: 4 }, burgs, states)).toBe("foreign");
    expect(getStrategicMarketRelationship(destination, { centerBurgId: 5 }, burgs, states)).toBe("foreign");
  });

  it("prohibits Enemy strategic trade regardless of the foreign-procurement mode", () => {
    expect(isStrategicProcurementPermitted("enemy", "domesticOnly")).toBe(false);
    expect(isStrategicProcurementPermitted("enemy", "alliesAndNeutral")).toBe(false);
    expect(isStrategicProcurementPermitted("enemy", "unrestricted")).toBe(false);
    expect(isStrategicProcurementPermitted("foreign", "domesticOnly")).toBe(false);
    expect(isStrategicProcurementPermitted("foreign", "alliesAndNeutral")).toBe(true);
  });

  it("prefers domestic supply over a cheaper foreign source, then ranks domestic sources by landed price and duration", () => {
    const candidates: StrategicProcurementCandidate[] = [
      {
        sourceMarketId: 1,
        sourceStateId: 2,
        relationship: "enemy",
        landedUnitPrice: 1,
        durationDays: 1,
        availableUnits: 20
      },
      {
        sourceMarketId: 2,
        sourceStateId: 3,
        relationship: "foreign",
        landedUnitPrice: 2,
        durationDays: 1,
        availableUnits: 20
      },
      {
        sourceMarketId: 3,
        sourceStateId: 1,
        relationship: "domestic",
        landedUnitPrice: 5,
        durationDays: 2,
        availableUnits: 3
      },
      {
        sourceMarketId: 4,
        sourceStateId: 1,
        relationship: "domestic",
        landedUnitPrice: 5,
        durationDays: 1,
        availableUnits: 2
      }
    ];

    expect(
      rankStrategicProcurementCandidates(candidates, "alliesAndNeutral").map(candidate => candidate.sourceMarketId)
    ).toEqual([4, 3, 2]);
  });

  it("lets unrestricted policy compare domestic and foreign candidates by landed price while retaining the Enemy embargo", () => {
    const candidates: StrategicProcurementCandidate[] = [
      {
        sourceMarketId: 1,
        sourceStateId: 1,
        relationship: "domestic",
        landedUnitPrice: 8,
        durationDays: 1,
        availableUnits: 1
      },
      {
        sourceMarketId: 2,
        sourceStateId: 3,
        relationship: "foreign",
        landedUnitPrice: 4,
        durationDays: 5,
        availableUnits: 1
      },
      {
        sourceMarketId: 3,
        sourceStateId: 2,
        relationship: "enemy",
        landedUnitPrice: 1,
        durationDays: 1,
        availableUnits: 1
      }
    ];

    expect(
      rankStrategicProcurementCandidates(candidates, "unrestricted").map(candidate => candidate.sourceMarketId)
    ).toEqual([2, 1]);
  });
});
