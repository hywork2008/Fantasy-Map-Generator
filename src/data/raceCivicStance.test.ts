import { describe, expect, it } from "vitest";
import {
  canAppearInMixedCourt,
  defaultMonoRacialForRaceKey,
  isDiplomaticCoreRaceKey,
  isEnemyColonyRaceKey,
  mixedPolityChanceForRaceKey,
  raceCivicStance
} from "./raceCivicStance";

describe("raceCivicStance", () => {
  it("classifies diplomatic core, distant, and enemy colony races", () => {
    expect(raceCivicStance("human")).toBe("diplomatic");
    expect(raceCivicStance("elf")).toBe("diplomatic");
    expect(raceCivicStance("dwarf")).toBe("diplomatic");
    expect(raceCivicStance("dark_elf")).toBe("distant");
    expect(raceCivicStance("giant")).toBe("distant");
    expect(raceCivicStance("draconic")).toBe("distant");
    expect(raceCivicStance("amazones")).toBe("distant");
    expect(raceCivicStance("goblin")).toBe("enemy_colony");
    expect(raceCivicStance("orc")).toBe("enemy_colony");
    expect(raceCivicStance("arachnid")).toBe("enemy_colony");
  });

  it("allows mixed courts only for human/elf/dwarf", () => {
    expect(canAppearInMixedCourt("human")).toBe(true);
    expect(canAppearInMixedCourt("elf")).toBe(true);
    expect(canAppearInMixedCourt("dwarf")).toBe(true);
    expect(canAppearInMixedCourt("orc")).toBe(false);
    expect(canAppearInMixedCourt("dark_elf")).toBe(false);
    expect(canAppearInMixedCourt("amazones")).toBe(false);
  });

  it("gives only diplomatic-core races a nonzero mixed-polity chance", () => {
    expect(mixedPolityChanceForRaceKey("human")).toBeGreaterThan(0);
    expect(mixedPolityChanceForRaceKey("elf")).toBeGreaterThan(0);
    expect(mixedPolityChanceForRaceKey("orc")).toBe(0);
    expect(mixedPolityChanceForRaceKey("draconic")).toBe(0);
  });

  it("defaults enemy and distant races to always mono", () => {
    expect(defaultMonoRacialForRaceKey("orc", () => 0)).toBe(true);
    expect(defaultMonoRacialForRaceKey("goblin", () => 0)).toBe(true);
    expect(defaultMonoRacialForRaceKey("dark_elf", () => 0)).toBe(true);
    expect(defaultMonoRacialForRaceKey("amazones", () => 0.99)).toBe(true);
  });

  it("can roll rare mixed for humans when random is low", () => {
    expect(defaultMonoRacialForRaceKey("human", () => 0)).toBe(false); // roll < 0.18 → mixed
    expect(defaultMonoRacialForRaceKey("human", () => 0.5)).toBe(true);
  });

  it("marks orc as enemy colony like goblin", () => {
    expect(isEnemyColonyRaceKey("orc")).toBe(true);
    expect(isDiplomaticCoreRaceKey("orc")).toBe(false);
  });
});
