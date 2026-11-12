import { describe, expect, it } from "vitest";
import type { Point } from "../../../types/primitives";
import { defaultGenerationSettings } from "../../generation/settings";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { cellHouseRing, unpackPoints } from "../fabric/pack";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { tanneryWaterWorks } from "./tanneryWaterWorks";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { waterDistance } from "./urbanPacking";
import { vectorWallChoice } from "./wallShape";

describe("population facilities on the CE street blocks (facility mode)", () => {
  it("houses everyone round the facilities, each on whole lots of one street block", () => {
    const seed = "facility-lots",
      settings = {
        ...defaultGenerationSettings(),
        facilityLayout: "population" as const,
        wallShape: "polygon" as const
      };
    settings.config = {
      ...settings.config,
      rivers: [],
      features: { ...settings.config.features, walls: true, port: false, shanty: false }
    };
    settings.population = defaultPopulationSettings(2000);
    const input = vectorInputFromEditor({
        settings,
        seed,
        frame: { extentMeters: 600, cityRadiusMeters: 200, blockSizeMeters: 50 },
        lotOccupancy: 1
      }),
      wall = vectorWallChoice(settings, seed, input.context.historicalPeriod ?? "ageOfExploration"),
      skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document,
      city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, mode: "medieval-facilities", population: 2000 }),
      report = city.urban!.report;
    expect(report.unplacedDwellings).toBe(0);
    expect(report.placedFacilities / report.requiredFacilities).toBeGreaterThan(0.85);
    const cells = Object.values(city.fabric!.cells);
    for (const id of city.urban!.ownedPlacements) {
      const p = city.placements[id];
      if (p.building?.kind !== "facility") continue;
      // Within one street block, and no house on its parcel.
      const c = polygonCentroid(p.site.outer),
        cell = cells.find(k => pointInPolygon(c, unpackPoints(k.ring, k.origin)))!;
      expect(cell).toBeDefined();
      expect(
        regionBoolean([p.site], [{ outer: unpackPoints(cell.ring, cell.origin), holes: [] }], "difference").reduce(
          (n, r) => n + regionArea(r),
          0
        )
      ).toBeLessThan(0.5);
      for (const k of cells)
        for (let i = 0; i < k.houses.offsets.length; i++)
          expect(
            regionBoolean([p.site], [{ outer: cellHouseRing(k, i), holes: [] }], "intersection").reduce(
              (n, r) => n + regionArea(r),
              0
            )
          ).toBeLessThan(1e-4);
    }
  }, 300000);
});

describe("the tanners' row on the bank below the town (tanners' row plan T2)", () => {
  it("lines the bank beyond the wall with yards backing onto the water, intakes upstream, served by a lane", () => {
    const seed = "fixture",
      settings = {
        ...defaultGenerationSettings(),
        facilityLayout: "population" as const,
        wallShape: "polygon" as const
      };
    settings.config = {
      ...settings.config,
      rivers: ["through"],
      features: { ...settings.config.features, walls: true, port: false, shanty: false }
    };
    settings.population = defaultPopulationSettings(5000);
    const frame = { extentMeters: 1584, cityRadiusMeters: 396, blockSizeMeters: 50 },
      input = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 });
    input.context.targetPopulation = 5000;
    const wall = vectorWallChoice(settings, seed, input.context.historicalPeriod ?? "ageOfExploration", 1584),
      skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document,
      city = generateVectorUrban(skeleton, {
        ...DEFAULT_VECTOR_URBAN,
        mode: "medieval-facilities",
        population: 5000,
        lotOccupancy: 1
      });
    const yards = Object.values(city.placements).filter(p => p.modelId === "trade-workshop.dedicated-wet-tannery");
    expect(yards.length).toBeGreaterThanOrEqual(10);
    const river = samplePath(Object.values(city.paths).find(p => p.role === "river")!).map(s => s.point),
      along = (p: Point) => {
        const h = nearestOnPolyline(p, river);
        let s = 0;
        for (let i = 0; i < h.segIndex; i++)
          s += Math.hypot(river[i + 1][0] - river[i][0], river[i + 1][1] - river[i][1]);
        return (
          s +
          h.t *
            Math.hypot(river[h.segIndex + 1][0] - river[h.segIndex][0], river[h.segIndex + 1][1] - river[h.segIndex][1])
        );
      };
    for (const p of yards) {
      // The model's ports in its plan frame (x, -z), turned and mirrored as the placement draws it.
      const a = (p.facingDegrees * Math.PI) / 180,
        port = (x: number): Point => {
          const lx = (p.mirrored ? -1 : 1) * x;
          return [
            p.position[0] + lx * Math.cos(a) - 8 * Math.sin(a),
            p.position[1] + lx * Math.sin(a) + 8 * Math.cos(a)
          ];
        };
      const intake = port(-7.5),
        effluent = port(7.5);
      expect(waterDistance(city, [{ outer: [intake, effluent, intake], holes: [] }])).toBeLessThan(2.5);
      expect(along(effluent)).toBeGreaterThan(along(intake));
      const e = p.building!.entrances[0];
      expect(e.accessIndex !== undefined || e.fabricLine !== undefined).toBe(true);
      // Both channels run square from the back out into the water, no farther than the revetment allows.
      const works = tanneryWaterWorks(city, p)!;
      expect(works.channels).toHaveLength(2);
      for (const ch of works.channels) {
        const [a0, a1, b1] = ch.outer;
        expect(Math.hypot(b1[0] - a1[0], b1[1] - a1[1])).toBeLessThan(3);
        expect(Math.hypot(a1[0] - a0[0], a1[1] - a0[1])).toBeCloseTo(0.6, 6);
      }
    }
  }, 300000);
});

describe("a tanners' leat where the bank bends too much for a row (tanners' row plan T3)", () => {
  it("digs a straight leat off the meandering river and lines its land side with yards", () => {
    const seed = "fixture",
      settings = { ...defaultGenerationSettings(), facilityLayout: "population" as const };
    settings.config = {
      ...settings.config,
      rivers: ["meander"],
      features: { ...settings.config.features, walls: false, port: false, shanty: false }
    };
    settings.population = defaultPopulationSettings(5000);
    const frame = { extentMeters: 1584, cityRadiusMeters: 396, blockSizeMeters: 50 },
      input = vectorInputFromEditor({ settings, seed, frame, lotOccupancy: 1 });
    input.context.targetPopulation = 5000;
    const wall = vectorWallChoice(settings, seed, input.context.historicalPeriod ?? "ageOfExploration", 1584),
      skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document,
      city = generateVectorUrban(skeleton, {
        ...DEFAULT_VECTOR_URBAN,
        mode: "medieval-facilities",
        population: 5000,
        lotOccupancy: 1
      });
    const leat = Object.values(city.paths).find(p => p.id.startsWith("urban-tanners-leat:"));
    expect(leat?.role).toBe("river");
    expect(city.urban!.ownedPaths).toContain(leat!.id);
    const line = samplePath(leat!).map(s => s.point),
      onLeat = Object.values(city.placements).filter(
        p =>
          p.modelId === "trade-workshop.dedicated-wet-tannery" &&
          tanneryWaterWorks(city, p)!.channels.every(c => nearestOnPolyline(c.outer[2], line).dist < 2)
      );
    expect(onLeat.length).toBeGreaterThanOrEqual(3);
  }, 300000);
});
