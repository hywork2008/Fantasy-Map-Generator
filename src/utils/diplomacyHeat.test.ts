import { describe, expect, it } from "vitest";
import { computeBorderHeat, pairKey } from "./diplomacyHeat";

const event = (from: number, to: number, yearsAgo: number, action = "besieged", toBurg?: number) => ({
  id: "e",
  from,
  to,
  yearsAgo,
  action,
  rawText: "",
  toBurg
});

describe("computeBorderHeat", () => {
  it("is symmetric, decays with age and ignores header strings", () => {
    const heat = computeBorderHeat([
      ["Old War", event(2, 1, 80, "besieged", 5)],
      ["Recent War", event(3, 4, 1, "besieged", 7), event(4, 3, 2)]
    ]);
    const old = heat.get(pairKey(1, 2))!;
    const recent = heat.get(pairKey(4, 3))!;
    expect(recent.heat).toBeGreaterThan(old.heat);
    expect(recent.sites.has(7)).toBe(true);
  });

  it("weights avoided wars lower and records no battle site for them", () => {
    const heat = computeBorderHeat([
      ["Crisis", event(1, 2, 0, "avoided_war", 9)],
      ["War", event(3, 4, 0)]
    ]);
    expect(heat.get(pairKey(1, 2))!.heat).toBeLessThan(heat.get(pairKey(3, 4))!.heat);
    expect(heat.get(pairKey(1, 2))!.sites.size).toBe(0);
  });
});
