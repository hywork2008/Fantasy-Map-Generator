import { beforeEach, describe, expect, it } from "vitest";
import { getNavalTechBonus, resetNavalTechBonuses } from "./navalTechBonus";

function dispatchShipCompleted(detail: { stateId: number | null; owner: "state" | "market" }): void {
  document.dispatchEvent(new CustomEvent("fmg:shipbuilding-ship-completed", { detail }));
}

describe("navalTechBonus", () => {
  beforeEach(() => {
    resetNavalTechBonuses();
  });

  it("defaults to 1 (no bonus) for a state with no completed hulls", () => {
    expect(getNavalTechBonus(1)).toBe(1);
  });

  it("increases the bonus for a state when a state-owned hull completes", () => {
    dispatchShipCompleted({ stateId: 1, owner: "state" });
    expect(getNavalTechBonus(1)).toBeCloseTo(1.1, 5);

    dispatchShipCompleted({ stateId: 1, owner: "state" });
    expect(getNavalTechBonus(1)).toBeCloseTo(1.2, 5);
  });

  it("ignores market-owned completions", () => {
    dispatchShipCompleted({ stateId: 1, owner: "market" });
    expect(getNavalTechBonus(1)).toBe(1);
  });

  it("ignores completions with no state (stateless/free-city burgs)", () => {
    dispatchShipCompleted({ stateId: null, owner: "state" });
    expect(getNavalTechBonus(1)).toBe(1);
  });

  it("does not leak bonus across unrelated states", () => {
    dispatchShipCompleted({ stateId: 1, owner: "state" });
    expect(getNavalTechBonus(2)).toBe(1);
  });

  it("caps the bonus at the configured maximum", () => {
    for (let i = 0; i < 100; i++) dispatchShipCompleted({ stateId: 1, owner: "state" });
    expect(getNavalTechBonus(1)).toBe(3);
  });

  it("resets on fmg:generate-post-core (new map)", () => {
    dispatchShipCompleted({ stateId: 1, owner: "state" });
    expect(getNavalTechBonus(1)).toBeGreaterThan(1);

    document.dispatchEvent(new CustomEvent("fmg:generate-post-core"));
    expect(getNavalTechBonus(1)).toBe(1);
  });
});
