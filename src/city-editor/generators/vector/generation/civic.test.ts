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
import { evaluateAnchor } from "../geometry/curves";
import { containsRegion, regionArea, regionBoolean } from "../geometry/regions";
import { sampledClosedRing } from "../geometry/routing";
import { pathSurface } from "../geometry/surfaces";
import { allVectorWater } from "../geometry/water";
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
  it("keeps civic accesses, reservations and all 5000 residents inside a comparable wall area", () => {
    const settings = defaults(),
      seed = "b5o620";
    const mesh = generateCityOnDocument(createGridDocument({ size: "small", grid: "voronoi", seed }), settings, seed)!;
    expect(mesh).not.toBeNull();
    const meshArea = (mesh.defenseCircuits ?? [])
      .filter(c => c.scope === "town")
      .reduce((n, c) => n + Math.abs(polygonArea(circuitRing(mesh, c))), 0);
    const input = vectorInputFromEditor({ settings, seed, frame }),
      skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall: "ellipse" }).document;
    const city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: 5000 });
    const wall = { outer: sampledClosedRing(city, "auto-wall"), holes: [] },
      area = regionArea(wall);
    expect(Math.abs(area / meshArea - 1)).toBeLessThan(0.05);
    expect(city.frame.extentMeters).toBe(mesh.frame.extentMeters);
    expect(city.urban!.domain).toEqual(input.site!.domain);
    expect(city.urban!.report.unplacedPopulation).toBe(0);
    expect(city.urban!.report.requiredFacilities).toBe(0);
    const reserved = featureReservations(city);
    for (const placement of Object.values(city.placements).filter(p => p.building?.kind === "housing"))
      expect(
        regionBoolean(placement.building!.footprint, reserved, "intersection").reduce((n, p) => n + regionArea(p), 0)
      ).toBeLessThan(1e-5);
    for (const feature of Object.values(city.environment!.features)) {
      expect(feature.pathIds.length).toBe(1);
      const end = evaluateAnchor(city.paths[feature.access.pathId], feature.access);
      expect(feature.connector.at(-1)).toEqual(end);
    }
    const saved = serializeVectorDocument(city);
    expect(parseVectorDocument(saved)).toEqual(city);
    if (process.env.CE_CIVIC_ACCEPTANCE_OUT) {
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
