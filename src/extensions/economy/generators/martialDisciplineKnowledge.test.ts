import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, MilitaryRegiment, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, getMartialDisciplineStocks, initEconomyContext } from "../economyContext";
import {
  getMartialDisciplineMultiplier,
  MARTIAL_SATURATION_HEADCOUNT,
  MartialDisciplineKnowledge
} from "./martialDisciplineKnowledge";

const MILITARY_OPTIONS = [
  { icon: "", name: "infantry", rural: 0, urban: 0, crew: 1, power: 1, type: "melee", separate: 0 },
  { icon: "", name: "archers", rural: 0, urban: 0, crew: 1, power: 1, type: "ranged", separate: 0 },
  { icon: "", name: "cavalry", rural: 0, urban: 0, crew: 1, power: 2, type: "mounted", separate: 0 },
  { icon: "", name: "artillery", rural: 0, urban: 0, crew: 8, power: 12, type: "machinery", separate: 0 }
];
const FULL_HEADCOUNT = MARTIAL_SATURATION_HEADCOUNT;

describe("MartialDisciplineKnowledgeModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500, military: MILITARY_OPTIONS };
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, military: [{ i: 1, u: { infantry: FULL_HEADCOUNT, archers: FULL_HEADCOUNT } }] }]
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("raises swordsmanship and archery stocks separately from a mixed regiment", () => {
    MartialDisciplineKnowledge.settleAnnual();

    const stocks = getMartialDisciplineStocks();
    const swordsmanship = stocks.find(entry => entry.stateId === 1 && entry.domain === "swordsmanship");
    const archery = stocks.find(entry => entry.stateId === 1 && entry.domain === "archery");
    expect(swordsmanship?.stock).toBeGreaterThan(0);
    expect(archery?.stock).toBeGreaterThan(0);
    expect(stocks.find(entry => entry.domain === "horsemanship")).toBeUndefined();
  });

  it("does not track a domain with zero headcount", () => {
    worldContext.pack.states[1].military = [{ i: 1, u: { infantry: FULL_HEADCOUNT } } as unknown as MilitaryRegiment];

    MartialDisciplineKnowledge.settleAnnual();

    expect(getMartialDisciplineStocks().find(entry => entry.domain === "archery")).toBeUndefined();
  });

  it("ignores unclassified unit types (artillery) entirely", () => {
    worldContext.pack.states[1].military = [{ i: 1, u: { artillery: 999 } } as unknown as MilitaryRegiment];

    MartialDisciplineKnowledge.settleAnnual();

    expect(getMartialDisciplineStocks()).toEqual([]);
  });

  it("decays the stock for a state whose standing headcount in a domain drops to zero", () => {
    MartialDisciplineKnowledge.settleAnnual();
    const stockAfterFirstYear = getMartialDisciplineStocks().find(
      entry => entry.stateId === 1 && entry.domain === "swordsmanship"
    )?.stock;
    expect(stockAfterFirstYear).toBeGreaterThan(0);

    worldContext.pack.states[1].military = [{ i: 1, u: { archers: FULL_HEADCOUNT } } as unknown as MilitaryRegiment];
    worldContext.options = { year: 501, military: MILITARY_OPTIONS };
    MartialDisciplineKnowledge.settleAnnual();

    const stockAfterDecay = getMartialDisciplineStocks().find(
      entry => entry.stateId === 1 && entry.domain === "swordsmanship"
    )?.stock;
    expect(stockAfterDecay).toBeLessThan(stockAfterFirstYear ?? 0);
  });

  it("is a no-op the second time it is called within the same simulation year", () => {
    MartialDisciplineKnowledge.settleAnnual();
    const stockAfterFirstCall = getMartialDisciplineStocks().find(entry => entry.domain === "swordsmanship")?.stock;
    MartialDisciplineKnowledge.settleAnnual();

    expect(getMartialDisciplineStocks().find(entry => entry.domain === "swordsmanship")?.stock).toBe(
      stockAfterFirstCall
    );
  });

  describe("getMartialDisciplineMultiplier()", () => {
    it("returns 1 (no bonus) for a State with no tracked stock", () => {
      expect(getMartialDisciplineMultiplier(999, { infantry: 100 })).toBe(1);
    });

    it("returns a weighted-average bonus across a regiment's own unit-type mix", () => {
      MartialDisciplineKnowledge.settleAnnual();

      // Pure-infantry regiment gets the full swordsmanship bonus.
      const swordOnly = getMartialDisciplineMultiplier(1, { infantry: 100 });
      expect(swordOnly).toBeGreaterThan(1);

      // A regiment mixing in an unclassified unit type (artillery) dilutes the weighted average.
      const mixed = getMartialDisciplineMultiplier(1, { infantry: 100, artillery: 100 });
      expect(mixed).toBeGreaterThan(1);
      expect(mixed).toBeLessThan(swordOnly);
    });

    it("returns 1 for an empty regiment", () => {
      expect(getMartialDisciplineMultiplier(1, {})).toBe(1);
    });
  });
});
