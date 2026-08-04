import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultRaces, HUMAN_RACE_ID } from "../../data/races";
import { worldContext } from "../hostCore";
import type { ExtensionAPI, PackedGraph } from "../hostTypes";
import {
  APPEARANCE_SCORE_CENTER,
  attractiveness,
  isSameRace,
  ownRaceAppearanceScore,
  physiqueSimilarity,
  rollLooksForRace,
  scoreLooksAgainstIdeal
} from "./appearance";
import { clearCharactersContext, initCharactersContext } from "./charactersContext";
import type { Character } from "./characterTypes";

function char(partial: Partial<Character> & Pick<Character, "i" | "race" | "looks">): Character {
  return {
    name: "T",
    age: 30,
    gender: "female",
    culture: 1,
    appearance: 50,
    prestige: 50,
    wealth: 0,
    titles: [],
    affinities: {},
    marriages: [],
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
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0, spouseIds: [], childIds: [] },
    pastTitles: [],
    state: 1,
    ...partial
  } as Character;
}

describe("appearance / attractiveness", () => {
  afterEach(() => clearCharactersContext());

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      races: createDefaultRaces(),
      cultures: [
        { i: 0, name: "Wild", base: 0, shield: "round", race: 0 },
        { i: 1, name: "Human culture", base: 0, shield: "round", race: 1 },
        { i: 2, name: "Orc culture", base: 0, shield: "round", race: 6 }
      ]
    } as unknown as PackedGraph;
  });

  it("scores same-race high refinement higher under elf ideal than under orc ideal", () => {
    const refined = {
      stature: 55,
      build: 30,
      symmetry: 70,
      refinement: 90,
      vitality: 60,
      ornament: 40
    };
    const races = createDefaultRaces();
    const elf = races.find(r => r.key === "elf")!;
    const orc = races.find(r => r.key === "orc")!;
    const asElf = scoreLooksAgainstIdeal(refined, elf.beautyIdeal, elf.looksBaseline);
    const asOrc = scoreLooksAgainstIdeal(refined, orc.beautyIdeal, orc.looksBaseline);
    expect(asElf).toBeGreaterThan(asOrc);
  });

  it("maps race-typical looks near the Appearance center", () => {
    const races = createDefaultRaces();
    const human = races.find(r => r.key === "human")!;
    const score = scoreLooksAgainstIdeal(human.looksBaseline!, human.beautyIdeal, human.looksBaseline);
    expect(score).toBe(APPEARANCE_SCORE_CENTER);
  });

  it("treats same race as full Appearance judgment", () => {
    const a = char({
      i: 1,
      race: 1,
      looks: { stature: 50, build: 50, symmetry: 80, refinement: 70, vitality: 70, ornament: 40 }
    });
    const b = char({
      i: 2,
      race: 1,
      looks: { stature: 50, build: 50, symmetry: 80, refinement: 70, vitality: 70, ornament: 40 }
    });
    expect(isSameRace(a, b)).toBe(true);
    const r = attractiveness(a, b);
    expect(r.kind).toBe("same_race");
    expect(r.score).toBeGreaterThan(55);
  });

  it("rolls peak Appearance with a few-percent ≥70 tail and rare ≥90", () => {
    const n = 4000;
    const samples: number[] = [];
    for (let i = 0; i < n; i++) {
      // Young peak (no age decline) — generation also includes older adults with lower means.
      samples.push(rollLooksForRace(HUMAN_RACE_ID, 30, 35).appearance);
    }
    const ge70 = samples.filter(v => v >= 70).length / n;
    const ge90 = samples.filter(v => v >= 90).length / n;
    const eq100 = samples.filter(v => v === 100).length / n;
    const mean = samples.reduce((s, v) => s + v, 0) / n;

    expect(mean).toBeGreaterThan(45);
    expect(mean).toBeLessThan(55);
    // Target: several percent ≥70 (allow sampling noise on n=4k)
    expect(ge70).toBeGreaterThan(0.03);
    expect(ge70).toBeLessThan(0.15);
    // 90 is rare; 100 is legendary-grade
    expect(ge90).toBeLessThan(0.02);
    expect(eq100).toBeLessThan(0.005);

    // Exceptional phenotype still can reach the high band
    const idealLooks = {
      stature: 90,
      build: 85,
      symmetry: 95,
      refinement: 95,
      vitality: 95,
      ornament: 80
    };
    expect(ownRaceAppearanceScore(idealLooks, HUMAN_RACE_ID, createDefaultRaces())).toBeGreaterThanOrEqual(90);
  });

  it("caps cross-race attractiveness and marks alien or partial", () => {
    const human = char({
      i: 1,
      race: 1,
      looks: { stature: 50, build: 50, symmetry: 50, refinement: 50, vitality: 55, ornament: 45 }
    });
    const orc = char({
      i: 2,
      race: 6,
      looks: { stature: 65, build: 75, symmetry: 45, refinement: 30, vitality: 65, ornament: 60 }
    });
    const r = attractiveness(human, orc);
    expect(r.kind === "cross_race_alien" || r.kind === "cross_race_partial").toBe(true);
    expect(r.score).toBeLessThanOrEqual(50);
    expect(r.reaction.toLowerCase()).toMatch(/odd|strange|hard to read|sturdy|slight/);
  });

  it("raises partial cross-race score when physique is similar", () => {
    const looks = { stature: 60, build: 60, symmetry: 50, refinement: 50, vitality: 55, ornament: 50 };
    const a = char({ i: 1, race: 1, looks: { ...looks } });
    const b = char({ i: 2, race: 6, looks: { ...looks } });
    expect(physiqueSimilarity(a.looks!, b.looks!)).toBeGreaterThan(0.9);
    const r = attractiveness(a, b);
    expect(r.kind).toBe("cross_race_partial");
    expect(r.score).toBeGreaterThan(40);
  });
});
