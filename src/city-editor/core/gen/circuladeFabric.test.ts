import { describe, expect, it } from "vitest";
import { createGridDocument } from "../document";
import { circuitRing, polygonOverlaps } from "../fortifications";
import { defaultGenerationSettings, type GenerationSettings, generateCityOnDocument } from "../generate";
import type { Face, Point } from "../types";
import { buildBlockFabric } from "./blockInfill";
import { buildCirculadeBlocks, buildCirculadeTownFabric } from "./circuladeFabric";
import { pointInPolygon } from "./geom";
import type { BlockBoundary } from "./perimeterBlocks";

describe("buildCirculadeBlocks", () => {
  const dummyFace: Face = {
    id: "f1",
    boundary: [],
    properties: {
      water: "land",
      buildable: true,
      locked: false,
      ward: "craftsmen"
    }
  };

  const ringOutline: Point[] = [
    [20, 20],
    [80, 20],
    [80, 80],
    [20, 80]
  ];

  const boundaries: BlockBoundary[] = ringOutline.map((p, i) => ({
    a: p,
    b: ringOutline[(i + 1) % ringOutline.length],
    setback: 2,
    feature: true
  }));

  it("produces concentric blocks and buildings within face outline", () => {
    const fabric = buildCirculadeBlocks(dummyFace, ringOutline, boundaries, undefined, "test-seed", true, [0, 0]);
    expect(fabric.blocks.length).toBeGreaterThan(0);
    expect(fabric.buildings.length).toBeGreaterThan(0);
  });
});

describe("buildCirculadeTownFabric", () => {
  it("fills the full town when an integrated castle splits the curtain into wall runs", () => {
    const input = createGridDocument({
      size: "tiny",
      grid: "evolution",
      seed: "19d7ras",
      patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
    });
    const settings: GenerationSettings = {
      ...defaultGenerationSettings(),
      config: {
        coast: "bay",
        rivers: ["straight", "through"],
        relief: false,
        features: { walls: true, citadel: true, plaza: true, temple: true, port: true, shanty: false },
        wall: { envelope: "auto", coast: "auto", line: "auto" },
        layout: "auto"
      },
      streets: { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true },
      layout: "circulade",
      walledAreaShare: 1
    };
    const seed = "bxq1k3:junction-retry:4";
    const document = generateCityOnDocument(input, settings, seed)!;
    expect(document).toBeTruthy();
    expect(document.generationSeed).toBe(seed);
    const town = document.defenseCircuits!.find(c => c.scope === "town")!;
    expect(town.wallGroupIds.length).toBeGreaterThan(1);
    const hub = document.elements.find(e => e.kind === "plaza")!.point;
    const split = buildCirculadeTownFabric(document, { seed, hub });
    expect(split.buildings.length).toBeGreaterThan(400);
    const outline = circuitRing(document, town);
    expect(split.buildings.every(b => b.polygon.every(p => pointInPolygon(p, outline)))).toBe(true);

    // Grouping and ordering of physical wall runs must not change residential coverage.
    const joined = structuredClone(document);
    const runs = joined.featureGroups.filter(g => g.kind === "wall" && town.wallGroupIds.includes(g.id));
    const merged = {
      ...runs[0],
      style: { ...runs[0].style, widthMeters: Math.max(...runs.map(run => run.style.widthMeters)) },
      segments: runs.flatMap(g => (g.kind === "wall" ? g.segments : []))
    };
    joined.featureGroups = [merged, ...joined.featureGroups.filter(g => !town.wallGroupIds.includes(g.id))];
    joined.defenseCircuits!.find(c => c.scope === "town")!.wallGroupIds = [merged.id];
    expect(buildCirculadeTownFabric(joined, { seed, hub })).toEqual(split);
    document.featureGroups.reverse();
    expect(buildCirculadeTownFabric(document, { seed, hub })).toEqual(split);

    const castle = document.defenseCircuits!.find(c => c.scope === "castle")!;
    const castleOutline = circuitRing(document, castle);
    const finished = buildBlockFabric(document);
    expect(finished.buildings.length).toBeGreaterThan(400);
    expect(finished.buildings.some(b => polygonOverlaps(b.polygon, castleOutline))).toBe(false);
  });
});
