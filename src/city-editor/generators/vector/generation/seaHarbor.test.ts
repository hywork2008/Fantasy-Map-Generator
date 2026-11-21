import { describe, expect, it } from "vitest";
import { vectorRenderData } from "../../../renderers/vector/renderData";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { withPortTargets } from "../../site/siteConfig";
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
    expect(harbor!.ships.length).toBeGreaterThan(0);
    expect(harbor!.ships.every(s => s.type === "barge")).toBe(true);
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

  // A coast town with a river through it to the sea: the port's waters by their own toggles (Coast / River 1).
  const estuary = (ports?: { coast: boolean; rivers: boolean[] }) => {
    const seed = "a1",
      settings = { ...defaultGenerationSettings(), population: defaultPopulationSettings(5000) };
    settings.config = withPortTargets(
      {
        ...settings.config,
        coast: "straight",
        rivers: ["toCoast"],
        features: { ...settings.config.features, port: true, walls: true }
      },
      ports
    );
    const doc = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 }),
      wall = vectorWallChoice(settings, seed, "lateMedieval");
    return { wall, skeleton: generateVectorSkeleton(doc, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document };
  };
  // The site's water is the sea (body 0), then the river (body 1); a harbour space is named by its shore.
  const onRiver = (id: string) => id.startsWith("harbor:shore:1:");

  it("lays the river's quays along a landing reach downstream and links each quayside by one cart path", () => {
    const { skeleton } = estuary(),
      harbor = skeleton.environment!.harbor!,
      riverShores = new Set(harbor.spaces.filter(s => onRiver(s.id)).map(s => s.id.split(":")[3]));
    // 120 m of bank in shores of at most 60 m.
    expect(riverShores.size).toBeGreaterThan(0);
    expect(riverShores.size).toBeLessThanOrEqual(10);
    // Touching quays are one quayside, a street in itself: one cart path links it to the town's streets, not one
    // from every quay (a row of parallel paths with lanes between them).
    const quayShores = new Set(harbor.spaces.map(s => s.id.split(":").slice(0, 4).join(":")));
    expect(harbor.accesses.length).toBeGreaterThan(0);
    expect(harbor.accesses.length).toBeLessThan(quayShores.size / 2);
    // The harbour's water lies under the bridges in the plan view.
    const surfaces = vectorRenderData(skeleton).surfaces,
      water = surfaces.findIndex(s => s.pieceRole === "harbor-water"),
      bridge = surfaces.findIndex(s => s.kind === "bridge");
    expect(bridge).toBeGreaterThan(-1);
    expect(water).toBeLessThan(bridge);
  });

  it("puts a port only on the waters whose toggles are on", () => {
    const coast = estuary({ coast: true, rivers: [false] });
    expect(coast.wall.wallCoast).toBe("open");
    const coastSpaces = coast.skeleton.environment!.harbor!.spaces;
    expect(coastSpaces.length).toBeGreaterThan(0);
    expect(coastSpaces.some(s => onRiver(s.id))).toBe(false);
    const river = estuary({ coast: false, rivers: [true] });
    // A river port alone leaves the sea side of the wall closed.
    expect(river.wall.wallCoast).toBeUndefined();
    const riverSpaces = river.skeleton.environment!.harbor!.spaces;
    expect(riverSpaces.length).toBeGreaterThan(0);
    expect(riverSpaces.every(s => onRiver(s.id))).toBe(true);
  });
});
