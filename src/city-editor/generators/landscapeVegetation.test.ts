import { expect, it } from "vitest";
import { models } from "../../buildings/medieval/43-landscape-treesModels";
import { STANDARD_BIOME_DEFINITIONS } from "../../data/biomeCatalog";
import { STANDARD_BIOME_KEYS } from "../../types/biome";
import { landscapeTreeSpecies } from "../renderers/landscapeTreeSpecies";
import { createDocument } from "./document";
import { landscapeHasTrees, TREE_BIOME_POLICY } from "./landscapeVegetation";

const expected = {
  marine: ["none"],
  hotDesert: ["date_palm"],
  coldDesert: ["saxaul"],
  savanna: ["date_palm", "umbrella_thorn"],
  grassland: ["garden_parkland"],
  tropicalSeasonalForest: ["date_palm", "umbrella_thorn"],
  temperateDeciduousForest: ["garden_parkland"],
  tropicalRainforest: ["kapok"],
  temperateRainforest: ["western_red_cedar"],
  taiga: ["norway_spruce", "silver_birch"],
  tundra: ["none"],
  glacier: ["none"],
  wetland: ["black_alder"],
  centralEuropeanGreatForest: ["garden_parkland"],
  mediterraneanWoodlandScrub: ["olive"],
  temperateConiferousForest: ["western_red_cedar"],
  montaneForest: ["silver_fir"],
  alpineTundra: ["rowan"],
  mangrove: ["red_mangrove"],
  xericShrubland: ["date_palm", "tamarisk"],
  cloudForest: ["kapok"],
  heathMoorland: ["rowan"],
  floodedForest: ["black_alder"],
  coldSteppe: ["saxaul"],
  tropicalDryForest: ["date_palm", "umbrella_thorn"],
  borealPeatland: ["norway_spruce", "silver_birch"],
  volcanicBarrens: ["canary_pine"],
  lavaField: ["none"],
  volcanicSoil: ["canary_pine"]
};

it("covers every catalog biome explicitly, including treeless biomes", () => {
  const keys = [...STANDARD_BIOME_KEYS].sort();
  expect(Object.keys(TREE_BIOME_POLICY).sort()).toEqual(keys);
  expect(STANDARD_BIOME_DEFINITIONS.map(b => b.key).sort()).toEqual(keys);
  expect(Object.keys(expected).sort()).toEqual(keys);
});

it.each(STANDARD_BIOME_DEFINITIONS)("resolves the complete $key tree set deterministically", biome => {
  const city = createDocument("flora-matrix-v1", 100);
  city.biome = { id: 1, key: biome.key, name: biome.label, color: biome.color, tags: [...biome.tags] };
  const before = JSON.stringify(city);
  const species = Array.from({ length: 64 }, (_, i) => landscapeTreeSpecies("garden_parkland", city, [i * 17, i * 23]));
  expect([...new Set(species.map(value => value ?? "none"))].sort()).toEqual(
    [...expected[biome.key as keyof typeof expected]].sort()
  );
  expect(landscapeHasTrees(city)).toBe(!expected[biome.key as keyof typeof expected].includes("none"));
  expect(JSON.stringify(city)).toBe(before);
});

it("keeps exact identity ahead of tags and uses tags before descriptor climate", () => {
  const city = createDocument("custom-flora", 100);
  Object.assign(city, {
    fabric: { generation: { settings: { descriptor: { climate: { biomeKey: "taiga", temperatureC: -5 } } } } }
  });
  city.biome = { id: 1, key: "hotDesert", name: "Renamed", color: "red", tags: ["marine"] };
  expect(landscapeTreeSpecies("sacred_yew", city, [0, 0])).toBe("date_palm");
  city.biome = { ...city.biome, key: "custom:coast", tags: ["forest", "marine"] };
  expect(landscapeTreeSpecies("sacred_yew", city, [0, 0])).toBeUndefined();
  city.biome = { ...city.biome, key: "legacyCustom:30", tags: [] };
  expect(landscapeTreeSpecies("sacred_yew", city, [0, 0])).toBe("norway_spruce");
  delete city.fabric;
  city.biome = { ...city.biome, key: "custom:not-marine-taiga", name: "Marine tundra festival", tags: [] };
  expect(landscapeTreeSpecies("sacred_bodhi_and_fig", city, [0, 0])).toBe("sacred_bodhi_and_fig");
  city.biome = { ...city.biome, tags: ["forest", "tropical"] };
  expect(landscapeTreeSpecies("garden_parkland", city, [0, 0])).toBe("kapok");
});

it("preserves temperature boundary behavior and an unspecified preferred planting", () => {
  const city = createDocument("temperature-flora", 100);
  city.buildingAppearanceContext = { period: "medieval", forest: true, arid: false, wetland: false, temperatureC: 3 };
  city.biome = { id: 1, key: "temperateConiferousForest", name: "Conifers", color: "green" };
  expect(landscapeTreeSpecies("sacred_yew", city, [0, 0])).toBe("norway_spruce");
  city.buildingAppearanceContext.temperatureC = 3.01;
  expect(landscapeTreeSpecies("garden_parkland", city, [0, 0])).toBe("western_red_cedar");
  city.biome.key = "floodedForest";
  city.buildingAppearanceContext.temperatureC = 19.99;
  expect(landscapeTreeSpecies("garden_parkland", city, [0, 0])).toBe("black_alder");
  city.buildingAppearanceContext.temperatureC = 20;
  expect(landscapeTreeSpecies("garden_parkland", city, [0, 0])).toBe("kapok");
  delete city.biome;
  expect(landscapeTreeSpecies("peaceful_willow", city, [0, 0])).toBe("peaceful_willow");
});

it("keeps BV biome labels equal to the actual CE woodland mapping across climate branches", () => {
  const observed = new Map<string, Set<string>>();
  for (const biome of STANDARD_BIOME_DEFINITIONS)
    for (const temperatureC of [undefined, -5, 3, 3.01, 20, 30]) {
      const city = createDocument("flora-matrix-v1", 100);
      city.biome = { id: 1, key: biome.key, name: biome.label, color: biome.color, tags: [...biome.tags] };
      city.buildingAppearanceContext = { period: "medieval", forest: true, arid: false, wetland: false, temperatureC };
      for (let i = 0; i < 64; i++) {
        const species = landscapeTreeSpecies("garden_parkland", city, [i * 17, i * 23]);
        if (!species) continue;
        const id = species.replaceAll("_", "-");
        const keys = observed.get(id) ?? new Set<string>();
        keys.add(biome.key);
        observed.set(id, keys);
      }
    }
  for (const model of models)
    expect([...(model.biomes ?? [])].sort()).toEqual([...(observed.get(model.id) ?? [])].sort());
});

it("uses explicit cold tags for a custom forest or desert without a temperature", () => {
  const city = createDocument("tagged-cold", 100);
  city.biome = { id: 1, key: "custom:trees", name: "Custom", color: "grey", tags: ["forest", "cold"] };
  expect(landscapeTreeSpecies("sacred_yew", city, [0, 0])).toBe("norway_spruce");
  city.biome.tags = ["desert", "cold"];
  expect(landscapeTreeSpecies("garden_parkland", city, [0, 0])).toBe("saxaul");
});
