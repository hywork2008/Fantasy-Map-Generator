import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { bridgeGeometry } from "../geometry/network";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater, vectorWaterSurfaces } from "../geometry/water";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

const frame = { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 };
function input(coast: "straight" | "cape", rivers: ("through" | "meander")[], seed: string) {
  const settings = { ...defaultGenerationSettings(), population: defaultPopulationSettings(5000) };
  settings.config = { ...settings.config, coast, rivers };
  return { settings, doc: vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }) };
}

describe("synthesized coast and river sites (feature parity P5a)", () => {
  it("bridges a synthesized river squarely and keeps every road off the water", () => {
    const { doc } = input("straight", ["meander"], "w2"),
      waters = vectorWaterSurfaces(doc),
      bridges = Object.values(doc.connections.bridges);
    expect(bridges.length).toBeGreaterThan(0);
    for (const b of bridges) expect(() => bridgeGeometry(doc, b, waters)).not.toThrow();
    const decks = bridges.map(b => ({ outer: bridgeGeometry(doc, b, waters).deck, holes: [] })),
      water = allVectorWater(doc);
    for (const road of Object.values(doc.paths).filter(p => p.role === "road")) {
      const wet = regionBoolean(regionBoolean([pathSurface(road)], decks, "difference"), water, "intersection");
      expect(
        wet.reduce((n, r) => n + regionArea(r), 0),
        road.id
      ).toBeLessThan(1e-3);
    }
  });

  it("grows a synthesized coastal site until its dry land houses the town", () => {
    const seed = "w1",
      { settings, doc } = input("cape", ["through"], seed),
      wall = vectorWallChoice(settings, seed, "lateMedieval"),
      skeleton = generateVectorSkeleton(doc, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document,
      city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 5000, lotOccupancy: 1 });
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });
});
