import { describe, expect, it } from "vitest";
import goth from "../../../data/fixtures/gothengsfeld-20261012.json";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import { defaultGenerationSettings } from "../../generation/settings";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { cellHouseCount, cellHouseRing, unpackPoints } from "../fabric/pack";
import { pointSegmentDistance, samplePath } from "../geometry/sampling";
import { vectorInputFromEditor } from "./editorInput";
import { vectorInputFromDescriptor } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { vectorApproachBands } from "./suburbs";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

describe("roadside ribbon beyond the wall (feature parity P7a)", () => {
  it("keeps only modest houses along the approaches, past the glacis and within the band", () => {
    const d = structuredClone(goth.descriptor) as unknown as BurgSiteDescriptor;
    d.burg.shanty = false;
    const skeleton = generateVectorSkeleton(vectorInputFromDescriptor(d), {
        ...DEFAULT_VECTOR_GENERATION,
        seed: "p",
        wall: "ellipse"
      }).document,
      city = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: d.burg.population }),
      { bands } = vectorApproachBands(city),
      wall = samplePath(city.paths["auto-wall"]).map(s => s.point);
    expect(bands.length).toBeGreaterThan(0);
    let outside = 0;
    for (const cell of Object.values(city.fabric!.cells)) {
      if (cell.inside) continue;
      for (let i = 0; i < cellHouseCount(cell); i++) {
        const ring = cellHouseRing(cell, i),
          c = polygonCentroid(ring),
          near = bands
            .map(b => ({
              b,
              d: nearestOnPolyline(c, b.points).dist,
              g: Math.hypot(c[0] - b.points[0][0], c[1] - b.points[0][1])
            }))
            .sort((x, y) => x.d - y.d)[0];
        outside++;
        expect(near.d).toBeLessThanOrEqual(20);
        expect(near.g).toBeGreaterThanOrEqual(near.b.clearance);
        expect(near.g).toBeLessThanOrEqual(near.b.clearance + near.b.length);
        expect(nearestOnPolyline(c, wall).dist).toBeGreaterThanOrEqual(near.b.clearance);
        expect(Math.abs(polygonArea(ring))).toBeLessThanOrEqual(220);
      }
    }
    expect(outside).toBeGreaterThan(0);
    expect(city.urban!.report.unplacedPopulation).toBe(0);
  });
});

describe("the town beyond its wall grows along the gate roads (gate-ribbon plan W1, W2)", () => {
  const town = (seed: string, sized: number, actual: number) => {
    const settings = {
      ...defaultGenerationSettings(),
      population: defaultPopulationSettings(sized),
      wallShape: "square" as const
    };
    settings.config = {
      ...settings.config,
      rivers: [],
      features: { ...settings.config.features, walls: true, shanty: false, port: false }
    };
    const input = vectorInputFromEditor({
      settings,
      seed,
      frame: { extentMeters: 1600, cityRadiusMeters: 396, blockSizeMeters: 50 },
      lotOccupancy: 1
    });
    input.context.targetPopulation = actual;
    const wall = vectorWallChoice(settings, seed, input.context.historicalPeriod ?? "ageOfExploration");
    const skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document;
    return generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: actual, lotOccupancy: 1 });
  };
  // Every street block beyond the wall lies on a strip along an approach, past its glacis.
  const onApproaches = (city: ReturnType<typeof town>) => {
    const { bands } = vectorApproachBands(city),
      ring = samplePath(city.paths["auto-wall"]).map(s => s.point);
    for (const cell of Object.values(city.fabric!.cells)) {
      const c = polygonCentroid(unpackPoints(cell.ring, cell.origin));
      if (pointInPolygon(c, ring)) continue;
      expect(bands.some(b => nearestOnPolyline(c, b.points).dist < 2 * 56)).toBe(true);
      expect(Math.min(...ring.map((p, i) => pointSegmentDistance(c, p, ring[(i + 1) % ring.length])))).toBeGreaterThan(
        20
      );
    }
  };

  it("leaves no ring of blocks between the round site and a square wall", () => {
    const city = town("w1-square", 5000, 5000);
    onApproaches(city);
    expect(city.urban!.report.unplacedDwellings).toBe(0);
  });

  it("houses what the interior cannot hold along the approaches, not round the wall", () => {
    const city = town("w2-square", 5000, 7000);
    onApproaches(city);
    expect(city.urban!.report.capacityOutside).toBeGreaterThan(0);
    expect(city.urban!.report.unplacedDwellings).toBe(0);
  });
});
