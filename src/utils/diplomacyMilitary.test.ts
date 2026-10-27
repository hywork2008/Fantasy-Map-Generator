import { describe, expect, it } from "vitest";
import type { State } from "../types/models";
import type { WorldOptions } from "../types/WorldState";
import { getDiplomacyMilitaryPersonnel, getMilitaryShare } from "./diplomacyMilitary";

describe("diplomacy military ring", () => {
  it("allocates the circumference in proportion to personnel", () => {
    expect(getMilitaryShare(5, 15)).toBe(0.25);
    expect(getMilitaryShare(15, 5)).toBe(0.75);
    expect(getMilitaryShare(0, 15)).toBe(0);
    expect(getMilitaryShare(15, 0)).toBe(1);
    expect(getMilitaryShare(0, 0)).toBe(0.5);
  });

  it("counts crews across regiments, excluding era-disabled firearms and planned units", () => {
    const state = {
      military: [{ u: { infantry: 5, fleet: 2, musketeers: 10 }, plannedU: { infantry: 100 } }, { u: { infantry: 3 } }]
    } as State;
    const options = {
      military: [
        { name: "infantry", crew: 1, type: "melee" },
        { name: "fleet", crew: 20, type: "naval" },
        { name: "musketeers", crew: 1, type: "ranged" }
      ],
      gunpowderEraEnabled: false
    } as WorldOptions;
    expect(getDiplomacyMilitaryPersonnel(state, options)).toBe(48);
    expect(getDiplomacyMilitaryPersonnel(state, { ...options, gunpowderEraEnabled: true })).toBe(58);
    expect(getDiplomacyMilitaryPersonnel({}, options)).toBe(0);
  });
});
