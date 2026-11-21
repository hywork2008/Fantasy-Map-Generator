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
import { curvedRibbon, vectorApproachBands } from "./suburbs";
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

  it("leaves no ring of blocks round an open sea wall whose land reaches round its ends", () => {
    const settings = { ...defaultGenerationSettings(), population: defaultPopulationSettings(5000) };
    settings.config = {
      ...settings.config,
      coast: "straight",
      rivers: ["toCoast"],
      features: { ...settings.config.features, walls: true, port: true }
    };
    settings.facilityLayout = "population";
    const input = vectorInputFromEditor({
        settings,
        seed: "a1",
        frame: { extentMeters: 1068, cityRadiusMeters: 250, blockSizeMeters: 50 },
        lotOccupancy: 0.8
      }),
      wall = vectorWallChoice(settings, "a1", input.context.historicalPeriod ?? "ageOfExploration", 1068),
      skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed: "a1", ...wall }).document,
      city = generateVectorUrban(skeleton, {
        ...DEFAULT_VECTOR_URBAN,
        mode: "medieval-facilities",
        population: 5000,
        lotOccupancy: 0.8
      });
    expect(wall.wallCoast).toBe("open");
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

describe("roadside strip along a bending road (pre-acceptance U4)", () => {
  it("bends with the road instead of boxing the bend", () => {
    // 150 m east, then a 60° turn and 150 m on, every 2 m as the approach bands sample it.
    const road: [number, number][] = [];
    for (let s = 0; s <= 150; s += 2) road.push([s, 0]);
    for (let s = 2; s <= 150; s += 2) road.push([150 + s * Math.cos(Math.PI / 3), s * Math.sin(Math.PI / 3)]);
    const strip = curvedRibbon(road, () => 28);
    expect(strip).toHaveLength(1);
    const outline = strip![0];
    // The road lies inside the strip, and no part of the strip stands farther from the road than its half width
    // (a box over the bend would leave its corner about 40 m out).
    for (const q of road.slice(1, -1)) expect(pointInPolygon(q, outline)).toBe(true);
    for (const q of outline) expect(nearestOnPolyline(q, road).dist).toBeLessThan(28 + 3);
  });
});
