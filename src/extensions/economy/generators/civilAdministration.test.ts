import { describe, expect, it } from "vitest";
import type { Burg, State } from "../../hostTypes";
import { applyCivilAdministrationUpkeep, getBurgLocalAdministrationShare } from "./civilAdministration";

describe("civilAdministration (PR-18)", () => {
  describe("getBurgLocalAdministrationShare()", () => {
    it("varies by governance form", () => {
      expect(getBurgLocalAdministrationShare({ form: "Republic" })).toBe(0.7);
      expect(getBurgLocalAdministrationShare({ form: "Union" })).toBe(0.65);
      expect(getBurgLocalAdministrationShare({ form: "Monarchy" })).toBe(0.45);
      expect(getBurgLocalAdministrationShare({ form: "Theocracy" })).toBe(0.4);
      expect(getBurgLocalAdministrationShare({ form: "Anarchy" })).toBe(0.15);
    });

    it("falls back to the Monarchy share for an unknown/missing form", () => {
      expect(getBurgLocalAdministrationShare({})).toBe(0.45);
    });
  });

  describe("applyCivilAdministrationUpkeep()", () => {
    it("returns an empty breakdown and touches nothing when the total is 0", () => {
      const state = { i: 1, form: "Monarchy", treasury: 500 } as unknown as State;

      const breakdown = applyCivilAdministrationUpkeep(state, 0, []);

      expect(breakdown.totalFromTreasury).toBe(0);
      expect(breakdown.burgLocalAdministrationPaid).toBe(0);
      expect(state.treasury).toBe(500);
    });

    it("attributes the entire local pool to the state when it has no burgs (no phantom discount)", () => {
      const state = { i: 1, form: "Monarchy", treasury: 2000 } as unknown as State;

      const breakdown = applyCivilAdministrationUpkeep(state, 1000, []);

      expect(breakdown.courts).toBe(250);
      expect(breakdown.scribesNotaries).toBe(200);
      expect(breakdown.taxFarmers).toBe(200);
      expect(breakdown.routineLocalAdministration).toBe(200);
      expect(breakdown.messengers).toBe(150);
      expect(breakdown.burgLocalAdministrationPaid).toBe(0);
      expect(breakdown.totalFromTreasury).toBe(1000); // exactly the old undifferentiated total
      expect(state.treasury).toBe(1000);
    });

    it("also falls back to the state when the state's burgs exist but have no population", () => {
      const state = { i: 1, form: "Republic", treasury: 2000 } as unknown as State;
      const burgs = [{ i: 5, state: 1, population: 0, treasury: 9999 } as unknown as Burg];

      const breakdown = applyCivilAdministrationUpkeep(state, 1000, burgs);

      expect(breakdown.totalFromTreasury).toBe(1000);
      expect(breakdown.burgLocalAdministrationPaid).toBe(0);
    });

    it("splits the local pool between state and burgs by governance-form share, keeping messengers 100% state-funded", () => {
      const state = { i: 1, form: "Monarchy", treasury: 2000 } as unknown as State;
      const burgs = [{ i: 5, state: 1, population: 100, treasury: 9999 } as unknown as Burg];

      const breakdown = applyCivilAdministrationUpkeep(state, 1000, burgs);

      // localPool 850 × Monarchy's 0.45 burg share = 382.5 to the burg; 467.5 stays with the state.
      expect(breakdown.burgLocalAdministrationPaid).toBe(382.5);
      expect(breakdown.messengers).toBe(150); // unaffected by burg presence
      expect(breakdown.courts).toBe(137.5);
      expect(breakdown.scribesNotaries).toBe(110);
      expect(breakdown.taxFarmers).toBe(110);
      expect(breakdown.routineLocalAdministration).toBe(110);
      expect(breakdown.totalFromTreasury).toBe(617.5); // 467.5 local + 150 messengers
      expect(state.treasury).toBe(2000 - 617.5);
    });

    it("distributes the burg share across multiple burgs proportional to population", () => {
      const state = { i: 1, form: "Republic", treasury: 5000 } as unknown as State;
      const burgA = { i: 5, state: 1, population: 300, treasury: 2000 } as unknown as Burg;
      const burgB = { i: 6, state: 1, population: 100, treasury: 2000 } as unknown as Burg;
      // A burg belonging to a different state must never be touched.
      const otherStateBurg = { i: 7, state: 2, population: 1000, treasury: 2000 } as unknown as Burg;

      const breakdown = applyCivilAdministrationUpkeep(state, 2000, [burgA, burgB, otherStateBurg]);

      // localPool 1700 × Republic's 0.7 = 1190, split 300:100 (75%/25%) → 892.5 / 297.5.
      expect(burgA.treasury).toBe(2000 - 892.5);
      expect(burgB.treasury).toBe(2000 - 297.5);
      expect(otherStateBurg.treasury).toBe(2000); // untouched
      expect(breakdown.burgLocalAdministrationPaid).toBe(1190);
      expect(breakdown.totalFromTreasury).toBe(810); // 510 local + 300 messengers
    });

    it("caps a burg's payment at its available treasury rather than pushing the shortfall back onto the state", () => {
      const state = { i: 1, form: "Monarchy", treasury: 2000 } as unknown as State;
      const poorBurg = { i: 5, state: 1, population: 100, treasury: 100 } as unknown as Burg;

      const breakdown = applyCivilAdministrationUpkeep(state, 1000, [poorBurg]);

      // Desired burg share was 382.5, but the burg only has 100 — it pays what it has.
      expect(poorBurg.treasury).toBe(0);
      expect(breakdown.burgLocalAdministrationPaid).toBe(100);
      // The state's own share is still based on the *desired* burg share (467.5 local + 150
      // messengers), not inflated to cover what the burg could not pay.
      expect(breakdown.totalFromTreasury).toBe(617.5);
      expect(state.treasury).toBe(2000 - 617.5);
    });
  });
});
