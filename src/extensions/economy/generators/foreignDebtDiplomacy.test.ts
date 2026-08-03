import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext, setMarkets } from "../economyContext";
import { FOREIGN_DEBT_DEFAULT_STREAK, serviceForeignDebtWithDiplomacy } from "./foreignDebtDiplomacy";

describe("foreignDebtDiplomacy (PR-14)", () => {
  afterEach(() => clearEconomyContext());
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    setMarkets([]);
  });

  it("enters foreign default and worsens Ally → Friendly after missed coupons", () => {
    const borrower = {
      i: 1,
      form: "Monarchy",
      treasury: 0,
      diplomacy: ["x", "x", "Ally"],
      foreignLoans: [
        {
          creditorStateId: 2,
          creditorName: "Richland",
          principal: 40,
          interestRate: 0.05,
          missedInterestCycles: FOREIGN_DEBT_DEFAULT_STREAK - 1
        }
      ]
    } as unknown as State;
    const creditor = {
      i: 2,
      name: "Richland",
      treasury: 10,
      diplomacy: ["x", "Ally", "x"]
    } as unknown as State;
    worldContext.pack = {
      states: [undefined, borrower, creditor],
      burgs: [],
      characters: []
    } as unknown as PackedGraph;

    const result = serviceForeignDebtWithDiplomacy(borrower);
    expect(result.enteredDefaultWith).toContain(2);
    expect(borrower.foreignLoans?.[0]?.inDefault).toBe(true);
    expect(borrower.foreignDebtInDefault).toBe(true);
    expect(borrower.diplomacy?.[2]).toBe("Friendly");
    expect(result.diplomacyWorsened.length).toBeGreaterThan(0);
  });

  it("pays interest without default when cash covers the coupon", () => {
    const borrower = {
      i: 1,
      form: "Monarchy",
      treasury: 15,
      diplomacy: ["x", "x", "Ally"],
      foreignLoans: [
        {
          creditorStateId: 2,
          creditorName: "Richland",
          principal: 40,
          interestRate: 0.05
        }
      ]
    } as unknown as State;
    const creditor = {
      i: 2,
      name: "Richland",
      treasury: 10,
      diplomacy: ["x", "Ally", "x"]
    } as unknown as State;
    worldContext.pack = {
      states: [undefined, borrower, creditor],
      burgs: [],
      characters: []
    } as unknown as PackedGraph;

    const result = serviceForeignDebtWithDiplomacy(borrower);
    expect(result.interestPaid).toBeCloseTo(2, 5);
    expect(result.enteredDefaultWith).toHaveLength(0);
    expect(borrower.diplomacy?.[2]).toBe("Ally");
  });
});
