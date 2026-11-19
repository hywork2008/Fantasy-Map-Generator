import { describe, expect, it } from "vitest";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import type { PlotFabric } from "../../../types/contracts/burgage";
import type { VectorCityDocument } from "../../../types/vector/document";
import { defaultGenerationSettings } from "../../generation/settings";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { prepareVectorEdit, reconcileVectorEdit } from "../editing/dependencies";
import { replaceVectorPath } from "../editing/paths";
import { unpackPoints } from "../fabric/pack";
import { regionArea, regionBoolean } from "../geometry/regions";
import { samplePath } from "../geometry/sampling";
import { pathSurface } from "../geometry/surfaces";
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

describe("burgage plots in the meshless CE (docs/plan/ce-burgage-plot-fabric.md B2, B3, B5, §8.7)", () => {
  it("houses everyone on plots recorded with their street blocks, and keeps them through a save", () => {
    const doc = town("burgage");
    expect(doc.urban!.algorithm).toBe("vector-urban-v52");
    expect(doc.fabric!.algorithm).toBe("vector-urban-v52");
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
    // A shop-house and its rear works (ce-town-trade-rear-works.md R2) are one facility on one parcel, split between them.
    const all = Object.values(doc.placements).filter(
        p => p.building?.kind === "facility" && p.origin === "automatic" && !p.building.annexOf
      ),
      annex = new Map(
        Object.values(doc.placements)
          .filter(p => p.building?.annexOf)
          .map(p => [p.building!.annexOf!, p])
      ),
      parcel = (p: (typeof all)[number]) => [p.site, ...(annex.has(p.id) ? [annex.get(p.id)!.site] : [])];
    expect(all.length).toBeGreaterThan(50);
    expect(annex.size).toBeGreaterThan(5);
    for (const cell of Object.values(doc.fabric!.cells)) {
      if (!cell.plots) continue;
      const plots = rings(cell.plots.coords, cell.plots.offsets, cell.origin);
      const under = all.map(f =>
        plots.filter(plot => parcel(f).some(site => pointInPolygon(polygonCentroid(plot), site.outer)))
      );
      for (const [k, taken] of under.entries()) {
        // The tanners' row is reserved on the bank, not on plots.
        if (!taken.length || all[k].modelId.includes("wet-tannery")) continue;
        // The parcel is its plots whole: one to four of them, nothing more.
        expect(taken.length).toBeLessThanOrEqual(4);
        const area = taken.reduce((n, plot) => n + Math.abs(polygonArea(plot)), 0);
        expect(Math.abs(parcel(all[k]).reduce((n, site) => n + regionArea(site), 0) - area)).toBeLessThan(
          area * 0.02 + 1
        );
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

  it("packs a walled town on dense burgage: halved plots, yards built over, as close as compact lots (plan §8.7)", () => {
    const cover = (doc: VectorCityDocument) => {
      let land = 0,
        built = 0;
      for (const cell of Object.values(doc.fabric!.cells)) {
        if (!cell.inside) continue;
        land += Math.abs(polygonArea(unpackPoints(cell.ring, cell.origin)));
        built += rings(cell.houses.coords, cell.houses.offsets, cell.origin).reduce(
          (n, h) => n + Math.abs(polygonArea(h)),
          0
        );
      }
      return built / land;
    };
    const dense = town("burgage-dense", 5000),
      compact = town("compact", 5000);
    expect(dense.fabric!.algorithm).toBe("vector-urban-v53");
    expect(dense.urban!.report.unplacedDwellings).toBe(0);
    expect(cover(dense)).toBeGreaterThan(cover(compact) * 0.8);
    // Inside the wall the plots are halved: most are narrower than the burgage option's narrowest (5 m).
    const widths = Object.values(dense.fabric!.cells)
      .filter(c => c.inside && c.plots)
      .flatMap(c =>
        c.plots!.offsets.map((_, i) => {
          const [a, b] = unpackPoints(c.plots!.fronts, c.origin, i * 2, i * 2 + 2);
          return Math.hypot(b[0] - a[0], b[1] - a[1]);
        })
      )
      .sort((a, b) => a - b);
    expect(widths[Math.floor(widths.length / 2)]).toBeLessThan(5);
  });

  it("keeps every street block and every row of a dense burgage town to more than its facilities", () => {
    const doc = town("burgage-dense", 2000, true);
    expect(doc.urban!.report.unplacedDwellings).toBe(0);
    expect(doc.urban!.report.placedFacilities / doc.urban!.report.requiredFacilities).toBeGreaterThan(0.75);
    const facilities = Object.values(doc.placements).filter(
      p => p.building?.kind === "facility" && p.origin === "automatic" && !p.modelId.includes("wet-tannery")
    );
    for (const cell of Object.values(doc.fabric!.cells)) {
      if (!cell.plots || !cell.inside) continue;
      const ring = unpackPoints(cell.ring, cell.origin);
      if (facilities.some(f => pointInPolygon(f.position, ring))) expect(cell.houses.offsets.length).toBeGreaterThan(0);
    }
  });

  it("leaves compact street blocks as they were", () => {
    const doc = town("compact");
    expect(doc.fabric!.algorithm).toBe("vector-urban-v51");
    expect(Object.values(doc.fabric!.cells).some(c => c.plots)).toBe(false);
  });

  it("keeps a walled town with its facilities through a road edit, each rear works with its house", () => {
    // Without a river no wet tannery finds its row; an edit keeps the row and must report them still (2026-11-19).
    const source = town("burgage-dense", 2000, true),
      road = Object.values(source.paths).find(p => p.id.startsWith("auto-approach"))!,
      path = structuredClone(road);
    path.width.leftMeters += 2;
    path.width.rightMeters += 2;
    const { document: doc } = reconcileVectorEdit(source, replaceVectorPath(prepareVectorEdit(source), path)),
      report = doc.urban!.report;
    expect(report.placedFacilities + report.unplacedFacilities.length).toBe(report.requiredFacilities);
    expect(report.unplacedFacilities.filter(f => f.id.includes(":tanning:")).length).toBeGreaterThan(0);
    const rears = Object.values(doc.placements).filter(p => p.building?.annexOf);
    expect(rears.length).toBeGreaterThan(5);
    for (const rear of rears) expect(doc.placements[rear.building!.annexOf!]?.building?.kind).toBe("facility");
  });

  it("lays the ropewalks behind the row facing the roads out of the gates, off the glacis, an inland town's 180 m long (ce-outskirts-workshop-sizes.md S1, §8.9)", () => {
    const doc = town("burgage-dense", 5000, true),
      walks = Object.values(doc.placements).filter(p => p.modelId.startsWith("trade-workshop.dedicated-ropewalk"));
    expect(walks.map(w => w.modelId)).toEqual([
      "trade-workshop.dedicated-ropewalk-180",
      "trade-workshop.dedicated-ropewalk-180"
    ]);
    expect(doc.urban!.report.unplacedFacilities.filter(f => f.id.includes(":ropemaking:"))).toEqual([]);
    const roads = Object.values(doc.paths).filter(p => p.role === "road"),
      walls = Object.values(doc.paths).filter(p => p.role === "wall");
    for (const walk of walks) {
      // Its door joined to a road, its ground clear of every road and outside the wall.
      expect(walk.building!.entrances[0].accessIndex).toBe(0);
      expect(roads.some(r => r.id === walk.accesses[0].pathId)).toBe(true);
      for (const road of roads)
        expect(
          regionBoolean([walk.site], [pathSurface(road)], "intersection").reduce((n, r) => n + regionArea(r), 0)
        ).toBeLessThan(1e-5);
      for (const wall of walls) {
        const line = samplePath(wall).map(q => q.point);
        expect(Math.min(...walk.site.outer.map(q => nearestOnPolyline(q, line).dist))).toBeGreaterThan(10);
      }
      // The walk itself stands back behind the road's frontage, its lane alone reaching the road.
      const road = samplePath(doc.paths[walk.accesses[0].pathId]).map(q => q.point);
      expect(Math.min(...walk.building!.footprint[0].outer.map(q => nearestOnPolyline(q, road).dist))).toBeGreaterThan(
        20
      );
    }
  });

  it("keeps coopers and horse mills in town, the kiln works apart beyond the roadside houses (ce-outskirts-workshop-sizes.md §8.14, §8.15)", () => {
    const doc = town("burgage-dense", 5000, true),
      wall = Object.values(doc.paths).find(p => p.role === "wall" && !p.id.includes("inner"))!,
      ring = samplePath(wall).map(q => q.point),
      placements = Object.values(doc.placements);
    const inTown = placements.filter(p => /dedicated-(cooperage|horse-mill)$/.test(p.modelId));
    expect(inTown.length).toBe(7);
    for (const p of inTown) expect(pointInPolygon(p.position, ring)).toBe(true);
    const kilns = placements.filter(p => p.building?.districtId === "edge-works");
    expect(kilns.map(p => p.modelId).sort()).toEqual([
      ...Array(4).fill("potters-workshop"),
      ...Array(4).fill("trade-workshop.dedicated-lime-tile-yard")
    ]);
    for (const [i, a] of kilns.entries()) {
      expect(pointInPolygon(a.position, ring)).toBe(false);
      for (const b of kilns.slice(i + 1))
        expect(Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1])).toBeGreaterThanOrEqual(60);
    }
  });
});
