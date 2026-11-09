import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { pathIsClosed } from "../geometry/curves";
import { regionArea, regionBoolean } from "../geometry/regions";
import { pathSurface } from "../geometry/surfaces";
import { validateVectorHarbor } from "../harbor";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { GENERATED_HARBOR_ID } from "./seaHarbor";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

const frame = { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 };

describe("generated sea harbour (feature parity P5b)", () => {
  it("raises quays, a crane quay, piers and moored ships on an unwalled bay town", () => {
    const seed = "w1",
      settings = { ...defaultGenerationSettings(), population: defaultPopulationSettings(5000) };
    settings.config = {
      ...settings.config,
      coast: "bay",
      rivers: [],
      features: { ...settings.config.features, port: true, walls: false }
    };
    const doc = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }),
      wall = vectorWallChoice(settings, seed, "ageOfExploration");
    expect(wall.port).toBe(true);
    const skeleton = generateVectorSkeleton(doc, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document,
      harbor = skeleton.environment?.harbor;
    expect(harbor?.id).toBe(GENERATED_HARBOR_ID);
    expect(validateVectorHarbor(skeleton)).toEqual([]);
    expect(harbor!.spaces.some(s => s.kind === "quay")).toBe(true);
    expect(harbor!.piers.length).toBeGreaterThan(0);
    expect(harbor!.quays.length).toBeGreaterThan(0);
    expect(harbor!.ships.some(s => s.cargo)).toBe(true);
    expect(harbor!.accesses.length).toBeGreaterThan(0);
    // The houses keep off the harbour and the whole town is housed.
    const city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 5000, lotOccupancy: 1 });
    expect(city.environment?.harbor).toEqual(harbor);
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });

  it("raises a river port with short bank piers and a barge on an inland river town (P5b-3)", () => {
    const seed = "w2",
      settings = { ...defaultGenerationSettings(), population: defaultPopulationSettings(5000) };
    settings.config = {
      ...settings.config,
      coast: "none",
      rivers: ["through"],
      features: { ...settings.config.features, port: true, walls: false }
    };
    const doc = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }),
      wall = vectorWallChoice(settings, seed, "ageOfExploration"),
      skeleton = generateVectorSkeleton(doc, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document,
      harbor = skeleton.environment?.harbor;
    expect(validateVectorHarbor(skeleton)).toEqual([]);
    expect(harbor!.piers.length).toBeGreaterThan(0);
    // A river pier reaches at most a quarter of the way across, leaving the fairway open.
    for (const pier of harbor!.piers) expect(pier.depthMeters).toBeLessThan(6);
    expect(harbor!.ships.map(s => s.type)).toEqual(["barge"]);
    const city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 5000, lotOccupancy: 1 });
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });

  it.each(["auto", "opening"] as const)("opens the sea side of a walled port town (%s) and berths inside it", coast => {
    const seed = "w2",
      settings = { ...defaultGenerationSettings(), population: defaultPopulationSettings(5000) };
    settings.config = {
      ...settings.config,
      coast: "straight",
      rivers: [],
      features: { ...settings.config.features, port: true, walls: true },
      wall: { ...settings.config.wall, coast }
    };
    const doc = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }),
      wall = vectorWallChoice(settings, seed, "lateMedieval");
    expect(wall.wallCoast).toBe(coast === "auto" ? "open" : "opening");
    const skeleton = generateVectorSkeleton(doc, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document,
      sea = skeleton.site!.water.filter(w => !w.riverPathId).flatMap(w => w.polygons),
      walls = Object.values(skeleton.paths).filter(p => p.role === "wall");
    expect(walls.length).toBe(1);
    // An open line whose ends stand at the shore and whose body keeps off the sea.
    expect(pathIsClosed(walls[0])).toBe(false);
    expect(
      regionBoolean([pathSurface(walls[0])], sea, "intersection").reduce((n, r) => n + regionArea(r), 0)
    ).toBeLessThan(1);
    expect(skeleton.environment?.harbor?.piers.length).toBeGreaterThan(0);
    const city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 5000, lotOccupancy: 1 });
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });
});
