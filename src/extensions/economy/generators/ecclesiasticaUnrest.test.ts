import { describe, expect, it } from "vitest";
import type { State } from "../../hostTypes";
import { getReligiousUnrestSupportPenalty, updateReligiousUnrest } from "./ecclesiasticaUnrest";

describe("ecclesiasticaUnrest (PR-17h)", () => {
  describe("updateReligiousUnrest()", () => {
    it("decays toward 0 when Ecclesiastica is well-funded", () => {
      const state = {
        i: 1,
        form: "Monarchy",
        religiousUnrest: 20,
        departmentServiceLevel: { chancery: 1, stewardship: 1, spymastery: 1, ecclesiastica: 0.9 }
      } as unknown as State;

      expect(updateReligiousUnrest(state)).toBe(15); // 20 − 5
      expect(state.religiousUnrest).toBe(15);
    });

    it("gains weakly when moderately underfunded", () => {
      const state = {
        i: 1,
        form: "Monarchy",
        religiousUnrest: 20,
        departmentServiceLevel: { chancery: 1, stewardship: 1, spymastery: 1, ecclesiastica: 0.6 }
      } as unknown as State;

      expect(updateReligiousUnrest(state)).toBe(23); // 20 + 3
    });

    it("gains strongly when badly underfunded", () => {
      const state = {
        i: 1,
        form: "Monarchy",
        religiousUnrest: 20,
        departmentServiceLevel: { chancery: 1, stewardship: 1, spymastery: 1, ecclesiastica: 0.2 }
      } as unknown as State;

      expect(updateReligiousUnrest(state)).toBe(28); // 20 + 8
    });

    it("gains 1.5× faster for a Theocracy than any other form at the same shortfall", () => {
      const theocracy = {
        i: 1,
        form: "Theocracy",
        religiousUnrest: 20,
        departmentServiceLevel: { chancery: 1, stewardship: 1, spymastery: 1, ecclesiastica: 0.2 }
      } as unknown as State;
      const monarchy = {
        i: 2,
        form: "Monarchy",
        religiousUnrest: 20,
        departmentServiceLevel: { chancery: 1, stewardship: 1, spymastery: 1, ecclesiastica: 0.2 }
      } as unknown as State;

      updateReligiousUnrest(theocracy);
      updateReligiousUnrest(monarchy);

      expect(theocracy.religiousUnrest).toBe(32); // 20 + 8 × 1.5
      expect(monarchy.religiousUnrest).toBe(28); // 20 + 8
    });

    it("clamps at the floor of 0 and the ceiling of 100", () => {
      const floored = {
        i: 1,
        form: "Monarchy",
        religiousUnrest: 2,
        departmentServiceLevel: { chancery: 1, stewardship: 1, spymastery: 1, ecclesiastica: 1 }
      } as unknown as State;
      const ceilinged = {
        i: 2,
        form: "Theocracy",
        religiousUnrest: 99,
        departmentServiceLevel: { chancery: 1, stewardship: 1, spymastery: 1, ecclesiastica: 0 }
      } as unknown as State;

      expect(updateReligiousUnrest(floored)).toBe(0);
      expect(updateReligiousUnrest(ceilinged)).toBe(100);
    });

    it("treats an unset religiousUnrest as 0 and an unset departmentServiceLevel as fully funded", () => {
      const state = { i: 1, form: "Monarchy" } as unknown as State;

      expect(updateReligiousUnrest(state)).toBe(0); // already 0, well-funded default → stays at floor
    });
  });

  describe("getReligiousUnrestSupportPenalty()", () => {
    it("is 0 at or below the floor", () => {
      expect(getReligiousUnrestSupportPenalty({ religiousUnrest: 40 })).toBe(0);
      expect(getReligiousUnrestSupportPenalty({ religiousUnrest: 0 })).toBe(0);
      expect(getReligiousUnrestSupportPenalty({})).toBe(0);
    });

    it("scales linearly above the floor", () => {
      expect(getReligiousUnrestSupportPenalty({ religiousUnrest: 90 })).toBe(10); // (90 − 40) × 0.2
      expect(getReligiousUnrestSupportPenalty({ religiousUnrest: 100 })).toBe(12); // (100 − 40) × 0.2
    });
  });
});
