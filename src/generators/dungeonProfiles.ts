/**
 * High Fantasy dungeon spawn profiles.
 * Spec: docs/plan/high-fantasy-dungeons.md
 */
import type { DungeonKind } from "../types/models";

export type DungeonCultureMode = "none" | "highFantasy" | "darkFantasy";

export interface DungeonRarityBand {
  readonly rarity: number;
  readonly power: number;
  readonly bossTypes: readonly string[];
}

export interface DungeonSpawnProfile {
  readonly mode: DungeonCultureMode;
  /** Approximate land cells per dungeon slot before clamp. */
  readonly cellsPerDungeon: number;
  readonly maxActive: number;
  /** Soft kind mixture (must sum ~1). */
  readonly kindWeights: Readonly<Record<DungeonKind, number>>;
  readonly bands: readonly DungeonRarityBand[];
  /** Mean years between spontaneous spawns at half capacity (Phase 3). */
  readonly spontaneousMeanYears: number;
}

/** High Fantasy: sparse fixed sites; no r4–r5 bosses. */
export const HIGH_FANTASY_DUNGEON_PROFILE: DungeonSpawnProfile = {
  mode: "highFantasy",
  cellsPerDungeon: 1200,
  maxActive: 16,
  kindWeights: {
    wealth_lair: 0.35,
    problem_lair: 0.25,
    lost_vault: 0.25,
    empty_ruin: 0.15
  },
  bands: [
    {
      rarity: 3,
      power: 14,
      bossTypes: ["Greater Wight", "Drake", "Warlord Shade"]
    },
    {
      rarity: 2,
      power: 8,
      bossTypes: ["Dire Captain", "Troll Lord", "Cult Hierophant"]
    },
    {
      rarity: 1,
      power: 5,
      bossTypes: ["Bandit King", "Cave Horror", "Grave Warden"]
    }
  ],
  spontaneousMeanYears: 80
};

/**
 * Dark Fantasy placeholder (same structure; heavier later).
 * Not enabled until profile is wired for darkFantasy mode.
 */
export const DARK_FANTASY_DUNGEON_PROFILE: DungeonSpawnProfile = {
  mode: "darkFantasy",
  cellsPerDungeon: 900,
  maxActive: 22,
  kindWeights: {
    wealth_lair: 0.3,
    problem_lair: 0.3,
    lost_vault: 0.25,
    empty_ruin: 0.15
  },
  bands: [
    { rarity: 4, power: 28, bossTypes: ["Arch-Fiend", "Ancient Lich"] },
    { rarity: 3, power: 18, bossTypes: ["Greater Demon", "Bone Dragon"] },
    { rarity: 2, power: 10, bossTypes: ["Death Knight", "Vampire Lord"] },
    { rarity: 1, power: 6, bossTypes: ["Ghoul Pack", "Cursed Knight"] }
  ],
  spontaneousMeanYears: 50
};

export function resolveDungeonCultureMode(culturesSet: string | undefined | null): DungeonCultureMode {
  if (culturesSet === "highFantasy") return "highFantasy";
  if (culturesSet === "darkFantasy") return "darkFantasy";
  return "none";
}

/** Fantasy dungeons currently ship for High Fantasy only. */
export function getDungeonSpawnProfile(culturesSet: string | undefined | null): DungeonSpawnProfile | null {
  const mode = resolveDungeonCultureMode(culturesSet);
  if (mode === "highFantasy") return HIGH_FANTASY_DUNGEON_PROFILE;
  // Dark Fantasy: enable when product wants parity; keep null until then.
  return null;
}

export function targetDungeonCount(landCellCount: number, profile: DungeonSpawnProfile, roll01: number): number {
  if (landCellCount <= 0) return 0;
  const raw = Math.round(landCellCount / profile.cellsPerDungeon);
  // Allow zero: small maps or lucky low roll (roll01 in [0,1) scales ±40%).
  const jittered = Math.round(raw * (0.6 + roll01 * 0.8));
  return Math.max(0, Math.min(profile.maxActive, jittered));
}
