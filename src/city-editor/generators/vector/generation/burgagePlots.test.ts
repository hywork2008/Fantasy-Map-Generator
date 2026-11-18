import { describe, expect, it } from "vitest";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import type { PlotFabric } from "../../../types/contracts/burgage";
import type { VectorCityDocument } from "../../../types/vector/document";
import { defaultGenerationSettings } from "../../generation/settings";
import { pointInPolygon, polygonArea, polygonCentroid } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { unpackPoints } from "../fabric/pack";
import { regionArea } from "../geometry/regions";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

/** A walled town without a river, on compact lots or burgage plots. */
function town(plotFabric: PlotFabric, population = 1000, facilities = false): VectorCityDocument {
  const seed = "burgage-plots",
    settings = {
      ...defaultGenerationSettings(),
      wallShape: "polygon" as const,
      plotFabric,
      ...(facilities ? { facilityLayout: "population" as const } : {})
    };
  settings.config = {
    ...settings.config,
    rivers: [],
    features: { ...settings.config.features, walls: true, port: false, shanty: false }
  };
  settings.population = defaultPopulationSettings(population);
  const input = vectorInputFromEditor({
      settings,
      seed,
      frame: { extentMeters: 800, cityRadiusMeters: 200, blockSizeMeters: 50 },
      lotOccupancy: 1
    }),
    wall = vectorWallChoice(settings, seed, input.context.historicalPeriod ?? "ageOfExploration"),
    skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document;
  return generateVectorUrban(skeleton, {
    ...DEFAULT_VECTOR_URBAN,
    mode: facilities ? "medieval-facilities" : "medieval",
    population,
    plotFabric
  });
}

const rings = (coords: number[], offsets: number[], origin: [number, number]) =>
  offsets.map((start, i) => unpackPoints(coords, origin, start, offsets[i + 1] ?? coords.length / 2));

describe("burgage plots in the meshless CE (docs/plan/ce-burgage-plot-fabric.md B2, B3, B5)", () => {
  it("houses everyone on plots recorded with their street blocks, and keeps them through a save", () => {
    const doc = town("burgage");
    expect(doc.urban!.algorithm).toBe("vector-urban-v19");
    expect(doc.fabric!.algorithm).toBe("vector-urban-v19");
    expect(doc.urban!.report.unplacedDwellings).toBe(0);
    const cells = Object.values(doc.fabric!.cells).filter(c => c.houses.offsets.length);
    expect(cells.length).toBeGreaterThan(5);
    for (const cell of cells) {
      expect(cell.plots?.offsets.length).toBeGreaterThan(0);
      const plots = rings(cell.plots!.coords, cell.plots!.offsets, cell.origin);
      // Every house stands at the front of one of its street block's plots.
      for (const house of rings(cell.houses.coords, cell.houses.offsets, cell.origin))
        expect(plots.some(plot => pointInPolygon(polygonCentroid(house), plot))).toBe(true);
    }
    const saved = parseVectorDocument(serializeVectorDocument(doc));
    expect(saved?.fabric).toEqual(doc.fabric);
  });

  it("lays facilities on whole plots, a few each, and never leaves a street block inside the wall to them alone", () => {
    const doc = town("burgage", 2000, true);
    const report = doc.urban!.report;
    expect(report.unplacedDwellings).toBe(0);
    expect(report.placedFacilities / report.requiredFacilities).toBeGreaterThan(0.8);
    const all = Object.values(doc.placements).filter(p => p.building?.kind === "facility" && p.origin === "automatic");
    expect(all.length).toBeGreaterThan(50);
    for (const cell of Object.values(doc.fabric!.cells)) {
      if (!cell.plots) continue;
      const plots = rings(cell.plots.coords, cell.plots.offsets, cell.origin);
      const under = all.map(f => plots.filter(plot => pointInPolygon(polygonCentroid(plot), f.site.outer)));
      for (const [k, taken] of under.entries()) {
        // The tanners' row is reserved on the bank, not on plots.
        if (!taken.length || all[k].modelId.includes("wet-tannery")) continue;
        // The parcel is its plots whole: one to four of them, nothing more.
        expect(taken.length).toBeLessThanOrEqual(4);
        const area = taken.reduce((n, plot) => n + Math.abs(polygonArea(plot)), 0);
        expect(Math.abs(regionArea(all[k].site) - area)).toBeLessThan(area * 0.02 + 1);
      }
      // A street block inside the wall that holds a facility holds houses too.
      if (cell.inside && under.some(t => t.length)) expect(cell.houses.offsets.length).toBeGreaterThan(0);
    }
  });

  it("builds rear houses in the yards only once every front inside the wall is built (the burgage cycle, B5)", () => {
    const doc = town("burgage", 5000);
    expect(doc.urban!.report.unplacedDwellings).toBe(0);
    const lawns = (doc.urban!.parks ?? []).flatMap(p => p.lawns);
    let rear = 0,
      empty = 0,
      plots = 0;
    for (const cell of Object.values(doc.fabric!.cells)) {
      if (!cell.plots || !cell.inside) continue;
      const houses = rings(cell.houses.coords, cell.houses.offsets, cell.origin);
      for (const plot of rings(cell.plots.coords, cell.plots.offsets, cell.origin)) {
        // A park ward's plots are its lawn, not empty fronts.
        if (lawns.some(l => pointInPolygon(polygonCentroid(plot), l))) continue;
        const on = houses.filter(h => pointInPolygon(polygonCentroid(h), plot)).length;
        plots++;
        if (on >= 2) rear++;
        if (!on) empty++;
      }
    }
    expect(rear).toBeGreaterThan(50);
    // Fronts inside the wall stay empty only where a house cannot stand (a gate opening, a junction) or a park ward
    // keeps its block free (its lawn is inset from the block's edges): a few at most, while yards take rear houses.
    expect(empty / plots).toBeLessThan(0.05);
  });

  it("leaves compact street blocks as they were", () => {
    const doc = town("compact");
    expect(doc.fabric!.algorithm).toBe("vector-urban-v18");
    expect(Object.values(doc.fabric!.cells).some(c => c.plots)).toBe(false);
  });
});
