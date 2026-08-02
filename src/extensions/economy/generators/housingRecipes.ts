import type { CultureType } from "../../hostTypes";
import { DEFAULT_CULTURE_TYPE } from "../../hostTypes";

/**
 * Culture + terrain housing material mix (docs/plan/urban-housing-system.md K17/K20).
 * Pure functions — no economyContext / goods imports so callers control brick availability.
 */

export interface HousingRecipe {
  wood: number;
  stone: number;
  brick: number;
}

/** High Fantasy post-pass: max wood→stone transfer when quarry exists (K20). */
export const HIGH_FANTASY_MASON_SHARE_BONUS = 0.2;
/** Cap on mason-side share (stone + brick) after High Fantasy post-pass. */
export const MAX_MASON_SHARE = 0.8;

/** Preference shares before terrain/availability gates. Rows sum to 1. */
export const BASE_HOUSING_RECIPE_BY_CULTURE: Record<CultureType, HousingRecipe> = {
  Highland: { wood: 0.25, stone: 0.6, brick: 0.15 },
  River: { wood: 0.3, stone: 0.2, brick: 0.5 },
  Lake: { wood: 0.3, stone: 0.2, brick: 0.5 },
  Naval: { wood: 0.55, stone: 0.25, brick: 0.2 },
  Hunting: { wood: 0.7, stone: 0.15, brick: 0.15 },
  Nomadic: { wood: 0.8, stone: 0.05, brick: 0.15 },
  Generic: { wood: 0.45, stone: 0.35, brick: 0.2 }
};

export function normalize3(wood: number, stone: number, brick: number): HousingRecipe {
  const sum = wood + stone + brick;
  if (sum <= 0) return { wood: 1, stone: 0, brick: 0 };
  return { wood: wood / sum, stone: stone / sum, brick: brick / sum };
}

/**
 * Move `mass` onto enabled channels proportional to their current shares; disabled stay 0.
 * Normative helper from urban-housing-system.md (proportional, not wood-only dump).
 */
export function redistributeToEnabled(
  mass: number,
  shares: HousingRecipe,
  enabled: { wood: boolean; stone: boolean; brick: boolean }
): HousingRecipe {
  const w = enabled.wood ? shares.wood : 0;
  const s = enabled.stone ? shares.stone : 0;
  const b = enabled.brick ? shares.brick : 0;
  const sum = w + s + b;
  if (mass <= 0) return shares;
  if (sum <= 0) {
    if (enabled.wood) return { ...shares, wood: shares.wood + mass };
    if (enabled.brick) return { ...shares, brick: shares.brick + mass };
    if (enabled.stone) return { ...shares, stone: shares.stone + mass };
    return shares;
  }
  return {
    wood: shares.wood + (enabled.wood ? (mass * w) / sum : 0),
    stone: shares.stone + (enabled.stone ? (mass * s) / sum : 0),
    brick: shares.brick + (enabled.brick ? (mass * b) / sum : 0)
  };
}

function resolveCultureType(cultureType: CultureType | string | undefined): CultureType {
  if (cultureType && cultureType in BASE_HOUSING_RECIPE_BY_CULTURE) {
    return cultureType as CultureType;
  }
  return DEFAULT_CULTURE_TYPE;
}

/**
 * Housing material recipe after terrain gates, brick availability, and High Fantasy post-pass.
 */
export function getHousingRecipe(args: {
  cultureType: CultureType | string | undefined;
  hasQuarryAccess: boolean;
  highFantasy: boolean;
  brickAvailable: boolean;
}): HousingRecipe {
  let { wood, stone, brick } = BASE_HOUSING_RECIPE_BY_CULTURE[resolveCultureType(args.cultureType)];

  if (!args.hasQuarryAccess) {
    const free = stone;
    stone = 0;
    ({ wood, stone, brick } = redistributeToEnabled(
      free,
      { wood, stone, brick },
      { wood: true, stone: false, brick: args.brickAvailable }
    ));
  }
  if (!args.brickAvailable) {
    const free = brick;
    brick = 0;
    ({ wood, stone, brick } = redistributeToEnabled(
      free,
      { wood, stone, brick },
      { wood: true, stone: args.hasQuarryAccess, brick: false }
    ));
  }
  ({ wood, stone, brick } = normalize3(wood, stone, brick));

  if (args.highFantasy && args.hasQuarryAccess && stone + brick > 0) {
    // Move min(wood, 0.2) from wood → stone; brick unchanged; clamp mason ≤ 0.8 (K20).
    const move = Math.min(wood, HIGH_FANTASY_MASON_SHARE_BONUS);
    wood -= move;
    stone += move;
    const mason = stone + brick;
    if (mason > MAX_MASON_SHARE) {
      const excess = mason - MAX_MASON_SHARE;
      const cutStone = Math.min(stone, excess);
      stone -= cutStone;
      wood += cutStone;
      const still = stone + brick - MAX_MASON_SHARE;
      if (still > 0) {
        brick -= still;
        wood += still;
      }
    }
    ({ wood, stone, brick } = normalize3(wood, stone, brick));
  }

  return { wood, stone, brick };
}

/** Mason-side material share (stone + brick) after gates — drives mason/carpenter headcount split. */
export function getMasonMaterialShare(recipe: HousingRecipe): number {
  return Math.max(0, Math.min(1, recipe.stone + recipe.brick));
}
