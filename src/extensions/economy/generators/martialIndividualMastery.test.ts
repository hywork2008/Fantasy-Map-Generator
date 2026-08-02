import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getIndividualSkills,
  initEconomyContext,
  setMartialDisciplineStocks
} from "../economyContext";
import { getIndividualSkill } from "./individualSkillMastery";
import { MartialIndividualMastery } from "./martialIndividualMastery";

const MILITARY_OPTIONS = [
  { icon: "", name: "infantry", rural: 0, urban: 0, crew: 1, power: 1, type: "melee", separate: 0 },
  { icon: "", name: "archers", rural: 0, urban: 0, crew: 1, power: 1, type: "ranged", separate: 0 }
];

describe("MartialIndividualMasteryModule", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500, military: MILITARY_OPTIONS };
    worldContext.pack = {
      characters: [
        {
          i: 7,
          dead: false,
          skills: { martial: 72, prowess: 60 },
          titles: [{ title: "Commander", entityType: "state", entityId: 1 }]
        },
        {
          i: 8,
          dead: false,
          skills: { martial: 90, prowess: 90 },
          titles: []
        }
      ],
      states: [
        { i: 0 },
        {
          i: 1,
          military: [{ state: 1, commanderId: 7, u: { infantry: 100, archers: 100 } }]
        }
      ]
    } as unknown as PackedGraph;
    setMartialDisciplineStocks([
      { stateId: 1, domain: "swordsmanship", stock: 0.8 },
      { stateId: 1, domain: "archery", stock: 0.8 }
    ]);
  });

  afterEach(() => clearEconomyContext());

  it("creates and advances only the commanded swordsmanship and archery records", () => {
    MartialIndividualMastery.settleAnnual();

    const swordsmanship = getIndividualSkill(7, "swordsmanship");
    const archery = getIndividualSkill(7, "archery");
    expect(swordsmanship?.proficiency).toBeGreaterThan(67);
    expect(archery?.proficiency).toBeGreaterThan(67);
    expect(getIndividualSkills().filter(skill => skill.characterId === 8)).toEqual([]);
  });

  it("does not advance twice in the same simulation year", () => {
    MartialIndividualMastery.settleAnnual();
    const first = getIndividualSkill(7, "swordsmanship")?.proficiency;

    MartialIndividualMastery.settleAnnual();

    expect(getIndividualSkill(7, "swordsmanship")?.proficiency).toBe(first);
  });

  it("removes a dead commander's martial records", () => {
    MartialIndividualMastery.settleAnnual();
    worldContext.pack.characters[0].dead = true;
    worldContext.options = { year: 501, military: MILITARY_OPTIONS };

    MartialIndividualMastery.settleAnnual();

    expect(getIndividualSkills().filter(skill => skill.characterId === 7)).toEqual([]);
  });
});
