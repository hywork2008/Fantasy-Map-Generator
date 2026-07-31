import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Burg } from "../../../types/models";
import { clearEconomyContext, initEconomyContext, setMartialDisciplineStocks } from "../../economy/economyContext";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, MilitaryRegiment } from "../../hostTypes";
import { burgPopulationPeople, canOccupyBurg, commanderPowerMultiplier } from "./localDefense";

const burg = { population: 20 } as Burg;

describe("local burg defense", () => {
  it("converts a burg's population points to inhabitants", () => {
    expect(burgPopulationPeople(burg, 1000, 1.5)).toBe(30_000);
  });

  it("requires an occupying force based on inhabitants, not raw population points", () => {
    expect(canOccupyBurg(burg, 999, 1000, 1)).toBe(false);
    expect(canOccupyBurg(burg, 1000, 1000, 1)).toBe(true);
  });
});

describe("commanderPowerMultiplier()", () => {
  const regiment = { state: 1, u: { infantry: 100 } } as unknown as MilitaryRegiment;

  it("returns 1 (no commander, no economy context) when neither bonus applies", () => {
    expect(commanderPowerMultiplier([], regiment)).toBe(1);
  });

  describe("with economy context initialized", () => {
    beforeEach(() => {
      initEconomyContext({ worldContext } as unknown as ExtensionAPI);
      worldContext.options = {
        military: [{ icon: "", name: "infantry", rural: 0, urban: 0, crew: 1, power: 1, type: "melee", separate: 0 }]
      };
    });

    afterEach(() => clearEconomyContext());

    it("stacks the State's MartialDisciplineStock bonus on top of the commander bonus", () => {
      setMartialDisciplineStocks([{ stateId: 1, domain: "swordsmanship", stock: 1 }]);

      const withoutStock = commanderPowerMultiplier([], {
        state: 2,
        u: { infantry: 100 }
      } as unknown as MilitaryRegiment);
      const withStock = commanderPowerMultiplier([], regiment);

      expect(withStock).toBeGreaterThan(withoutStock);
    });
  });
});
