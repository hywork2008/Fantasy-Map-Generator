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

  describe("department-budget-cut lines (PR-17f)", () => {
    it("computes all 4 department-budget-cut approvals", () => {
      const state = { i: 1, form: "Monarchy", councilSupport: 90, diplomacy: [] } as unknown as State;
      const a = getCouncilBudgetApprovals(state);
      expect(typeof a.cutChancery).toBe("boolean");
      expect(typeof a.cutStewardship).toBe("boolean");
      expect(typeof a.cutSpymastery).toBe("boolean");
      expect(typeof a.cutEcclesiastica).toBe("boolean");
    });

    it("blocks cutting Ecclesiastica for a Theocracy even at healthy support (clergy defends its own budget)", () => {
      const state = { i: 1, form: "Theocracy", councilSupport: 90, diplomacy: [] } as unknown as State;
      const a = getCouncilBudgetApprovals(state);
      expect(a.cutEcclesiastica).toBe(false);
    });

    it("blocks every department cut when support is far below every cut line's threshold", () => {
      const state = { i: 1, form: "Anarchy", councilSupport: 5, diplomacy: [] } as unknown as State;
      const a = getCouncilBudgetApprovals(state);
      expect(a.cutChancery).toBe(false);
      expect(a.cutStewardship).toBe(false);
      expect(a.cutSpymastery).toBe(false);
      expect(a.cutEcclesiastica).toBe(false);
    });

    it("persists the department-cut approvals onto the state", () => {
      const state = { i: 1, form: "Monarchy", councilSupport: 62, diplomacy: [] } as unknown as State;
      refreshCouncilBudgetApprovals(state);
      expect(state.councilApprovals?.cutChancery).toBeDefined();
      expect(state.councilApprovals?.cutStewardship).toBeDefined();
      expect(state.councilApprovals?.cutSpymastery).toBeDefined();
      expect(state.councilApprovals?.cutEcclesiastica).toBeDefined();
    });
  });
});
