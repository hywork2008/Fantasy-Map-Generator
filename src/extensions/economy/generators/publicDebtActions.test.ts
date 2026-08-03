import { describe, expect, it } from "vitest";
import type { State } from "../../hostTypes";
import { issuePublicDebt, repayPublicDebt } from "./publicDebtActions";

describe("publicDebtActions (PR-8/PR-9)", () => {
  it("issues debt into L2 from the credit pool when form and support allow", () => {
    const state = {
      i: 1,
      form: "Monarchy",
      treasury: 10,
      publicDebt: 0,
      creditPoolBalance: 100,
      councilSupport: 60
    } as unknown as State;
    // canCouncilApproveDebtIssue recomputes support from form (Monarchy base 62)
    const result = issuePublicDebt(state, 25);
    expect(result.ok).toBe(true);
    expect(result.amount).toBe(25);
    expect(state.treasury).toBe(35);
    expect(state.publicDebt).toBe(25);
    expect(state.creditPoolBalance).toBe(75);
  });

  it("refuses to issue when the credit pool is empty", () => {
    const state = {
      i: 1,
      form: "Monarchy",
      treasury: 0,
      publicDebt: 0,
      creditPoolBalance: 0
    } as unknown as State;
    const result = issuePublicDebt(state, 25);
    expect(result.ok).toBe(false);
    expect(state.publicDebt || 0).toBe(0);
    expect(state.treasury).toBe(0);
  });

  it("rejects Anarchy debt issuance", () => {
    const state = {
      i: 1,
      form: "Anarchy",
      treasury: 0,
      publicDebt: 0,
      creditPoolBalance: 50
    } as unknown as State;
    const result = issuePublicDebt(state);
    expect(result.ok).toBe(false);
    expect(state.publicDebt || 0).toBe(0);
  });

  it("repays principal from L2 into the credit pool", () => {
    const state = {
      i: 1,
      form: "Republic",
      treasury: 40,
      publicDebt: 30,
      creditPoolBalance: 10
    } as unknown as State;
    const result = repayPublicDebt(state, 15);
    expect(result.ok).toBe(true);
    expect(result.amount).toBe(15);
    expect(state.publicDebt).toBe(15);
    expect(state.treasury).toBe(25);
    expect(state.creditPoolBalance).toBe(25);
  });
});
