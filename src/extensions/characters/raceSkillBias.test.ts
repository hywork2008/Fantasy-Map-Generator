import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDefaultRaces } from "../../data/races";
import { worldContext } from "../hostCore";
import type { ExtensionAPI, PackedGraph } from "../hostTypes";
import { clearCharactersContext, initCharactersContext } from "./charactersContext";
import { raceUsesEpisodicPairing } from "./raceAge";
import {
  ENEMY_DEDICATED_RACE_KEYS,
  filterOfficesForEnemyRace,
  isEnemyDedicatedRaceKey,
  isEnemyDedicatedRole,
  LONG_LIVED_SKILL_STDDEV,
  raceSkillBiasForKey,
  skillStddevForRace
} from "./raceSkillBias";
import { SKILL_BASE_MEAN, SKILL_STDDEV, skillMeanFor } from "./skillGeneration";

describe("raceSkillBias", () => {
  it("gives elves lower martial and elevated learning/prowess medians", () => {
    const martial = skillMeanFor("martial", { raceKey: "elf" }).mean;
    const learning = skillMeanFor("learning", { raceKey: "elf" }).mean;
    const prowess = skillMeanFor("prowess", { raceKey: "elf" }).mean;
    expect(martial).toBeLessThan(SKILL_BASE_MEAN);
    expect(learning).toBeGreaterThanOrEqual(SKILL_BASE_MEAN + 8);
    expect(prowess).toBeGreaterThanOrEqual(SKILL_BASE_MEAN + 4);
    expect(learning).toBeGreaterThan(prowess);
  });

  it("gives draconic the highest prowess tilt and low martial / diplomacy", () => {
    const races = ["human", "elf", "orc", "draconic", "dwarf"] as const;
    const prowessMeans = races.map(k => skillMeanFor("prowess", { raceKey: k }).mean);
    const draconicP = skillMeanFor("prowess", { raceKey: "draconic" }).mean;
    expect(draconicP).toBe(Math.max(...prowessMeans));
    expect(skillMeanFor("martial", { raceKey: "draconic" }).mean).toBeLessThan(SKILL_BASE_MEAN - 8);
    expect(skillMeanFor("diplomacy", { raceKey: "draconic" }).mean).toBeLessThan(SKILL_BASE_MEAN - 5);
    expect(skillMeanFor("engineering", { raceKey: "draconic" }).mean).toBeLessThan(SKILL_BASE_MEAN - 4);
  });

  it("keeps orc martial near human while prowess is much higher", () => {
    const orcM = skillMeanFor("martial", { raceKey: "orc" }).mean;
    const humanM = skillMeanFor("martial", { raceKey: "human" }).mean;
    const orcP = skillMeanFor("prowess", { raceKey: "orc" }).mean;
    expect(Math.abs(orcM - humanM)).toBeLessThanOrEqual(1);
    expect(orcP).toBeGreaterThan(humanM + 8);
    expect(orcP).toBeGreaterThan(orcM + 8);
  });

  it("boosts dwarf engineering", () => {
    expect(skillMeanFor("engineering", { raceKey: "dwarf" }).mean).toBeGreaterThan(SKILL_BASE_MEAN + 5);
  });

  it("gives god-line giants draconic prowess, dwarf engineering, low learning, intrigue for distance", () => {
    const g = (skill: "prowess" | "engineering" | "artistry" | "martial" | "learning" | "intrigue" | "diplomacy") =>
      skillMeanFor(skill, { raceKey: "giant" }).mean;
    expect(g("prowess")).toBe(skillMeanFor("prowess", { raceKey: "draconic" }).mean);
    expect(g("engineering")).toBe(skillMeanFor("engineering", { raceKey: "dwarf" }).mean);
    expect(g("artistry")).toBeGreaterThan(SKILL_BASE_MEAN);
    expect(g("artistry")).toBeLessThan(g("engineering"));
    expect(g("martial")).toBeLessThan(SKILL_BASE_MEAN - 5);
    expect(g("learning")).toBeLessThan(SKILL_BASE_MEAN);
    expect(g("intrigue")).toBeGreaterThan(SKILL_BASE_MEAN + 2);
    expect(g("diplomacy")).toBeLessThan(SKILL_BASE_MEAN - 4);
    // Learning− is milder than goblin stupidity tilt; intrigue below dark-elf court peak
    expect(g("learning")).toBeGreaterThan(skillMeanFor("learning", { raceKey: "goblin" }).mean);
    expect(g("intrigue")).toBeLessThan(skillMeanFor("intrigue", { raceKey: "dark_elf" }).mean);
  });

  it("widens skill variance for long-lived lifespans", () => {
    expect(skillStddevForRace(75)).toBe(SKILL_STDDEV);
    expect(skillStddevForRace(750)).toBe(LONG_LIVED_SKILL_STDDEV);
    expect(LONG_LIVED_SKILL_STDDEV).toBeGreaterThan(SKILL_STDDEV);
  });

  it("marks goblin, orc, and arachnid as enemy-colony with war roles only", () => {
    expect(isEnemyDedicatedRaceKey("goblin")).toBe(true);
    expect(isEnemyDedicatedRaceKey("orc")).toBe(true);
    expect(isEnemyDedicatedRaceKey("arachnid")).toBe(true);
    expect(ENEMY_DEDICATED_RACE_KEYS.has("dark_elf")).toBe(false);
    expect(isEnemyDedicatedRole("commander")).toBe(true);
    expect(isEnemyDedicatedRole("ruler")).toBe(true);
    expect(isEnemyDedicatedRole("merchant")).toBe(false);
    expect(isEnemyDedicatedRole("central_officer", "martial")).toBe(true);
    expect(isEnemyDedicatedRole("central_officer", "stewardship")).toBe(false);
    expect(filterOfficesForEnemyRace([{ primarySkill: "martial" }, { primarySkill: "diplomacy" }])).toEqual([
      { primarySkill: "martial" }
    ]);
    // Nest predators: diplomacy crushed, ambush/intrigue elevated
    expect(skillMeanFor("diplomacy", { raceKey: "arachnid" }).mean).toBeLessThan(SKILL_BASE_MEAN - 10);
    expect(skillMeanFor("intrigue", { raceKey: "arachnid" }).mean).toBeGreaterThan(SKILL_BASE_MEAN + 5);
  });

  it("exports non-empty bias tables for fantasy races", () => {
    expect(Object.keys(raceSkillBiasForKey("elf")).length).toBeGreaterThan(0);
    expect(Object.keys(raceSkillBiasForKey("goblin")).length).toBeGreaterThan(0);
  });
});

describe("dwarf continuous monogamy", () => {
  afterEach(() => clearCharactersContext());

  beforeEach(() => {
    initCharactersContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = { races: createDefaultRaces(), cultures: [] } as unknown as PackedGraph;
  });

  it("excludes dwarves from episodic pairing despite long lifespan", () => {
    const races = createDefaultRaces();
    const dwarf = races.find(r => r.key === "dwarf")!;
    const elf = races.find(r => r.key === "elf")!;
    expect(raceUsesEpisodicPairing(elf.i)).toBe(true);
    expect(raceUsesEpisodicPairing(dwarf.i)).toBe(false);
  });
});
