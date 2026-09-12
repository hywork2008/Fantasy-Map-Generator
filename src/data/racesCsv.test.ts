import { describe, expect, it } from "vitest";
import source from "../../docs/plan/data/races.csv?raw";
import { joinRaceCatalog } from "../../scripts/races/catalogArtifacts";
import { exportRacesCsv, parseRacesCsv, RACE_CSV_HEADERS } from "../../scripts/races/racesCsv";
import characters from "../extensions/characters/data/races.generated.json";
import type { CharacterRaceParameters } from "../extensions/characters/data/raceTypes";
import economy from "../extensions/economy/data/races.generated.json";
import { applyCatalogRaceDefaults, createDefaultRaces, RACE_DEFINITIONS } from "./races";

const fullCatalog = joinRaceCatalog([...RACE_DEFINITIONS], characters as CharacterRaceParameters[], economy);

function change(key: string, column: string, value: string, csv = source) {
  const rows = csv
    .trimEnd()
    .split("\n")
    .map(row => row.split(","));
  rows.find(row => row[1] === key)![RACE_CSV_HEADERS.indexOf(column)] = value;
  return `${rows.map(row => row.join(",")).join("\n")}\n`;
}

describe("race CSV", () => {
  it("keeps the shipped generated catalog synchronized with the canonical CSV", () => {
    expect(parseRacesCsv(source)).toEqual(fullCatalog);
    expect(parseRacesCsv(exportRacesCsv(fullCatalog))).toEqual(fullCatalog);
  });
  it("accepts BOM, CRLF, reordered rows/columns and quoted text", () => {
    const defs = structuredClone(fullCatalog);
    defs[1].name = 'Human, "folk"\n人間';
    const csv = exportRacesCsv(defs);
    expect(parseRacesCsv(`\uFEFF${csv.replaceAll("\n", "\r\n")}`)[1].name).toBe('Human, "folk"\r\n人間');
    const rows = source
      .trimEnd()
      .split("\n")
      .map(row => row.split(",").reverse().join(","));
    expect(parseRacesCsv([rows[0], ...rows.slice(1).reverse()].join("\n"))).toEqual(fullCatalog);
  });
  it("derives hybrid traits from edited parents", () => {
    const defs = parseRacesCsv(change("human", "looks_stature", "60"));
    expect(defs[14].looksBaseline.stature).toBe(55);
    expect(defs[14].looksRange?.stature).toEqual({ min: 55, max: 60 });
  });
  it("allows appended species and keeps existing ids", () => {
    const defs = [...fullCatalog, { ...fullCatalog[1], key: "new_folk", name: "New Folk" }];
    expect(parseRacesCsv(exportRacesCsv(defs))[15].key).toBe("new_folk");
  });
  it.each([
    ["human", "arcane_cap", "101"],
    ["human", "arcane_median", "11"],
    ["human", "arcane_inclination", "1.1"],
    ["human", "durability", "0"],
    ["human", "infernal_atavism_chance", "-1"],
    ["human", "infernal_atavism_arcane_cap", ""],
    ["human", "infernal_atavism_blue_blood_chance", "2"],
    ["elf", "bound_servitor_key", "missing"],
    ["elf", "bound_servitor_key", "human"],
    ["elf", "bound_servitor_roles", "ordinary|ordinary"],
    ["elf", "bound_servitor_chance", ""],
    ["human", "civic_stance", "oops"],
    ["giant", "mixed_polity_chance", "0.1"],
    ["giant", "water_construction_speed_multiplier", "0"],
    ["elf", "person_name_primary", "1.5"],
    ["elf", "skill_bias_martial", "-101"],
    ["elf", "personality_bias_energy", "101"],
    ["half_elf", "arcane_cap", "90"],
    ["half_elf", "skill_bias_martial", "0"],
    ["dwarf", "continuous_monogamy", "yes"],
    ["beastfolk", "carnivorous_animals", "dragon"],
    ["human", "lifespan_years", "NaN"],
    ["human", "lifespan_years", ""],
    ["human", "max_lifespan_years", "10"],
    ["human", "looks_stature", "101"],
    ["human", "interbirth_years", "0"],
    ["human", "litter_max", "1.5"],
    ["human", "litter_mean", "4"],
    ["human", "fertility_end_years", "1"],
    ["human", "id", "0"],
    ["human", "key", "renamed"],
    ["human", "character_gender", "oops"],
    ["giant", "food_independent", "yes"],
    ["demon", "horn_animals", "cat"],
    ["beastfolk", "furry_scale_min", "11"],
    ["half_elf", "hybrid_parent_a", "missing"],
    ["half_elf", "hybrid_parent_a", "half_elf"],
    ["half_elf", "looks_stature", "50"]
  ])("rejects invalid %s.%s=%s with record context", (key, column, value) => {
    expect(() => parseRacesCsv(change(key, column, value))).toThrow(/CSV record/);
  });
  it("defaults omitted environmental survival settings to neutral values", () => {
    const csv = change("demon", "temperature_independent", "", change("demon", "population_capacity_multiplier", ""));
    expect(parseRacesCsv(csv).find(def => def.key === "demon")?.environmentalSurvival).toEqual({
      foodIndependent: true,
      temperatureIndependent: false,
      populationCapacityMultiplier: 1
    });
  });
  it("defaults omitted water technology effects to neutral values", () => {
    const defs = parseRacesCsv(change("giant", "water_administration_bonus", ""));
    expect(defs.find(def => def.key === "giant")?.waterTechBias).toMatchObject({
      administrationBonusBonus: 0
    });
  });
  it("rejects malformed CSV and unknown headers", () => {
    expect(() => parseRacesCsv(source.replace("lifespan_years", "typo"))).toThrow(/header/);
    expect(() => parseRacesCsv(`${source}"unfinished`)).toThrow(/unclosed quote/);
    expect(() => parseRacesCsv(source.replace("Human", 'Hu"man'))).toThrow(/invalid quote/);
  });
  it("isolates maps from the catalog and refreshes saved balance values", () => {
    const races = createDefaultRaces();
    races[1].fertility!.interbirthYears = 999;
    expect(RACE_DEFINITIONS[1].fertility.interbirthYears).toBe(3.5);
    applyCatalogRaceDefaults(races[1]);
    expect(races[1].fertility).toEqual(RACE_DEFINITIONS[1].fertility);
  });
});
