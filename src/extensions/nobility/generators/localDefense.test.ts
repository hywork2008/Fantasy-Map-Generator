import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Burg } from "../../../types/models";
import {
  clearEconomyContext,
  getGuildKnowledgeStocks,
  initEconomyContext,
  setGuildKnowledgeStocks,
  setMartialDisciplineStocks
} from "../../economy/economyContext";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, MilitaryRegiment, PackedGraph } from "../../hostTypes";
import { burgPopulationPeople, canOccupyBurg, captureBurg, commanderPowerMultiplier } from "./localDefense";

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

describe("captureBurg()", () => {
  function makePack(): PackedGraph {
    return { cells: { burg: [1], state: [0] } } as unknown as PackedGraph;
  }

  it("transfers the burg and its cells to the winner, recording stateHistory", () => {
    const pack = makePack();
    const burg = { i: 1 } as Burg;

    captureBurg(pack, burg, 2);

    expect(burg.state).toBe(2);
    expect(burg.stateHistory).toEqual([2]);
    expect(pack.cells.state[0]).toBe(2);
  });

  describe("with economy context initialized", () => {
    beforeEach(() => {
      initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    });

    afterEach(() => clearEconomyContext());

    it("disrupts the burg's GuildKnowledgeStock on a genuinely new conquest", () => {
      setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.8, treasury: 0 }]);
      const burg = { i: 1, stateHistory: [1] } as Burg;

      captureBurg(makePack(), burg, 2);

      expect(getGuildKnowledgeStocks()[0].stock).toBeLessThan(0.8);
    });

    it("does not disrupt the stock when the winner is reclaiming a burg it held before", () => {
      setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.8, treasury: 0 }]);
      const burg = { i: 1, stateHistory: [1, 2] } as Burg;

      captureBurg(makePack(), burg, 1);

      expect(getGuildKnowledgeStocks()[0].stock).toBe(0.8);
    });
  });
});
