import { describe, expect, it } from "vitest";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import { defaultGenerationSettings } from "../../generation/settings";
import { pointInPolygon, polygonCentroid } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { unpackPoints } from "../fabric/pack";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

/** A standalone village; the walls asked for are ignored (plan §4.3). */
function village(population: number, river: boolean): VectorCityDocument {
  const seed = "roadside-village",
    settings = { ...defaultGenerationSettings(), plotFabric: "burgage-village" as const };
  settings.config = {
    ...settings.config,
    ...(river ? {} : { rivers: [] }),
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
    mode: "medieval",
    population,
    plotFabric: "burgage-village"
  });
}

const rings = (coords: number[], offsets: number[], origin: Point) =>
  offsets.map((start, i) => unpackPoints(coords, origin, start, offsets[i + 1] ?? coords.length / 2));
const corner = (a: Point, b: Point, c: Point) => {
  const u = [a[0] - b[0], a[1] - b[1]],
    v = [c[0] - b[0], c[1] - b[1]];
  return (Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]))) * 180) / Math.PI;
};
/** Within 1° of square: the fabric keeps corners to the centimetre. */
const rectangular = (ring: Point[]) =>
  ring.length === 4 && ring.every((p, i) => Math.abs(corner(ring[(i + 3) % 4], p, ring[(i + 1) % 4]) - 90) < 1);

describe("roadside village (docs/plan/ce-meshless-roadside-burgage-village.md V2)", () => {
  it("houses a village of 1,000 on square tofts along its roads, unwalled, and keeps it through a save", () => {
    const doc = village(1000, true);
    expect(doc.urban!.algorithm).toBe("vector-urban-v66");
    expect(Object.values(doc.paths).some(p => p.role === "wall")).toBe(false);
    expect(doc.urban!.report.unplacedDwellings).toBe(0);
    // No round site: the village reaches well beyond the centre's own small site.
    const site = Math.max(...doc.site!.domain[0].outer.map(p => Math.hypot(p[0], p[1])));
    const cells = Object.values(doc.fabric!.cells);
    const reach = Math.max(...cells.flatMap(c => unpackPoints(c.ring, c.origin).map(p => Math.hypot(p[0], p[1]))));
    expect(reach).toBeGreaterThan(site * 2);
    for (const cell of cells) {
      const plots = rings(cell.plots!.coords, cell.plots!.offsets, cell.origin);
      expect(rectangular(unpackPoints(cell.ring, cell.origin))).toBe(true);
      expect(plots.every(rectangular)).toBe(true);
      for (const house of rings(cell.houses.coords, cell.houses.offsets, cell.origin))
        expect(plots.some(plot => pointInPolygon(polygonCentroid(house), plot))).toBe(true);
    }
    // Every district's lanes join a road.
    for (const district of Object.values(doc.fabric!.districts)) expect(district.mouths.length).toBeGreaterThan(0);
    expect(parseVectorDocument(serializeVectorDocument(doc))?.fabric).toEqual(doc.fabric);
  });

  it("keeps a hamlet of 200 to a single row along the first reach of its roads", () => {
    const doc = village(200, false);
    expect(doc.urban!.report.unplacedDwellings).toBe(0);
    const cells = Object.values(doc.fabric!.cells);
    expect(cells.some(c => c.id.includes(":t2:"))).toBe(false);
    const half = doc.frame.extentMeters / 2;
    for (const cell of cells)
      expect(unpackPoints(cell.ring, cell.origin).every(p => Math.abs(p[0]) < half && Math.abs(p[1]) < half)).toBe(
        true
      );
  });
});
