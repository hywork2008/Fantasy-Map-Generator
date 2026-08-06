import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import "../../characters/types";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getGuildKnowledgeStocks,
  initEconomyContext,
  setGuildKnowledgeStocks,
  setIndividualSkills
} from "../economyContext";
import { getGuildBonus } from "./guildKnowledge";
import { GuildSuccession } from "./guildSuccession";
import { getIndividualSkill } from "./individualSkillMastery";

const MASTER_ROLE_KIND = "guildMaster";
const APPRENTICE_ROLE_KIND = "guildApprentice";

function isMaster(character: Character, burgId = 1): boolean {
  return !!character.roles?.some(
    role => role.kind === MASTER_ROLE_KIND && role.entityId === burgId && role.domain === "metallurgy" && !role.endYear
  );
}

function isApprenticeOf(character: Character, masterId: number, burgId = 1): boolean {
  return !!character.roles?.some(
    role =>
      role.kind === APPRENTICE_ROLE_KIND &&
      role.entityId === burgId &&
      role.domain === "metallurgy" &&
      role.organizationId === masterId &&
      !role.endYear
  );
}

describe("GuildSuccessionModule", () => {
  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);

    worldContext.seed = "guild-succession";
    worldContext.options = { year: 500 };
    worldContext.nameBases = [{ i: 0, name: "Test", min: 3, max: 10, d: "", m: 0, b: "Anna,Bob,Carla,David,Erin" }];
    worldContext.pack = {
      characters: [],
      cultures: [{ i: 0, name: "Test culture", base: 0, shield: "" }],
      states: [
        { i: 0, name: "Neutrals", culture: 0 },
        { i: 1, name: "Kingdom of Foo", culture: 0 }
      ],
      burgs: [
        { i: 0 } as unknown as Burg,
        { i: 1, name: "Ironhold", culture: 0, state: 1, cell: 1 } as unknown as Burg
      ],
      cells: { i: [0, 1], culture: Uint16Array.from([0, 0]) }
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  it("does nothing for a burg with no tracked metallurgy stock", () => {
    GuildSuccession.settleAnnual();

    expect(worldContext.pack.characters).toHaveLength(0);
  });

  it("creates a guild master for a burg with an active metallurgy stock", () => {
    setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.5, treasury: 0 }]);

    GuildSuccession.settleAnnual();

    const master = worldContext.pack.characters.find(c => isMaster(c));
    expect(master).toBeDefined();
    expect(master?.location).toBe(1);
    // A freshly-created master's engineering skill always rolls >=40 (createPerson's primarySkill
    // bias), so it also immediately takes on an apprentice the same year.
    expect(master && worldContext.pack.characters.some(c => isApprenticeOf(c, master.i))).toBe(true);
  });

  it("keeps the existing master instead of creating a second one on the following year", () => {
    setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.5, treasury: 0 }]);
    GuildSuccession.settleAnnual();
    const firstMasterCount = worldContext.pack.characters.filter(c => isMaster(c)).length;

    worldContext.options = { year: 501 };
    GuildSuccession.settleAnnual();

    expect(worldContext.pack.characters.filter(c => isMaster(c))).toHaveLength(firstMasterCount);
  });

  it("reports (burgId, domain) only for masters newly created this pass, so a caller can seed their working capital", () => {
    setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.5, treasury: 0 }]);

    const firstPass = GuildSuccession.settleAnnual();
    expect(firstPass).toEqual([{ burgId: 1, domain: "metallurgy" }]);

    worldContext.options = { year: 501 };
    const secondPass = GuildSuccession.settleAnnual();
    expect(secondPass).toEqual([]);
  });

  it("returns an empty list when called again within the same simulation year (already-settled guard)", () => {
    setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.5, treasury: 0 }]);

    GuildSuccession.settleAnnual();
    const secondCallSameYear = GuildSuccession.settleAnnual();

    expect(secondCallSameYear).toEqual([]);
  });

  it("caps a master at two apprentices", () => {
    setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.5, treasury: 0 }]);
    for (let year = 500; year < 510; year++) {
      worldContext.options = { year };
      GuildSuccession.settleAnnual();
    }

    const master = worldContext.pack.characters.find(c => isMaster(c))!;
    const apprentices = worldContext.pack.characters.filter(c => isApprenticeOf(c, master.i));
    expect(apprentices.length).toBeLessThanOrEqual(2);
  });

  it("migrates practical blacksmithing from engineering and grows it through guild training", () => {
    const master: Character = {
      i: 1,
      name: "Master",
      age: 40,
      gender: "male",
      culture: 0,
      titles: [],
      affinities: {},
      marriages: [],
      state: 1,
      skills: {
        artistry: 1,
        diplomacy: 1,
        engineering: 100,
        geography: 1,
        intrigue: 1,
        learning: 1,
        martial: 1,
        prowess: 1,
        stewardship: 1
      },
      personality: {
        boldness: 1,
        compassion: 1,
        greed: 1,
        honor: 1,
        rationality: 1,
        sociability: 1,
        vengefulness: 1,
        zeal: 1,
        energy: 1,
        piety: 1,
        guile: 1,
        confidence: 1
      },
      family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
      appearance: 50,
      prestige: 50,
      pastTitles: [],
      location: 1,
      roles: [
        {
          source: "economy",
          kind: MASTER_ROLE_KIND,
          entityType: "burg",
          entityId: 1,
          domain: "metallurgy",
          label: "Guild Master"
        }
      ]
    };
    const apprentice: Character = {
      ...master,
      i: 2,
      name: "Apprentice",
      age: 14,
      skills: { ...master.skills, engineering: 10 },
      roles: [
        {
          source: "economy",
          kind: APPRENTICE_ROLE_KIND,
          entityType: "burg",
          entityId: 1,
          domain: "metallurgy",
          organizationId: 1,
          label: "Guild Apprentice"
        }
      ]
    };
    worldContext.pack.characters = [master, apprentice];
    setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 1, treasury: 0 }]);

    GuildSuccession.settleAnnual();

    const practicalSkill = getIndividualSkill(apprentice.i);
    expect(practicalSkill?.proficiency).toBeGreaterThan(8);
    // Engineering remains the broad technical trait; it is no longer mutated as craft practice.
    expect(apprentice.skills.engineering).toBe(10);
  });

  it("promotes an underqualified apprentice but leaves the master's technique as a reconstruction lead", () => {
    const master: Character = {
      i: 1,
      name: "Master",
      age: 70,
      gender: "male",
      culture: 0,
      titles: [],
      affinities: {},
      marriages: [],
      state: 1,
      dead: true,
      skills: {
        artistry: 1,
        diplomacy: 1,
        engineering: 80,
        geography: 1,
        intrigue: 1,
        learning: 1,
        martial: 1,
        prowess: 1,
        stewardship: 1
      },
      personality: {
        boldness: 1,
        compassion: 1,
        greed: 1,
        honor: 1,
        rationality: 1,
        sociability: 1,
        vengefulness: 1,
        zeal: 1,
        energy: 1,
        piety: 1,
        guile: 1,
        confidence: 1
      },
      family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
      appearance: 50,
      prestige: 50,
      pastTitles: [],
      location: 1,
      roles: [
        {
          source: "economy",
          kind: MASTER_ROLE_KIND,
          entityType: "burg",
          entityId: 1,
          domain: "metallurgy",
          label: "Guild Master"
        }
      ]
    };
    const apprentice: Character = {
      ...master,
      i: 2,
      name: "Apprentice",
      age: 20,
      dead: false,
      skills: { ...master.skills, engineering: 30 },
      roles: [
        {
          source: "economy",
          kind: APPRENTICE_ROLE_KIND,
          entityType: "burg",
          entityId: 1,
          domain: "metallurgy",
          organizationId: 1,
          label: "Guild Apprentice"
        }
      ]
    };
    worldContext.pack.characters = [master, apprentice];
    setIndividualSkills([
      {
        characterId: master.i,
        domain: "blacksmithing",
        proficiency: 90,
        aptitude: "gifted",
        techniques: ["heatTreatment"]
      },
      {
        characterId: apprentice.i,
        domain: "blacksmithing",
        proficiency: 30,
        aptitude: "ordinary",
        techniques: []
      }
    ]);
    setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.8, treasury: 0 }]);

    GuildSuccession.settleAnnual();

    expect(isMaster(apprentice)).toBe(true);
    expect(master.roles?.every(role => role.endYear !== undefined)).toBe(true);
    expect(getIndividualSkill(apprentice.i)?.techniques).toEqual([]);
    expect(getIndividualSkill(apprentice.i)?.reconstructionLeads).toEqual([
      expect.objectContaining({ technique: "heatTreatment", progress: expect.any(Number) })
    ]);
    // A guild stock represents shared institutional practice, so loss of one personal recipe does not erase it.
    expect(getGuildKnowledgeStocks().find(entry => entry.burgId === 1)?.stock).toBe(0.8);
  });

  it("penalizes the guild's stock when a masterless master dies, and backfills a new master", () => {
    const master: Character = {
      i: 1,
      name: "Master",
      age: 70,
      gender: "male",
      culture: 0,
      titles: [],
      affinities: {},
      marriages: [],
      state: 1,
      dead: true,
      skills: {
        artistry: 1,
        diplomacy: 1,
        engineering: 80,
        geography: 1,
        intrigue: 1,
        learning: 1,
        martial: 1,
        prowess: 1,
        stewardship: 1
      },
      personality: {
        boldness: 1,
        compassion: 1,
        greed: 1,
        honor: 1,
        rationality: 1,
        sociability: 1,
        vengefulness: 1,
        zeal: 1,
        energy: 1,
        piety: 1,
        guile: 1,
        confidence: 1
      },
      family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
      appearance: 50,
      prestige: 50,
      pastTitles: [],
      location: 1,
      roles: [
        {
          source: "economy",
          kind: MASTER_ROLE_KIND,
          entityType: "burg",
          entityId: 1,
          domain: "metallurgy",
          label: "Guild Master"
        }
      ]
    };
    worldContext.pack.characters = [master];
    setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.8, treasury: 0 }]);

    GuildSuccession.settleAnnual();

    expect(getGuildBonus(1, "metallurgy")).toBeLessThan(1 + 0.25 * 0.8);
    const newMaster = worldContext.pack.characters.find(c => isMaster(c) && c.i !== master.i);
    expect(newMaster).toBeDefined();
  });

  it("is a no-op the second time it is called within the same simulation year", () => {
    setGuildKnowledgeStocks([{ burgId: 1, domain: "metallurgy", stock: 0.5, treasury: 0 }]);
    GuildSuccession.settleAnnual();
    const countAfterFirstCall = worldContext.pack.characters.length;

    GuildSuccession.settleAnnual();

    expect(worldContext.pack.characters).toHaveLength(countAfterFirstCall);
  });
});
