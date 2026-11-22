import { describe, expect, it } from "vitest";
import goth from "../../../data/fixtures/gothengsfeld-20261012.json";
import type { BurgSiteDescriptor } from "../../../types/contracts/burgSiteDescriptor";
import { defaultGenerationSettings } from "../../generation/settings";
import { pointInPolygon, polygonCentroid } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { cellHouseCount, cellHouseRing, unpackPoints } from "../fabric/pack";
import { regionsOverlap } from "../geometry/regions";
import { overlapsOccupiedSites } from "../occupancy";
import { validateVectorUrban } from "../validation/urban";
import { vectorInputFromEditor } from "./editorInput";
import { vectorInputFromDescriptor } from "./input";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";

describe("water points by the mesh editor's rules (feature parity P7d)", () => {
  it("places a plaza basin and spaced wells on vacant ground with a walk to a street", () => {
    const d = structuredClone(goth.descriptor) as unknown as BurgSiteDescriptor,
      skeleton = generateVectorSkeleton(vectorInputFromDescriptor(d), {
        ...DEFAULT_VECTOR_GENERATION,
        seed: "p"
      }).document,
      doc = generateVectorUrban(skeleton, { ...DEFAULT_VECTOR_URBAN, population: d.burg.population }),
      wells = doc.urban!.wells ?? [];
    expect(validateVectorUrban(doc)).toEqual([]);
    expect(wells.filter(w => w.use === "domestic").length).toBeGreaterThan(1);
    const domestic = wells.filter(w => w.placement === "neighborhood");
    for (const [i, a] of domestic.entries()) {
      expect(overlapsOccupiedSites(doc, { outer: a.footprint, holes: [] })).toBe(false);
      for (const b of domestic.slice(i + 1))
        expect(Math.hypot(a.center[0] - b.center[0], a.center[1] - b.center[1])).toBeGreaterThanOrEqual(55);
    }
  });

  // A village green keeps the public basin in its middle; a larger Christian square has a market cross there instead.
  it.each([
    [600, 1],
    [3000, 0]
  ] as const)("a town of %i sets %i public basin on the civic plaza", (population, basins) => {
    const base = defaultGenerationSettings(),
      seed = "p7d-water",
      input = vectorInputFromEditor({
        settings: {
          ...base,
          population: defaultPopulationSettings(population),
          historicalPeriod: "lateMedieval" as const,
          buildingPattern: "medieval" as const
        },
        seed,
        frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 },
        lotOccupancy: 1
      }),
      doc = generateVectorUrban(
        generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, wall: "ellipse" }).document,
        { ...DEFAULT_VECTOR_URBAN, population, lotOccupancy: 1 }
      ),
      wells = doc.urban!.wells ?? [];
    expect(doc.environment?.features["feature:civic-plaza"]).toBeDefined();
    expect(wells.filter(w => w.kind === "publicBasin" && w.placement === "plaza")).toHaveLength(basins);
    expect(doc.placements["civic:plaza-furniture"]?.modelId).toBe(
      basins ? "pillory-and-stocks" : "market-cross-canopied"
    );
    expect(validateVectorUrban(doc)).toEqual([]);
  });

  it("keeps a roadside village's wells and their paths off the built burgage yards", () => {
    const seed = "roadside-village",
      settings = { ...defaultGenerationSettings(), plotFabric: "burgage-village" as const };
    settings.population = defaultPopulationSettings(1000);
    const input = vectorInputFromEditor({
        settings,
        seed,
        frame: { extentMeters: 800, cityRadiusMeters: 200, blockSizeMeters: 50 },
        lotOccupancy: 1
      }),
      doc = generateVectorUrban(generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed }).document, {
        ...DEFAULT_VECTOR_URBAN,
        mode: "medieval",
        population: 1000,
        plotFabric: "burgage-village"
      }),
      wells = doc.urban!.wells ?? [];
    const yards = Object.values(doc.fabric!.cells).flatMap(cell => {
      const plots = cell.plots!,
        houses = Array.from({ length: cellHouseCount(cell) }, (_, i) => i)
          .filter(i => !cell.detached.includes(i))
          .map(i => polygonCentroid(cellHouseRing(cell, i)));
      return plots.offsets
        .map((start, i) =>
          unpackPoints(plots.coords, cell.origin, start, plots.offsets[i + 1] ?? plots.coords.length / 2)
        )
        .filter(ring => houses.some(h => pointInPolygon(h, ring)))
        .map(outer => ({ outer, holes: [] }));
    });
    expect(wells.length).toBeGreaterThan(0);
    for (const w of wells) {
      expect(regionsOverlap([{ outer: w.footprint, holes: [] }], yards, 1e-3)).toBe(false);
      expect(yards.some(y => pointInPolygon(w.access.at(-1)!, y.outer))).toBe(false);
    }
  });
});
