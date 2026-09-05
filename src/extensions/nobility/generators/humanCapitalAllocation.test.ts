import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { Burg, ExtensionAPI, MilitaryRegiment, PackedGraph } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext, setRulerId } from "../nobilityContext";
import { HumanCapitalAllocation } from "./humanCapitalAllocation";

function person(i: number, overrides: Partial<Character> = {}): Character {
  return {
    i,
    name: `Person ${i}`,
    age: 30,
    gender: "male",
    culture: 1,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {
      artistry: 50,
      diplomacy: 50,
      engineering: 50,
      geography: 50,
      intrigue: 50,
      learning: 50,
      martial: 50,
      prowess: 50,
      stewardship: 50
    },
    personality: {
      boldness: 50,
      compassion: 50,
      greed: 50,
      honor: 50,
      rationality: 50,
      sociability: 50,
      vengefulness: 50,
      zeal: 50,
      energy: 50,
      piety: 50,
      guile: 50,
      confidence: 50
    },
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 0,
    wealth: 0,
    pastTitles: [],
    location: 1,
    ...overrides
  };
}

function regiment(): MilitaryRegiment {
  return {
    i: 1,
    t: 0,
    name: "Field company",
    a: 100,
    s: 0,
    cell: 1,
    x: 0,
    y: 0,
    bx: 0,
    by: 0,
    u: { infantry: 100 },
    n: 0,
    type: "melee",
    state: 1
  };
}

describe("HumanCapitalAllocation", () => {
  beforeEach(() => {
    initNobilityContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.options = { year: 500 } as never;
    worldContext.pack = {
      cultures: [
        { i: 0, name: "Neutral", base: 0, shield: "", knowledgeValue: 0.2 },
        { i: 1, name: "Merit culture", base: 0, shield: "", knowledgeValue: 0.4 }
      ],
      burgs: [{ i: 0 } as Burg, { i: 1, name: "Forge", state: 1, culture: 1, cell: 1 } as Burg],
      states: [
        { i: 0, name: "Neutrals" },
        { i: 1, name: "Realm", culture: 1, military: [regiment()] }
      ],
      characters: []
    } as unknown as PackedGraph;
  });

  afterEach(() => clearNobilityContext());

  it("moves a clearly mismatched martial apprentice into a vacant command under a capable ruler", () => {
    const ruler = person(1, {
      skills: { ...person(1).skills, stewardship: 95 },
      personality: { ...person(1).personality, rationality: 90, compassion: 85 }
    });
    ruler.titles.push({ title: "King", landed: true, entityType: "state", entityId: 1 });
    const apprentice = person(2, {
      skills: { ...person(2).skills, martial: 100, engineering: 20 },
      roles: [
        {
          source: "economy",
          kind: "guildApprentice",
          entityType: "burg",
          entityId: 1,
          domain: "metallurgy",
          organizationId: 9,
          label: "Guild Apprentice"
        }
      ]
    });
    worldContext.pack.characters = [ruler, apprentice];
    setRulerId(worldContext.pack.states[1]!, ruler.i);

    expect(HumanCapitalAllocation.settleAnnual()).toBe(1);
    expect(apprentice.roles?.[0]?.endYear).toBe(500);
    expect(apprentice.titles.some(title => title.title === "Commander" && title.entityId === 1)).toBe(true);
    expect(worldContext.pack.states[1]!.military?.[0]?.commanderId).toBe(apprentice.i);
  });

  it("keeps a mismatched apprentice who has made a strong craft commitment", () => {
    const apprentice = person(2, {
      skills: { ...person(2).skills, martial: 100, engineering: 20 },
      backstory: {
        commitment: { primary: { kind: "craft" }, intensity: 90, conflictPolicy: "primary_wins" },
        tastes: []
      } as Character["backstory"],
      roles: [
        {
          source: "economy",
          kind: "guildApprentice",
          entityType: "burg",
          entityId: 1,
          domain: "metallurgy",
          organizationId: 9,
          label: "Guild Apprentice"
        }
      ]
    });
    worldContext.pack.cultures![1]!.knowledgeValue = 0.95;
    worldContext.pack.characters = [apprentice];

    expect(HumanCapitalAllocation.settleAnnual()).toBe(0);
    expect(apprentice.roles?.[0]?.endYear).toBeUndefined();
    expect(worldContext.pack.states[1]!.military?.[0]?.commanderId).toBeUndefined();
  });

  it("replaces an uncommitted weak guild master only with an available, much stronger local candidate", () => {
    const master = person(2, {
      skills: { ...person(2).skills, engineering: 30 },
      roles: [
        {
          source: "economy",
          kind: "guildMaster",
          entityType: "burg",
          entityId: 1,
          domain: "metallurgy",
          label: "Guild Master"
        }
      ]
    });
    const candidate = person(3, {
      skills: { ...person(3).skills, engineering: 90 },
      roles: [{ source: "characters", kind: "craftsperson", entityType: "burg", entityId: 1, label: "Craftsperson" }]
    });
    worldContext.pack.cultures![1]!.knowledgeValue = 0.95;
    worldContext.pack.characters = [master, candidate];

    expect(HumanCapitalAllocation.settleAnnual()).toBe(1);
    expect(master.roles?.[0]?.endYear).toBe(500);
    expect(candidate.roles?.some(role => role.kind === "guildMaster" && role.endYear === undefined)).toBe(true);
    expect(candidate.roles?.find(role => role.kind === "craftsperson")?.endYear).toBe(500);
  });
});
