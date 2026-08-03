import { describe, expect, it, vi } from "vitest";
import type { State } from "../../hostTypes";
import { canIssueDebtWhileNotInDefault, DEBT_DEFAULT_STREAK_THRESHOLD, updateDebtDefaultStatus } from "./debtDefault";

describe("debtDefault (PR-11)", () => {
  it("enters default after consecutive missed interest cycles", () => {
    const state = {
      i: 1,
      publicDebt: 100,
      militaryDiscontent: 0
    } as unknown as State;

    const first = updateDebtDefaultStatus(state, 5, 0);
    expect(first.inDefault).toBe(false);
    expect(state.debtMissedInterestCycles).toBe(1);

    const second = updateDebtDefaultStatus(state, 5, 0);
    expect(second.enteredDefault).toBe(true);
    expect(second.inDefault).toBe(true);
    expect(state.debtInDefault).toBe(true);
    expect(state.debtMissedInterestCycles).toBe(DEBT_DEFAULT_STREAK_THRESHOLD);
    expect(state.militaryDiscontent).toBeGreaterThan(0);
  });

  it("clears default after a full interest payment", () => {
    const state = {
      i: 1,
      publicDebt: 100,
      debtInDefault: true,
      debtMissedInterestCycles: 3,
      militaryDiscontent: 10
    } as unknown as State;

    const result = updateDebtDefaultStatus(state, 5, 5);
    expect(result.clearedDefault).toBe(true);
    expect(state.debtInDefault).toBe(false);
    expect(state.debtMissedInterestCycles).toBe(0);
  });

  it("blocks new debt while in default", () => {
    expect(canIssueDebtWhileNotInDefault({ debtInDefault: true })).toBe(false);
    expect(canIssueDebtWhileNotInDefault({ debtInDefault: false })).toBe(true);
  });

  it("dispatches fmg:public-debt-default on enter", () => {
    const handler = vi.fn();
    document.addEventListener("fmg:public-debt-default", handler);
    const state = { i: 7, publicDebt: 50, debtMissedInterestCycles: 1 } as unknown as State;
    updateDebtDefaultStatus(state, 3, 0);
    expect(handler).toHaveBeenCalled();
    document.removeEventListener("fmg:public-debt-default", handler);
  });
});
