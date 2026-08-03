import { describe, expect, it } from "vitest";
import type { State } from "../../hostTypes";
import { issuePublicDebt, repayPublicDebt } from "./publicDebtActions";

describe("publicDebtActions (PR-8)", () => {
  it("issues debt into L2 when form and support allow", () => {
    const state = {
      i: 1,
      form: "Monarchy",
      treasury: 10,
      publicDebt: 0,
      councilSupport: 60
    } as unknown as State;
    // canCouncilApproveDebtIssue recomputes support from form (Monarchy base 62)
    const result = issuePublicDebt(state, 25);
    expect(result.ok).toBe(true);
    expect(result.amount).toBe(25);
    expect(state.treasury).toBe(35);
    expect(state.publicDebt).toBe(25);
  });

  it("rejects Anarchy debt issuance", () => {
    const state = { i: 1, form: "Anarchy", treasury: 0, publicDebt: 0 } as unknown as State;
    const result = issuePublicDebt(state);
    expect(result.ok).toBe(false);
    expect(state.publicDebt || 0).toBe(0);
  });

  it("repays principal from L2", () => {
    const state = { i: 1, form: "Republic", treasury: 40, publicDebt: 30 } as unknown as State;
    const result = repayPublicDebt(state, 15);
    expect(result.ok).toBe(true);
    expect(result.amount).toBe(15);
    expect(state.publicDebt).toBe(15);
    expect(state.treasury).toBe(25);
  });
});
