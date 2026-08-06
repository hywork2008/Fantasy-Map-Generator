import { describe, expect, it } from "vitest";
import {
  getDungeonSpawnProfile,
  HIGH_FANTASY_DUNGEON_PROFILE,
  resolveDungeonCultureMode,
  targetDungeonCount
} from "./dungeonProfiles";

describe("dungeonProfiles", () => {
  it("enables dungeons only for highFantasy for now", () => {
    expect(resolveDungeonCultureMode("highFantasy")).toBe("highFantasy");
    expect(resolveDungeonCultureMode("darkFantasy")).toBe("darkFantasy");
    expect(getDungeonSpawnProfile("highFantasy")).toBe(HIGH_FANTASY_DUNGEON_PROFILE);
    expect(getDungeonSpawnProfile("darkFantasy")).toBeNull();
    expect(getDungeonSpawnProfile("world")).toBeNull();
  });

  it("highFantasy has no rarity 4–5 and allows 0..max counts", () => {
    const rarities = HIGH_FANTASY_DUNGEON_PROFILE.bands.map(b => b.rarity);
    expect(rarities).not.toContain(4);
    expect(rarities).not.toContain(5);
    expect(rarities).toContain(1);
    expect(targetDungeonCount(0, HIGH_FANTASY_DUNGEON_PROFILE, 0.5)).toBe(0);
    expect(targetDungeonCount(500, HIGH_FANTASY_DUNGEON_PROFILE, 0)).toBeLessThanOrEqual(
      HIGH_FANTASY_DUNGEON_PROFILE.maxActive
    );
    expect(targetDungeonCount(50_000, HIGH_FANTASY_DUNGEON_PROFILE, 0.99)).toBe(HIGH_FANTASY_DUNGEON_PROFILE.maxActive);
  });
});
