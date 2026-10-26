import { describe, expect, it } from "vitest";
import { assessAnnualHerdRenewal, assessJointHerdDemand, requiredJointOfftakeHeads } from "./livestockJointDemand";

const sheep = {
  species: "Sheep",
  cohorts: { young: 0, breeding: 10, old: 0 },
  yields: { milk: { young: 0, breeding: 10, old: 0 }, wool: { young: 1, breeding: 2, old: 2 } }
};

describe("joint livestock demand", () => {
  it("uses the binding joint output rather than adding separate herds for milk and wool", () => {
    const result = assessJointHerdDemand([sheep], { milk: 100, wool: 40 });
    expect(result.herds[0].requirements).toEqual({ milk: 10, wool: 20 });
    expect(result.herds[0].completeConditionalBoundHeads).toBe(20);
  });

  it("credits other species and physical inventory once and keeps bounds conditional", () => {
    const goats = { ...sheep, species: "Goats", yields: { milk: sheep.yields.milk } };
    const result = assessJointHerdDemand([sheep, goats], { milk: 250, wool: 30 }, { milk: 50, wool: 10 });
    expect(result.products.milk.potentialGap).toBe(0);
    expect(result.herds[0].requirements).toEqual({ milk: 10, wool: 10 });
    expect(result.herds[1].requirements).toEqual({ milk: 10, wool: 0 });
  });

  it("does not turn missing demand, an empty herd or an unavailable yield into zero demand", () => {
    const result = assessJointHerdDemand([sheep], { milk: 100, meat: null });
    expect(result.products.meat.potentialGap).toBeNull();
    expect(result.herds[0].completeConditionalBoundHeads).toBeNull();
    expect(result.herds[0].unresolvedProducts).toEqual(["meat"]);
    const empty = assessJointHerdDemand([{ ...sheep, cohorts: { young: 0, breeding: 0, old: 0 } }], { milk: 1 });
    expect(empty.herds[0].requirements.milk).toBeNull();
    expect(empty.herds[0].completeConditionalBoundHeads).toBeNull();
    expect(() => assessJointHerdDemand([sheep], { milk: -1 })).toThrow();
  });

  it("counts meat and hides from one annual slaughter flow without equating it with standing heads", () => {
    expect(requiredJointOfftakeHeads({ meatKg: 1000, hideKg: 100 }, { meatKg: 100, hideKg: 5 })).toBe(20);
    expect(requiredJointOfftakeHeads({ meatKg: null, hideKg: 100 }, { meatKg: 100, hideKg: 5 })).toBeNull();
    expect(requiredJointOfftakeHeads({ meatKg: 1 }, { meatKg: null })).toBeNull();
    expect(requiredJointOfftakeHeads({ meatKg: 0 }, { meatKg: null })).toBe(0);
  });

  it("separates births, natural deaths and annual offtake; aging transfers add no animals", () => {
    const result = assessAnnualHerdRenewal({ young: 25, breeding: 50, old: 25 }, 200, 0.8, 5, 12);
    expect(result).toEqual({
      birthsHeads: 20,
      naturalDeathsHeads: 5,
      naturalNetHeads: 15,
      annualOfftakeHeads: 12,
      netAfterOfftakeHeads: 3
    });
    const unknown = assessAnnualHerdRenewal({ young: 25, breeding: 50, old: 25 }, 0, 0.8, 5, null);
    expect(unknown.birthsHeads).toBe(0);
    expect(unknown.naturalNetHeads).toBe(-5);
    expect(unknown.netAfterOfftakeHeads).toBeNull();
  });
});
