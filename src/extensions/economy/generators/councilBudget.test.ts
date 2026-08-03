import { describe, expect, it } from "vitest";
import type { State } from "../../hostTypes";
import { getCouncilBudgetApprovals, refreshCouncilBudgetApprovals } from "./councilBudget";

describe("councilBudget (PR-11)", () => {
  it("approves debt issue when support is at the form base for Monarchy", () => {
    const state = { i: 1, form: "Monarchy", councilSupport: 62, diplomacy: [] } as unknown as State;
    const a = getCouncilBudgetApprovals(state);
    expect(a.debtIssue).toBe(true);
    expect(a.warFooting).toBe(true); // peacetime floor 40
  });

  it("blocks peacetime war footing when support is very low", () => {
    const state = { i: 1, form: "Anarchy", councilSupport: 20, diplomacy: [] } as unknown as State;
    const a = getCouncilBudgetApprovals(state);
    expect(a.warFooting).toBe(false);
    expect(a.debtIssue).toBe(false);
  });

  it("allows war footing at war even with low support", () => {
    const state = {
      i: 1,
      form: "Republic",
      councilSupport: 20,
      diplomacy: ["Enemy"]
    } as unknown as State;
    const a = getCouncilBudgetApprovals(state);
    expect(a.warFooting).toBe(true);
  });

  it("persists approvals onto the state", () => {
    const state = { i: 1, form: "Monarchy", councilSupport: 62, diplomacy: [] } as unknown as State;
    refreshCouncilBudgetApprovals(state);
    expect(state.councilApprovals?.debtIssue).toBe(true);
  });
});
