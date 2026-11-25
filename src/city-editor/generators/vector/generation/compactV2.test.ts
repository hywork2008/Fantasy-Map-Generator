import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { vectorRenderData } from "../../../renderers/vector/renderData";
import { parseVectorDocument, serializeVectorDocument } from "../../../services/io/vector/documentCodec";
import type { PlotFabric } from "../../../types/contracts/burgage";
import type { VectorCityDocument } from "../../../types/vector/document";
import { withoutHolesNatural } from "../../compactV2";
import { defaultGenerationSettings } from "../../generation/settings";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "../../geom";
import { defaultPopulationSettings } from "../../populationPlan";
import { cellHouseCount, cellHouseRing, unpackLine, unpackPoints } from "../fabric/pack";
import { regionArea, regionBoolean } from "../geometry/regions";
import { vectorInputFromEditor } from "./editorInput";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "./pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "./urban";
import { vectorWallChoice } from "./wallShape";

function generateTown(
  plotFabric: PlotFabric,
  population = 2000,
  facilities = false,
  seed = "compact-v2-seed",
  compactBlockScale?: number
): VectorCityDocument {
  const settings = {
    ...defaultGenerationSettings(),
    wallShape: "polygon" as const,
    plotFabric,
    ...(facilities ? { facilityLayout: "population" as const } : {})
  };
  settings.config = {
    ...settings.config,
    features: { ...settings.config.features, walls: true, port: false, shanty: false }
  };
  settings.population = defaultPopulationSettings(population);
  const input = vectorInputFromEditor({
      settings,
      seed,
      frame: { extentMeters: 1200, cityRadiusMeters: 250, blockSizeMeters: 50 },
      lotOccupancy: 1
    }),
    wall = vectorWallChoice(settings, seed, input.context.historicalPeriod ?? "ageOfExploration"),
    skeleton = generateVectorSkeleton(input, { ...DEFAULT_VECTOR_GENERATION, seed, ...wall }).document;
  return generateVectorUrban(skeleton, {
    ...DEFAULT_VECTOR_URBAN,
    mode: facilities ? "medieval-facilities" : "medieval",
    population,
    plotFabric,
    ...(compactBlockScale ? { compactBlockScale } : {})
  });
}

describe("compact-v2 and compact-medium-v2 (docs/plan/ce-meshless-compact-block-improvements.md)", () => {
  it("cuts a block with holes along the shortest line to a fronting road rather than always vertically", () => {
    const outer: [number, number][] = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100]
    ];
    // Hole near the east edge (x = 80..90), far from north/south edges (y = 45..55).
    const hole: [number, number][] = [
      [80, 45],
      [90, 45],
      [90, 55],
      [80, 55]
    ];
    const parts = withoutHolesNatural({
      id: "b0",
      outer,
      holes: [hole],
      areaMeters2: 10000 - 100,
      frontage: [{ pathId: "road:east", from: [100, 0], to: [100, 100], lengthMeters: 100 }],
      reachable: true
    });
    expect(parts.length).toBeGreaterThanOrEqual(1);
    expect(parts.every(p => p.holes.length === 0)).toBe(true);
    // The shortest cut goes horizontally to the east road (y around 45..55, x = 90..100), not vertically to y=0/100.
    const hasEastCut = parts.some(p => p.outer.some(([x, y]) => x > 99.5 && y > 40 && y < 60));
    const hasNorthSouthSlit = parts.some(p => p.outer.some(([x, y]) => x > 84 && x < 86 && (y < 0.5 || y > 99.5)));
    expect(hasEastCut).toBe(true);
    expect(hasNorthSouthSlit).toBe(false);
  });

  it("generates valid compact-v2 and compact-medium-v2 towns with backyard plots and keeps serialization intact", () => {
    const c2 = generateTown("compact-v2", 2000, false);
    const m2 = generateTown("compact-medium-v2", 2000, false);
    expect(c2.urban!.algorithm).toBe("vector-urban-v67");
    expect(c2.fabric!.algorithm).toBe("vector-urban-v67");
    expect(m2.urban!.algorithm).toBe("vector-urban-v68");
    expect(m2.fabric!.algorithm).toBe("vector-urban-v68");
    expect(c2.urban!.report.unplacedDwellings).toBe(0);
    expect(m2.urban!.report.unplacedDwellings).toBe(0);
    // Medium-block v2 converts block cores into backyard plots or entry-lane courtyards.
    const m2PlotCells = Object.values(m2.fabric!.cells).filter(c => c.inside && (c.plots?.offsets.length ?? 0) > 0);
    expect(m2PlotCells.length).toBeGreaterThan(0);
    expect(parseVectorDocument(serializeVectorDocument(c2))?.fabric).toEqual(c2.fabric);
    expect(parseVectorDocument(serializeVectorDocument(m2))?.fabric).toEqual(m2.fabric);
    expect(vectorRenderData(c2).warnings).toEqual([]);
    expect(vectorRenderData(m2).warnings).toEqual([]);
  });

  it("prevents facility-only street blocks inside the wall on compact-v2 and compact-medium-v2", () => {
    for (const fabric of ["compact-v2", "compact-medium-v2"] as const) {
      const doc = generateTown(fabric, 2000, true);
      const r = doc.urban!.report;
      expect(r.unplacedDwellings).toBe(0);
      expect(r.placedFacilities / r.requiredFacilities).toBeGreaterThan(0.75);
      const facilities = Object.values(doc.placements).filter(
        p => p.building?.kind === "facility" && p.origin === "automatic" && !p.modelId.includes("wet-tannery")
      );
      let facilityOnly = 0;
      for (const cell of Object.values(doc.fabric!.cells)) {
        if (!cell.inside) continue;
        const ring = unpackPoints(cell.ring, cell.origin);
        if (facilities.some(f => pointInPolygon(f.position, ring)) && cellHouseCount(cell) === 0) facilityOnly++;
      }
      expect(facilityOnly).toBe(0);
      expect(vectorRenderData(doc).warnings).toEqual([]);
    }
  });

  it("supports custom compactBlockScale and keeps merged facility parcels valid at 5,000 pop", () => {
    const scaled = generateTown("compact-medium-v2", 2000, false, "compact-v2-seed", 1.8);
    expect(scaled.urban!.algorithm).toBe("vector-urban-v68");
    expect(scaled.urban!.settings.compactBlockScale).toBe(1.8);
    expect(scaled.urban!.report.unplacedDwellings).toBe(0);
    expect(vectorRenderData(scaled).warnings).toEqual([]);

    // Regression: merged facility parcels on compact-medium-v2 at 5,000 pop must never violate urban-footprint.
    const town5k = generateTown("compact-medium-v2", 5000, true, "ab-bench-seed");
    expect(town5k.urban!.report.unplacedDwellings).toBe(0);
    expect(town5k.urban!.report.placedFacilities).toBe(town5k.urban!.report.requiredFacilities);
    expect(vectorRenderData(town5k).warnings).toEqual([]);
  });

  it.skipIf(!process.env.BENCH_COMPACT_V2)(
    "benchmarks compact vs compact-v2 and compact-medium vs compact-medium-v2 across 2k-20k",
    () => {
      const lineLen = (pts: [number, number][]) =>
        pts.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
      const measure = (plotFabric: PlotFabric, population: number, facilities: boolean) => {
        const t0 = performance.now();
        const doc = generateTown(plotFabric, population, facilities, "ab-bench-seed");
        const ms = Math.round(performance.now() - t0);
        const kb = Math.round(serializeVectorDocument(doc).length / 1024);
        const cells = Object.values(doc.fabric!.cells).filter(c => c.inside);
        let land = 0,
          built = 0,
          lanes = 0,
          _laneM = 0,
          plotCells = 0,
          plots = 0,
          houses = 0,
          perimTotal = 0,
          perimCovered = 0,
          shortSides = 0,
          shortBlind = 0;
        for (const c of cells) {
          const ring = unpackPoints(c.ring, c.origin);
          land += Math.abs(polygonArea(ring));
          lanes += c.lanes.offsets.length;
          for (let i = 0; i < c.lanes.offsets.length; i++) _laneM += lineLen(unpackLine(c.lanes, i, c.origin));
          const n = cellHouseCount(c);
          houses += n;
          const hrs: [number, number][][] = [];
          const doors: [number, number][] = [];
          for (let i = 0; i < n; i++) {
            const h = cellHouseRing(c, i);
            hrs.push(h);
            built += Math.abs(polygonArea(h));
            const ex = c.origin[0] + c.houses.entrances[4 * i] * 0.01,
              ey = c.origin[1] + c.houses.entrances[4 * i + 1] * 0.01;
            doors.push([ex, ey]);
          }
          if (c.plots?.offsets.length) {
            plotCells++;
            plots += c.plots.offsets.length;
          }
          // Measure perimeter street-frontage coverage and short-side blind-wall rate (Task B).
          const edges: { a: [number, number]; b: [number, number]; len: number }[] = [];
          for (let i = 0; i < ring.length; i++) {
            const a = ring[i],
              b = ring[(i + 1) % ring.length],
              len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (len > 0.5) edges.push({ a, b, len });
          }
          const maxEdge = Math.max(0, ...edges.map(e => e.len));
          for (const e of edges) {
            perimTotal += e.len;
            const samples = Math.max(2, Math.ceil(e.len / 2));
            let hit = 0;
            for (let s = 0; s < samples; s++) {
              const t = (s + 0.5) / samples,
                q: [number, number] = [e.a[0] + (e.b[0] - e.a[0]) * t, e.a[1] + (e.b[1] - e.a[1]) * t];
              if (hrs.some(h => nearestOnPolyline(q, [...h, h[0]]).dist < 2.2)) hit++;
            }
            perimCovered += (e.len * hit) / samples;
            if (n >= 2 && e.len >= 10 && e.len <= 35 && e.len < maxEdge * 0.78) {
              shortSides++;
              const hasDoor = doors.some(d => nearestOnPolyline(d, [e.a, e.b]).dist < 2.5);
              if (!hasDoor) shortBlind++;
            }
          }
        }
        const facilityPlacements = Object.values(doc.placements).filter(
          p => p.building?.kind === "facility" && p.origin === "automatic" && !p.modelId.includes("wet-tannery")
        );
        let facOnly = 0;
        for (const c of cells) {
          const ring = unpackPoints(c.ring, c.origin);
          if (facilityPlacements.some(f => pointInPolygon(f.position, ring)) && cellHouseCount(c) === 0) facOnly++;
        }
        const r = doc.urban!.report;
        const inShare = Math.round((r.capacityInside / Math.max(1, r.capacityInside + r.capacityOutside)) * 1000) / 10;
        return {
          fabric: plotFabric,
          pop: population,
          fac: facilities ? `${r.placedFacilities}/${r.requiredFacilities}` : "-",
          facOnly,
          unplaced: r.unplacedDwellings,
          inPct: inShare,
          houses,
          coverPct: Math.round((built / Math.max(1, land)) * 1000) / 10,
          frontPct: Math.round((perimCovered / Math.max(1, perimTotal)) * 1000) / 10,
          shortBlindPct: shortSides ? Math.round((shortBlind / shortSides) * 1000) / 10 : 0,
          lanes,
          plotCells,
          plots,
          ms,
          kb
        };
      };
      const rows = [];
      for (const [pop, fac] of [
        [2000, false],
        [2000, true],
        [5000, false],
        [5000, true],
        [10000, false],
        [20000, false]
      ] as [number, boolean][]) {
        for (const f of ["compact", "compact-v2", "compact-medium", "compact-medium-v2"] as PlotFabric[]) {
          try {
            rows.push(measure(f, pop, fac));
          } catch (err) {
            console.error(`FAILED case fabric=${f} pop=${pop} fac=${fac}:`, err);
            throw err;
          }
        }
      }
      console.table(rows);
    },
    120_000
  );
});
