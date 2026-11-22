import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import { createGridDocument } from "../../document";
import { circuitRing } from "../../fortifications";
import { generateCityOnDocument } from "../../generation/generateCity";
import { defaultGenerationSettings } from "../../generation/settings";
import { polygonArea } from "../../geom";
import { defaultPopulationSettings, planPopulation } from "../../populationPlan";
import { featureReservations } from "../environmentState";
import { unpackLine } from "../fabric/pack";
import { evaluateAnchor } from "../geometry/curves";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { sampledClosedRing } from "../geometry/routing";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
import { vectorOccupiedSites } from "../occupancy";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";

const defaults = () => ({
  ...defaultGenerationSettings(),
  population: defaultPopulationSettings(),
  historicalPeriod: "ageOfExploration" as const,
  buildingPattern: "medieval" as const,
  townWallRings: "single" as const
});
const frame = { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 };
describe("civic centre sized by population (feature parity P0b)", () => {
  it("fits the church of each population tier inside the site sized for it, and the site grows for it", () => {
    for (const [population, modelId] of [
      [600, "village-chapel"],
      [3000, "town-church-large"]
    ] as const) {
      const settings = { ...defaults(), population: defaultPopulationSettings(population) },
        input = vectorInputFromEditor({ settings, seed: "parity-civic", frame, lotOccupancy: 1 });
      expect(input.placements["civic:church"].modelId).toBe(modelId);
      for (const boundary of featureReservations(input))
        expect(regionBoolean([boundary], input.site!.domain, "difference")).toHaveLength(0);
      const city = generateVectorUrban(
        generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed: "parity-civic", wall: "ellipse" }).document,
        { ...DEFAULT_VECTOR_URBAN, population, lotOccupancy: 1 }
      );
      expect(city.urban!.report.unplacedPopulation).toBe(0);
    }
  });
});
describe("default standalone civic land and city envelope", () => {
  it("reserves central civic sites without changing the settings or borrowing an FMG input", () => {
    const settings = defaults(),
      before = structuredClone(settings),
      input = vectorInputFromEditor({ settings, seed: "b5o620", frame });
    expect(settings).toEqual(before);
    expect(input.site?.id).toBe("standalone-ce-site");
    expect(input.frame.extentMeters).toBe(frame.extentMeters);
    expect(Object.keys(input.environment!.features)).toEqual([
      "feature:civic-plaza",
      "feature:civic-church",
      "feature:civic-cemetery"
    ]);
    expect(input.placements["civic:church"].display?.dwellings).toBe(0);
    expect(input.environment!.landscape!.cemeteries[0].parts.length).toBeGreaterThan(0);
    expect(containsRegion(featureReservations(input), input.site!.center)).toBe(false);
    for (const boundary of featureReservations(input)) {
      expect(regionBoolean([boundary], input.site!.domain, "difference")).toHaveLength(0);
      expect(regionBoolean([boundary], allVectorWater(input), "intersection")).toHaveLength(0);
    }
    const disabled = defaults();
    disabled.config.features.plaza = false;
    disabled.config.features.temple = false;
    expect(vectorInputFromEditor({ settings: disabled, seed: "b5o620", frame }).environment).toBeUndefined();
  });
  it("keeps civic accesses, reservations and all 5000 residents inside a wall sized for them", () => {
    const settings = defaults(),
      seed = "b5o620",
      // The population plan's own target, not a mesh town's wall: a mesh town of 5,000 sits where its map changes
      // between 600 and 1,200 m, and its wall area with it (docs/plan/ce-outskirts-workshop-sizes.md §8.22).
      plan = planPopulation(settings.population, settings.historicalPeriod, frame.extentMeters);
    const input = vectorInputFromEditor({ settings, seed, frame }),
      skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall: "ellipse" }).document;
    const city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 5000 });
    const wall = { outer: sampledClosedRing(city, "auto-wall"), holes: [] },
      area = regionArea(wall);
    expect(Math.abs(area / plan.targetAreaM2 - 1)).toBeLessThan(0.1);
    expect(city.frame.extentMeters).toBe(Math.max(frame.extentMeters, plan.extentMeters));
    // The skeleton may grow the site (the shanty faubourg, P6h); the urban stage keeps it.
    expect(city.urban!.domain).toEqual(skeleton.site!.domain);
    expect(city.urban!.report.unplacedPopulation).toBe(0);
    expect(city.urban!.report.requiredFacilities).toBe(0);
    const reserved = featureReservations(city);
    // Generated houses live in fabric; none may enter the civic reservations.
    const houses = vectorOccupiedSites({ ...city, placements: {} }, "site");
    expect(houses.length).toBe(city.urban!.report.housingBuildings);
    expect(regionBoolean(houses, reserved, "intersection").reduce((n, p) => n + regionArea(p), 0)).toBeLessThan(1e-5);
    for (const feature of Object.values(city.environment!.features)) {
      // Its access; the church also has the lanes between it, the plaza and the churchyard.
      expect(feature.pathIds.filter(id => id === `${feature.id}:access`)).toHaveLength(1);
      const end = evaluateAnchor(city.paths[feature.access.pathId], feature.access);
      expect(feature.connector.at(-1)).toEqual(end);
    }
    // One lane, not a street block's lane along each side, between the church and the plaza and churchyard: no
    // fabric line lies in either gap.
    const features = city.environment!.features,
      box = (id: string) => {
        const outer = features[id].boundary.outer;
        return {
          x0: Math.min(...outer.map(p => p[0])),
          x1: Math.max(...outer.map(p => p[0])),
          y0: Math.min(...outer.map(p => p[1])),
          y1: Math.max(...outer.map(p => p[1]))
        };
      },
      church = box("feature:civic-church"),
      plaza = box("feature:civic-plaza"),
      yard = box("feature:civic-cemetery"),
      gaps = [
        { x0: church.x1, x1: plaza.x0, y0: plaza.y0, y1: plaza.y1 },
        { x0: church.x0, x1: church.x1, y0: yard.y1, y1: church.y0 }
      ];
    expect(features["feature:civic-church"].pathIds.filter(id => id.includes(":lane:"))).toHaveLength(2);
    for (const g of gaps) expect(g.x1 - g.x0 < 3 || g.y1 - g.y0 < 3).toBe(true);
    const lines = [
      ...Object.values(city.fabric!.districts).flatMap(d =>
        d.streets.offsets.map((_, i) => unpackLine(d.streets, i, d.origin))
      ),
      ...Object.values(city.fabric!.cells).flatMap(c => c.lanes.offsets.map((_, i) => unpackLine(c.lanes, i, c.origin)))
    ];
    const inGap = lines.filter(l =>
      l.some(p => gaps.some(g => p[0] > g.x0 + 0.1 && p[0] < g.x1 - 0.1 && p[1] > g.y0 + 0.1 && p[1] < g.y1 - 0.1))
    );
    expect(inGap).toEqual([]);
    const saved = serializeVectorDocument(city);
    expect(parseVectorDocument(saved)).toEqual(city);
    if (process.env.CE_CIVIC_ACCEPTANCE_OUT) {
      const mesh = generateCityOnDocument(
        createGridDocument({ size: "small", grid: "voronoi", seed }),
        settings,
        seed
      )!;
      const meshArea = (mesh.defenseCircuits ?? [])
        .filter(c => c.scope === "town")
        .reduce((n, c) => n + Math.abs(polygonArea(circuitRing(mesh, c))), 0);
      const union = (polys: typeof reserved) => regionBoolean([], polys, "union");
      const areaWithin = (polys: typeof reserved) =>
        regionBoolean(union(polys), [wall], "intersection").reduce((n, p) => n + regionArea(p), 0);
      const oldPlan = planPopulation(defaultPopulationSettings(), "ageOfExploration", 1200);
      const observation = {
        seed,
        population: 5000,
        mesh: {
          wallAreaM2: meshArea,
          frameExtentMeters: mesh.frame.extentMeters,
          population: mesh.populationReport,
          centralElements: mesh.elements
            .filter(e => e.kind === "plaza" || e.kind === "temple")
            .map(e => ({ kind: e.kind, point: e.point, sizeMeters: e.sizeMeters })),
          cemeteryAreaM2: (mesh.cemeteries ?? []).reduce((n, c) => n + Math.abs(polygonArea(c.boundary)), 0)
        },
        meshless: {
          previousDomainAreaM2: oldPlan.targetAreaM2,
          wallAreaM2: area,
          frameExtentMeters: city.frame.extentMeters,
          ratioToMesh: area / meshArea,
          siteAreaM2: input.site!.domain.reduce((n, p) => n + regionArea(p), 0),
          civicReservedAreaM2: areaWithin(reserved),
          waterAreaM2: areaWithin(allVectorWater(city)),
          roadAreaM2: areaWithin(
            Object.values(city.paths)
              .filter(p => p.role === "road")
              .map(pathSurface)
          ),
          housingFootprintAreaM2: areaWithin(
            Object.values(city.placements)
              .filter(p => p.building?.kind === "housing")
              .flatMap(p => p.building!.footprint)
          ),
          population: city.urban!.report,
          civicFeatures: Object.values(city.environment!.features).map(f => ({
            id: f.id,
            kind: f.kind,
            areaM2: regionArea(f.boundary),
            connector: f.connector
          })),
          cemeteryParts: city.environment!.landscape!.cemeteries[0].parts.length
        },
        savedSha256: createHash("sha256").update(saved).digest("hex"),
        savedBytes: Buffer.byteLength(saved)
      };
      writeFileSync(resolve(process.env.CE_CIVIC_ACCEPTANCE_OUT), `${JSON.stringify(observation, null, 2)}\n`);
    }
  }, 120000);
});
