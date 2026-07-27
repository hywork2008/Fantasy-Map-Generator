import { describe, expect, it } from "vitest";
import {
  applyRegionalForestMask,
  classifySpecialBiome,
  isAboveTreeline,
  isPerennialSnowIce,
  smoothRegionMask,
  treelineHeight
} from "./biomeAssignment";

const base = {
  moisture: 20,
  temperature: 12,
  height: 30,
  hasRiver: false,
  flux: 0,
  coastDistance: 3,
  neighborOcean: false,
  x: 100,
  y: 100
};

describe("biomeAssignment", () => {
  it("does not classify mild lowland cold as glacier", () => {
    expect(isPerennialSnowIce(-3, 30)).toBe(false);
    expect(isPerennialSnowIce(-9, 25)).toBe(true);
    expect(isPerennialSnowIce(0, 90)).toBe(true);
    expect(isPerennialSnowIce(-2, 80)).toBe(true);
  });

  it("separates alpine tundra above treeline from montane below", () => {
    const temp = 8;
    const line = treelineHeight(temp);
    expect(isAboveTreeline(temp, line + 2)).toBe(true);
    expect(isAboveTreeline(temp, line - 5)).toBe(false);

    const alpine = classifySpecialBiome(
      { ...base, temperature: temp, height: line + 5, moisture: 12 },
      { profile: "global", seed: 1 }
    );
    expect(alpine).toBe("alpineTundra");

    const montane = classifySpecialBiome(
      { ...base, temperature: temp, height: Math.max(50, line - 8), moisture: 16 },
      { profile: "mountainRealm", seed: 1 }
    );
    expect(montane).toBe("montaneForest");
  });

  it("assigns mangrove on warm wet ocean coasts", () => {
    const key = classifySpecialBiome(
      {
        ...base,
        temperature: 26,
        moisture: 30,
        height: 22,
        coastDistance: 1,
        neighborOcean: true
      },
      { profile: "tropicalRiverBasin", seed: 1 }
    );
    expect(key).toBe("mangrove");
  });

  it("assigns flooded forest on high-flux rivers", () => {
    const key = classifySpecialBiome(
      {
        ...base,
        temperature: 18,
        moisture: 26,
        hasRiver: true,
        flux: 80,
        height: 28
      },
      { profile: "global", seed: 1 }
    );
    expect(key).toBe("floodedForest");
  });

  it("can reclassify temperate deciduous into centralEuropeanGreatForest under mask", () => {
    // Find coordinates with high mask under medievalEurope threshold
    let found = false;
    for (let x = 0; x < 500; x += 20) {
      for (let y = 0; y < 500; y += 20) {
        const mask = smoothRegionMask(x, y, 42 + 3);
        if (mask >= 0.38) {
          const key = applyRegionalForestMask(
            "temperateDeciduousForest",
            {
              ...base,
              temperature: 10,
              moisture: 18,
              height: 35,
              x,
              y
            },
            { profile: "medievalEurope", seed: 42 }
          );
          expect(key).toBe("centralEuropeanGreatForest");
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  it("classifies mediterranean woodland in dry warm band when mask allows", () => {
    let hit: string | null = null;
    for (let x = 0; x < 400; x += 15) {
      for (let y = 0; y < 400; y += 15) {
        const key = classifySpecialBiome(
          {
            ...base,
            temperature: 18,
            moisture: 12,
            height: 32,
            x,
            y
          },
          { profile: "mediterranean", seed: 7 }
        );
        if (key === "mediterraneanWoodlandScrub") {
          hit = key;
          break;
        }
      }
      if (hit) break;
    }
    expect(hit).toBe("mediterraneanWoodlandScrub");
  });
});
