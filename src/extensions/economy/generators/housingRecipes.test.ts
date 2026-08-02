import { describe, expect, it } from "vitest";
import {
  BASE_HOUSING_RECIPE_BY_CULTURE,
  getHousingRecipe,
  getMasonMaterialShare,
  HIGH_FANTASY_MASON_SHARE_BONUS,
  MAX_MASON_SHARE,
  normalize3,
  redistributeToEnabled
} from "./housingRecipes";

describe("redistributeToEnabled", () => {
  it("splits mass proportionally across remaining enabled shares (Highland no-quarry example)", () => {
    // Highland base {0.25, 0.60, 0.15}; stone mass 0.60 → wood:brick = 0.25:0.15
    const next = redistributeToEnabled(
      0.6,
      { wood: 0.25, stone: 0, brick: 0.15 },
      { wood: true, stone: false, brick: true }
    );
    expect(next.wood).toBeCloseTo(0.625, 5);
    expect(next.stone).toBe(0);
    expect(next.brick).toBeCloseTo(0.375, 5);
  });
});

describe("getHousingRecipe", () => {
  it("is stone-heavy for Highland with quarry", () => {
    const recipe = getHousingRecipe({
      cultureType: "Highland",
      hasQuarryAccess: true,
      highFantasy: false,
      brickAvailable: true
    });
    expect(recipe.stone).toBeGreaterThan(recipe.wood);
    expect(recipe.stone).toBeCloseTo(0.6, 5);
    expect(getMasonMaterialShare(recipe)).toBeCloseTo(0.75, 5);
  });

  it("allows masons without quarry when brick is available (River)", () => {
    const recipe = getHousingRecipe({
      cultureType: "River",
      hasQuarryAccess: false,
      highFantasy: false,
      brickAvailable: true
    });
    expect(recipe.stone).toBe(0);
    expect(recipe.brick).toBeGreaterThan(0);
    expect(getMasonMaterialShare(recipe)).toBeGreaterThan(0);
    // Proportional: base 0.30/0.20/0.50 → free stone 0.20 onto wood:brick 0.3:0.5
    expect(recipe.wood).toBeCloseTo(0.375, 4);
    expect(recipe.brick).toBeCloseTo(0.625, 4);
  });

  it("is all wood without quarry and without brick", () => {
    const recipe = getHousingRecipe({
      cultureType: "River",
      hasQuarryAccess: false,
      highFantasy: false,
      brickAvailable: false
    });
    expect(recipe.wood).toBeCloseTo(1, 5);
    expect(recipe.stone).toBe(0);
    expect(recipe.brick).toBe(0);
    expect(getMasonMaterialShare(recipe)).toBe(0);
  });

  it("moves wood→stone on High Fantasy when quarry exists; brick unchanged before clamp", () => {
    const base = BASE_HOUSING_RECIPE_BY_CULTURE.Generic;
    const recipe = getHousingRecipe({
      cultureType: "Generic",
      hasQuarryAccess: true,
      highFantasy: true,
      brickAvailable: true
    });
    const move = Math.min(base.wood, HIGH_FANTASY_MASON_SHARE_BONUS);
    // After move: wood 0.25, stone 0.55, brick 0.20; mason=0.75 ≤ 0.8 → no clamp
    expect(recipe.wood).toBeCloseTo(base.wood - move, 4);
    expect(recipe.stone).toBeCloseTo(base.stone + move, 4);
    expect(recipe.brick).toBeCloseTo(base.brick, 4);
    expect(getMasonMaterialShare(recipe)).toBeLessThanOrEqual(MAX_MASON_SHARE + 1e-9);
  });

  it("does not apply High Fantasy wood→stone without quarry", () => {
    const withHf = getHousingRecipe({
      cultureType: "Generic",
      hasQuarryAccess: false,
      highFantasy: true,
      brickAvailable: false
    });
    const withoutHf = getHousingRecipe({
      cultureType: "Generic",
      hasQuarryAccess: false,
      highFantasy: false,
      brickAvailable: false
    });
    expect(withHf).toEqual(withoutHf);
    expect(withHf.wood).toBeCloseTo(1, 5);
  });

  it("falls back to Generic for unknown culture types", () => {
    const recipe = getHousingRecipe({
      cultureType: "Unknown",
      hasQuarryAccess: true,
      highFantasy: false,
      brickAvailable: true
    });
    expect(recipe).toEqual(BASE_HOUSING_RECIPE_BY_CULTURE.Generic);
  });

  it("normalize3 dumps residual to wood when all zero", () => {
    expect(normalize3(0, 0, 0)).toEqual({ wood: 1, stone: 0, brick: 0 });
  });
});
