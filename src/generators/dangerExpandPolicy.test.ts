import { describe, expect, it } from "vitest";
import {
  canStateClaimCell,
  FRONTIER_OUTPOST_MAX_DANGER,
  getStateExpandDangerCost,
  STATE_EXPAND_DANGER_BAN
} from "./dangerExpandPolicy";

describe("dangerExpandPolicy", () => {
  it("bans claim at the ban threshold and above", () => {
    expect(getStateExpandDangerCost(STATE_EXPAND_DANGER_BAN)).toBeNull();
    expect(getStateExpandDangerCost(255)).toBeNull();
    expect(canStateClaimCell(STATE_EXPAND_DANGER_BAN)).toBe(false);
  });

  it("allows safe land with zero cost", () => {
    expect(getStateExpandDangerCost(0)).toBe(0);
    expect(canStateClaimCell(0)).toBe(true);
  });

  it("charges moderate danger without banning it", () => {
    const cost = getStateExpandDangerCost(40);
    expect(cost).not.toBeNull();
    expect(cost!).toBeGreaterThan(0);
    expect(canStateClaimCell(40)).toBe(true);
  });

  it("aligns frontier outpost max with ban policy", () => {
    expect(FRONTIER_OUTPOST_MAX_DANGER).toBe(STATE_EXPAND_DANGER_BAN - 1);
  });
});
