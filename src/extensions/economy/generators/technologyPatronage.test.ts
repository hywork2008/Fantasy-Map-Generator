import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getExperimentalWorkshops,
  getPatronageDeposits,
  initEconomyContext,
  setExperimentalWorkshops
} from "../economyContext";
import { fundWorkshop, hireResearchers } from "./technologyPatronage";

describe("technologyPatronage", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 1200 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Lab", removed: false, capital: 1, treasury: 80 }],
      burgs: [{ i: 0 }, { i: 1, state: 1, market: 1, capital: 1, cell: 0, x: 0, y: 0, removed: false }],
      characters: [
        {
          i: 1,
          name: "Ruler",
          location: 1,
          dead: false,
          wealth: 40,
          titles: [{ landed: true, entityType: "state", entityId: 1, title: "King" }],
          skills: { stewardship: 50, engineering: 70 }
        },
        {
          i: 2,
          name: "Merchant",
          location: 1,
          dead: false,
          wealth: 40,
          titles: [],
          skills: { stewardship: 50 }
        }
      ]
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("charges a landed ruler's treasury and a merchant's wealth", () => {
    expect(fundWorkshop({ characterId: 1, burgId: 1, amount: 16 }).ok).toBe(true);
    expect(worldContext.pack.states[1].treasury).toBe(64);
    expect(getPatronageDeposits()).toHaveLength(1);

    expect(fundWorkshop({ characterId: 2, burgId: 1, amount: 16 }).ok).toBe(true);
    expect(worldContext.pack.characters?.[1].wealth).toBe(24);
  });

  it("hires researchers on an existing workshop without extraWorkers", () => {
    setExperimentalWorkshops([
      {
        burgId: 1,
        sponsorStateId: 1,
        active: true,
        researchers: 2,
        annualBudget: 16,
        experimentRecord: 0,
        lastFundedYear: 1199
      }
    ]);
    expect(hireResearchers({ characterId: 1, burgId: 1, count: 1 }).ok).toBe(true);
    expect(getExperimentalWorkshops()[0].researchers).toBe(3);
    expect(worldContext.pack.states[1].treasury).toBe(72);
  });
});
