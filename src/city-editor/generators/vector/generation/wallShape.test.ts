import { describe, expect, it } from "vitest";
import { vectorStructures } from "../../../renderers/vector/structureMassing";
import { defaultGenerationSettings } from "../../generation/settings";
import { pointInPolygon, polygonArea, polygonCentroid } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { cellHouseRing } from "../fabric/pack";
import { pathIsClosed } from "../geometry/curves";
import { regionArea } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { BASTION_REGION_PREFIX } from "./bastions";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import {
  VECTOR_WALL_SHAPES,
  VECTOR_WALL_WIDTH_METERS,
  vectorUnitWallRing,
  vectorWallAreaShare,
  vectorWallChoice
} from "./wallShape";

const frame = { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 };
const settingsFor = (extra: Partial<ReturnType<typeof defaultGenerationSettings>>) => ({
  ...defaultGenerationSettings(),
  population: defaultPopulationSettings(3000),
  historicalPeriod: "ageOfExploration" as const,
  buildingPattern: "medieval" as const,
  ...extra
});

describe("meshless wall shapes from the mesh editor's settings (feature parity P4a)", () => {
  it("resolves the shape, sides and material as the mesh editor does", () => {
    const base = settingsFor({});
    expect(vectorWallChoice({ ...base, wallShape: "polygon", wallSides: 7 }, "s", "lateMedieval")).toEqual({
      wall: "polygon",
      wallSides: 7,
      wallMaterial: "stone"
    });
    const small = settingsFor({ population: defaultPopulationSettings(800) });
    expect(vectorWallChoice({ ...small, wallShape: "round" }, "s", "lateMedieval").wallMaterial).toBe("wood");
    const off = settingsFor({});
    off.config.features.walls = false;
    expect(vectorWallChoice(off, "s", "lateMedieval")).toEqual({ wall: "none" });
    // `auto` never draws a bastioned outline before the age of exploration.
    for (let i = 0; i < 40; i++)
      expect(vectorWallChoice({ ...base, wallShape: "auto" }, `seed-${i}`, "highMedieval").wall).not.toBe("bastioned");
  });

  it("draws every shape as a closed wall that houses the population, with gates on every crossing road", () => {
    for (const shape of VECTOR_WALL_SHAPES) {
      const seed = `p4a-${shape}`,
        settings = settingsFor({ wallShape: shape, wallSides: 6 }),
        input = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }),
        wall = vectorWallChoice(settings, seed, "ageOfExploration"),
        skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document,
        path = skeleton.paths["auto-wall"];
      expect(path.source.kind, shape).toBe("curve");
      expect(pathIsClosed(path)).toBe(true);
      expect(path.width.leftMeters + path.width.rightMeters).toBeCloseTo(VECTOR_WALL_WIDTH_METERS.stone);
      const ring = samplePath(path).map(s => s.point),
        walled = regionArea({ outer: ring, holes: [] }),
        site = input.site!.domain.reduce((n, p) => n + regionArea(p), 0);
      // The site grows around a narrow shape, so the walled area stays near the round site's.
      expect(walled / site, shape).toBeGreaterThan(0.55);
      expect(Object.values(skeleton.connections.gates).filter(g => g.kind === "passage").length).toBeGreaterThan(0);
      const city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 3000, lotOccupancy: 1 });
      expect(city.urban!.report.unplacedPopulation, shape).toBe(0);
    }
  });

  it("builds a wooden wall thinner and lower than a stone one", () => {
    const settings = settingsFor({ wallShape: "round", population: defaultPopulationSettings(800) }),
      seed = "p4a-wood",
      input = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }),
      wall = vectorWallChoice(settings, seed, "ageOfExploration"),
      doc = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document;
    expect(doc.paths["auto-wall"].width.leftMeters * 2).toBeCloseTo(VECTOR_WALL_WIDTH_METERS.wood);
    const parts = vectorStructures(doc).find(s => s.owner === "auto-wall")!.parts;
    expect(parts.length).toBeGreaterThan(0);
    expect(parts.every(part => part.material === "wood")).toBe(true);
  });

  it("keeps houses off the bastions, the gun platforms, and walls more land to make up for them", () => {
    expect(vectorWallAreaShare("s", "bastioned", 6)).toBeLessThan(
      Math.abs(polygonArea(vectorUnitWallRing("s", "bastioned", 6))) / Math.PI - 0.05
    );
    const seed = "p4a-bastioned",
      settings = settingsFor({ wallShape: "bastioned", wallSides: 6 }),
      input = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }),
      wall = vectorWallChoice(settings, seed, "ageOfExploration"),
      skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document,
      bastions = Object.values(skeleton.regions).filter(r => r.id.startsWith(BASTION_REGION_PREFIX));
    expect(bastions.length).toBeGreaterThan(0);
    expect(bastions.every(r => r.kind === "reservation")).toBe(true);
    const city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 3000, lotOccupancy: 1 });
    for (const cell of Object.values(city.fabric?.cells ?? {}))
      for (let i = 0; i < cell.houses.offsets.length; i++) {
        const centre = polygonCentroid(cellHouseRing(cell, i));
        expect(bastions.some(b => pointInPolygon(centre, b.outer))).toBe(false);
      }
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });
});
