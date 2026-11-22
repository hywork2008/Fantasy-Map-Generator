import { describe, expect, it } from "vitest";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import type { Point } from "../../../types/primitives";
import type { VectorCityDocument } from "../../../types/vector/document";
import { defaultGenerationSettings } from "../../generation/settings";
import { nearestOnPolyline, pointInPolygon, polygonCentroid } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { unpackPoints } from "../fabric/pack";
import { regionArea } from "../geometry/regions";
import { vectorInputFromEditor } from "./editorInput";
import { vectorCountryside } from "./forest";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

/** A standalone village; the walls asked for are ignored (plan §4.3). */
function village(
  population: number,
  river: boolean,
  options: { seed?: string; facilities?: boolean } = {}
): VectorCityDocument {
  const seed = options.seed ?? "roadside-village",
    settings = {
      ...defaultGenerationSettings(),
      plotFabric: "burgage-village" as const,
      ...(options.facilities ? { facilityLayout: "population" as const } : {})
    };
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
    mode: options.facilities ? "medieval-facilities" : "medieval",
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

describe("roadside village (docs/plan/ce-meshless-roadside-burgage-village.md V2, V3)", () => {
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
      // Single-storey homes of one household each, and barns that house no one (plan §14.2).
      expect(cell.houses.storeys.every(n => n === 1)).toBe(true);
      expect(cell.houses.dwellings.every(n => n === 0 || n === 1)).toBe(true);
    }
    const dwellings = cells.flatMap(c => c.houses.dwellings);
    expect(dwellings.filter(n => n === 1).length).toBe(doc.urban!.report.requiredDwellings);
    expect(dwellings.some(n => n === 0)).toBe(true);
    // A barn stands in its toft's yard behind the house's line, not on the street front with its blank gable.
    for (const cell of cells) {
      const plots = rings(cell.plots!.coords, cell.plots!.offsets, cell.origin),
        fronts = plots.map((_, k) => unpackPoints(cell.plots!.fronts, cell.origin, 2 * k, 2 * k + 2)),
        houses = rings(cell.houses.coords, cell.houses.offsets, cell.origin);
      const reach = (ring: Point[], k: number) => ring.map(p => nearestOnPolyline(p, fronts[k]).dist);
      cell.houses.dwellings.forEach((d, i) => {
        if (d !== 0) return;
        const k = plots.findIndex(plot => pointInPolygon(polygonCentroid(houses[i]), plot)),
          home = houses.findIndex(
            (h, j) => cell.houses.dwellings[j] === 1 && pointInPolygon(polygonCentroid(h), plots[k])
          );
        expect(Math.min(...reach(houses[i], k))).toBeGreaterThan(Math.max(...reach(houses[home], k)));
      });
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

  // Plan V5: the village's workshops stand on its tofts, its smiths at its ends, its tanners by the river.
  it("puts a village's workshops on its tofts", () => {
    const doc = village(1000, true, { facilities: true }),
      report = doc.urban!.report;
    expect(report.unplacedDwellings).toBe(0);
    expect(report.placedFacilities).toBeGreaterThanOrEqual(0.8 * report.requiredFacilities);
    const facilities = doc
      .urban!.ownedPlacements.map(id => doc.placements[id])
      .filter(p => p?.building?.kind === "facility");
    expect(facilities.some(p => p.modelId.includes("tannery"))).toBe(true);
    // Each workshop stands on the tofts of one roadside block.
    const plots = Object.values(doc.fabric!.cells).flatMap(c => rings(c.plots!.coords, c.plots!.offsets, c.origin));
    for (const p of facilities.filter(p => !p.modelId.includes("tannery")))
      expect(plots.some(plot => pointInPolygon(p.position, plot))).toBe(true);
  });

  it("lays a street green on one road of some villages, its lawns before the tofts", () => {
    const doc = village(500, false, { seed: "green-village" }),
      green = doc.urban!.parks?.find(p => p.id === "village-green");
    expect(green?.lawns.length).toBeGreaterThan(0);
    const plots = Object.values(doc.fabric!.cells).flatMap(c => rings(c.plots!.coords, c.plots!.offsets, c.origin));
    for (const lawn of green!.lawns)
      expect(plots.some(plot => pointInPolygon(polygonCentroid(lawn as Point[]), plot))).toBe(false);
    expect(doc.urban!.report.unplacedDwellings).toBe(0);
  });

  // Plan V6: the countryside round the village is all farmed; no piece pinched between its blocks is lost.
  it("farms all the countryside round a village", () => {
    const doc = village(1000, true, { seed: "e", facilities: true }),
      zones = doc.environment!.landUse!.zones.reduce((n, z) => n + z.areaM2, 0),
      countryside = vectorCountryside(doc, doc.urban!.domain).reduce((n, r) => n + regionArea(r), 0);
    // Slivers under the zones' 400 m² floor go to no use; nothing larger is lost (V6 lost 5% of it).
    expect(zones).toBeGreaterThan(countryside * 0.999);
  });

  it("refuses a village of more than 1,000 people: it is a town", () => {
    expect(() => village(1001, false)).toThrow("urban-village-population");
  });
});
