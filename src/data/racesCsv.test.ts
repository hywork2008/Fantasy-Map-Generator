import { describe, expect, it } from "vitest";
import source from "../../docs/plan/data/races.csv?raw";
import { applyCatalogRaceDefaults, createDefaultRaces, RACE_DEFINITIONS } from "./races";
import { exportRacesCsv, parseRacesCsv, RACE_CSV_HEADERS } from "./racesCsv";

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
    expect(parseRacesCsv(source)).toEqual(RACE_DEFINITIONS);
    expect(parseRacesCsv(exportRacesCsv(RACE_DEFINITIONS))).toEqual(RACE_DEFINITIONS);
  });
  it("accepts BOM, CRLF, reordered rows/columns and quoted text", () => {
    const defs = structuredClone(RACE_DEFINITIONS);
    defs[1].name = 'Human, "folk"\n人間';
    const csv = exportRacesCsv(defs);
    expect(parseRacesCsv(`\uFEFF${csv.replaceAll("\n", "\r\n")}`)[1].name).toBe('Human, "folk"\r\n人間');
    const rows = source
      .trimEnd()
      .split("\n")
      .map(row => row.split(",").reverse().join(","));
    expect(parseRacesCsv([rows[0], ...rows.slice(1).reverse()].join("\n"))).toEqual(RACE_DEFINITIONS);
  });
  it("derives hybrid traits from edited parents", () => {
    const defs = parseRacesCsv(change("human", "looks_stature", "60"));
    expect(defs[14].looksBaseline.stature).toBe(55);
    expect(defs[14].looksRange?.stature).toEqual({ min: 55, max: 60 });
  });
  it("allows appended species and keeps existing ids", () => {
    const defs = [...RACE_DEFINITIONS, { ...RACE_DEFINITIONS[1], key: "new_folk", name: "New Folk" }];
    expect(parseRacesCsv(exportRacesCsv(defs))[15].key).toBe("new_folk");
  });
  it.each([
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
    ["giant", "population_capacity_multiplier", ""],
    ["demon", "horn_animals", "cat"],
    ["beastfolk", "furry_scale_min", "11"],
    ["half_elf", "hybrid_parent_a", "missing"],
    ["half_elf", "hybrid_parent_a", "half_elf"],
    ["half_elf", "looks_stature", "50"]
  ])("rejects invalid %s.%s=%s with record context", (key, column, value) => {
    expect(() => parseRacesCsv(change(key, column, value))).toThrow(/CSV record/);
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
