import { beforeAll, describe, expect, it, vi } from "vitest";
import { bindRaceService } from "../extensions/hostRaces";
import { raceService } from "../services/raceService";

const fixture = await vi.hoisted(async () => {
  vi.resetModules();
  const { default: csv } = await import("../../docs/plan/data/races.csv?raw");
  const { parseCsvRecords, parseRacesCsv } = await import("../../scripts/races/racesCsv");
  const { splitRaceCatalog } = await import("../../scripts/races/catalogArtifacts");
  const rows = parseCsvRecords(csv);
  const edit = (key: string, column: string, value: string) => {
    rows.find(row => row[1] === key)![rows[0].indexOf(column)] = value;
  };
  edit("human", "arcane_cap", "12");
  edit("human", "infernal_atavism_chance", "0.02");
  edit("human", "infernal_atavism_blue_blood_chance", "0.8");
  edit("human", "infernal_atavism_arcane_cap", "80");
  edit("elf", "skill_bias_martial", "-15");
  edit("elf", "personality_bias_boldness", "-20");
  edit("elf", "bound_servitor_chance", "0.2");
  edit("elf", "person_name_primary", "8");
  edit("human", "mixed_polity_chance", "0.3");
  edit("giant", "water_construction_speed_multiplier", "2");
  edit("giant", "hoard_sp_per_adult_year", "0.4");
  return splitRaceCatalog(parseRacesCsv(rows.map(row => row.join(",")).join("\n")));
});
vi.mock("./races.generated.json", () => ({ default: fixture.core }));
vi.mock("../extensions/characters/data/races.generated.json", () => ({ default: fixture.characters }));
vi.mock("../extensions/economy/data/races.generated.json", () => ({ default: fixture.economy }));

import { infernalAtavismSupernaturalForRaceKey, maybeHumanInfernalAtavism } from "../extensions/characters/arcane";
import { boundServitorSpecForHost } from "../extensions/characters/raceBoundServitors";
import { racePersonalityBiasForKey } from "../extensions/characters/racePersonalityBias";
import { raceSkillBiasForKey } from "../extensions/characters/raceSkillBias";
import { skillMeanFor } from "../extensions/characters/skillGeneration";
import { waterTechRaceBiasFor } from "../extensions/economy/generators/raceWaterTechBias";
import { RACE_HOARD_SP_PER_ADULT_YEAR } from "../extensions/economy/generators/raceWealthBias";
import { mixedPolityChanceForRaceKey } from "./raceCivicStance";
import { DEFAULT_RACE_PERSON_NAME_SPHERES } from "./racePersonNameConfig";
import { supernaturalForRaceKey } from "./raceSupernatural";
import { applyCatalogRaceDefaults, createDefaultRaces } from "./races";

describe("CSV parameters reach game consumers", () => {
  beforeAll(() => bindRaceService(raceService));
  it("uses edited supernatural and atavism profiles", () => {
    expect(supernaturalForRaceKey("human").arcaneCap).toBe(12);
    expect(infernalAtavismSupernaturalForRaceKey("human")?.arcaneCap).toBe(80);
    const roll = vi.fn(() => true);
    expect(maybeHumanInfernalAtavism("human", true, roll)).toBe("blueBlood");
    expect(roll.mock.calls).toEqual([[0.02], [0.8]]);
    const human = createDefaultRaces()[1];
    expect(human.supernatural?.arcaneCap).toBe(12);
    human.supernatural!.arcaneCap = 1;
    applyCatalogRaceDefaults(human);
    expect(human.supernatural?.arcaneCap).toBe(12);
  });
  it("uses parent CSV values for hybrid skill and personality calculations", () => {
    expect(raceSkillBiasForKey("half_elf").martial).toBe(-15);
    expect(racePersonalityBiasForKey("half_elf").boldness).toBe(-20);
    expect(skillMeanFor("martial", { raceKey: "half_elf" }).mean).toBe(35);
  });
  it("uses edited civic, servitor, naming and economy values", () => {
    expect(mixedPolityChanceForRaceKey("human")).toBe(0.3);
    expect(boundServitorSpecForHost("elf")?.chance).toBe(0.2);
    expect(DEFAULT_RACE_PERSON_NAME_SPHERES.elf.primary).toBe(8);
    expect(waterTechRaceBiasFor("giant", "highFantasy")?.constructionSpeedMultiplier).toBe(2);
    expect(RACE_HOARD_SP_PER_ADULT_YEAR.giant).toBe(0.4);
  });
});
