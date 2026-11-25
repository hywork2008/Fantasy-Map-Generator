import { describe, expect, it } from "vitest";
import { createVectorDocument } from "./document";
import { earthworkHeight, fmgRelief, reliefHeightFunction, settingsRelief } from "./relief";
import { EMBED_MAX_METERS, ENTRANCE_STEP_METERS, vectorTerrain } from "./terrain";

describe("meshless natural relief (P8a)", () => {
  it("keeps level ground level and gives a slope its fall and its rolling ground", () => {
    const doc = createVectorDocument("relief", 2000);
    expect(settingsRelief(doc, {}, "relief", 300)).toBeUndefined();
    const relief = settingsRelief(doc, { elevationPreset: "slope", elevationRotation: 0 }, "relief", 300)!,
      at = reliefHeightFunction(relief);
    // Downhill is +X: the west edge stands the preset's span above the east edge, give or take the roll.
    expect(at([-900, 0]) - at([900, 0])).toBeGreaterThan(60);
    const profile = [-400, -200, 0, 200, 400].map(x => at([x, 50]));
    expect(new Set(profile.map(h => h.toFixed(2))).size).toBe(5);
  });

  it("sets a template's landform back from the town instead of under its centre", () => {
    const doc = createVectorDocument("crag", 2000),
      relief = settingsRelief(doc, { terrainField: { template: "crag" } }, "crag", 250)!,
      crag = relief.parts.find(p => p.kind === "crag") as { center: [number, number] };
    expect(Math.hypot(...crag.center)).toBeGreaterThan(300);
    const at = reliefHeightFunction(relief);
    expect(at(crag.center) - at([0, 0])).toBeGreaterThan(20);
  });

  it("passes through FMG's lattice points and stays within their neighbours between them", () => {
    const elevationsMeters = [10, 10, 10, 10, 40, 10, 10, 10, 10],
      relief = fmgRelief({ size: 3, spacingMeters: 100, elevationsMeters }, "fmg")!;
    const lattice = { ...relief, parts: relief.parts.filter(p => p.kind === "lattice") },
      at = reliefHeightFunction(lattice);
    expect(at([0, 0])).toBeCloseTo(40);
    expect(at([-100, -100])).toBeCloseTo(10);
    const between = at([50, 0]);
    expect(between).toBeGreaterThan(10);
    expect(between).toBeLessThanOrEqual(40);
    expect(fmgRelief({ size: 2, spacingMeters: 50, elevationsMeters: [5, 5, 5, 5] }, "flat")).toBeUndefined();
  });

  it("raises a motte with a level summit and cuts a ditch with a level floor", () => {
    const works = [
      {
        kind: "mound" as const,
        id: "m",
        center: [0, 0] as [number, number],
        summitRadiusMeters: 8,
        baseRadiusMeters: 24,
        summitMeters: 16
      },
      {
        kind: "ditch" as const,
        id: "d",
        line: [
          [-30, -30],
          [30, -30],
          [30, 30],
          [-30, 30]
        ] as [number, number][],
        closed: true,
        widthMeters: 8,
        floorWidthMeters: 2,
        floorMeters: 7
      }
    ];
    expect(earthworkHeight(works, 10, [0, 0])).toBe(16);
    expect(earthworkHeight(works, 10, [5, 0])).toBe(16);
    expect(earthworkHeight(works, 10, [16, 0])).toBeCloseTo(13);
    expect(earthworkHeight(works, 10, [30, 0])).toBe(7);
    expect(earthworkHeight(works, 10, [50, 0])).toBe(10);
  });

  it("levels a house's floor at its street's entrance, plinth downhill and sunk no deeper than the cap uphill", () => {
    const doc = createVectorDocument("floor", 400);
    // A 20% slope falling to +X.
    doc.environment = {
      features: {},
      hidden: [],
      relief: {
        version: 1,
        source: "settings",
        seed: 1,
        parts: [
          { kind: "offset", meters: 50 },
          {
            kind: "scarp",
            origin: [-100, 0],
            downhill: [1, 0],
            cliffRunMeters: 200,
            heightMeters: 40,
            gentleRunMeters: 1
          }
        ],
        earthworks: []
      }
    };
    const terrain = vectorTerrain(doc),
      ring: [number, number][] = [
        [0, 0],
        [20, 0],
        [20, 6],
        [0, 6]
      ],
      street: [number, number] = [-2, 3],
      level = terrain.floorAt(ring, street);
    expect(level.floor).toBeCloseTo(terrain.heightAt(street) + ENTRANCE_STEP_METERS);
    expect(level.high - level.low).toBeCloseTo(4, 1);
    expect(level.floor).toBeGreaterThan(level.low);
    // A street far below the house: the uphill side may not sink deeper than the cap.
    expect(terrain.floorAt(ring, [80, 3]).floor).toBeCloseTo(level.high - EMBED_MAX_METERS);
  });
});
