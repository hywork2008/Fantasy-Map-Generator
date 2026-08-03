import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import {
  applyCoupAftermath,
  CIVIL_UNREST_DISCONTENT_FLOOR,
  CIVIL_UNREST_LEGITIMACY_FLOOR,
  COUP_LEGITIMACY_INITIAL,
  tickCoupLegitimacyAndUnrest
} from "./coupAftermath";

describe("coupAftermath (PR-14)", () => {
  afterEach(() => clearEconomyContext());
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
  });

  it("sets low legitimacy and civil unrest after a coup", () => {
    const handler = vi.fn();
    document.addEventListener("fmg:coup-civil-unrest", handler);
    const state = { i: 1, form: "Monarchy" } as unknown as State;
    const result = applyCoupAftermath(state, "Test coup.");
    expect(result.legitimacy).toBe(COUP_LEGITIMACY_INITIAL);
    expect(state.civilUnrest).toBe(true);
    expect(state.warFooting).toBe(true);
    expect(handler).toHaveBeenCalled();
    document.removeEventListener("fmg:coup-civil-unrest", handler);
  });

  it("recovers legitimacy when not in default", () => {
    const state = {
      i: 1,
      coupLegitimacy: 40,
      civilUnrest: true,
      militaryDiscontent: 20
    } as unknown as State;
    const result = tickCoupLegitimacyAndUnrest(state);
    expect(result.legitimacy).toBeGreaterThan(40);
  });

  it("fires civil unrest pressure when legitimacy is low and discontent is high", () => {
    const state = {
      i: 1,
      coupLegitimacy: CIVIL_UNREST_LEGITIMACY_FLOOR - 5,
      civilUnrest: true,
      militaryDiscontent: CIVIL_UNREST_DISCONTENT_FLOOR
    } as unknown as State;
    const result = tickCoupLegitimacyAndUnrest(state);
    expect(result.unrestFired).toBe(true);
    expect(state.militaryDiscontent).toBeGreaterThan(CIVIL_UNREST_DISCONTENT_FLOOR);
  });
});
