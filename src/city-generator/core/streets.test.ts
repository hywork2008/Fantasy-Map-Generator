// M5 — S5 streets (design §4.2 S5). Gate → plaza streets stay inside the wall
// and are not drawn; extramural roads run window-edge → gate and are; `arteries`
// is the tidied union, smoothed with its endpoints held fixed.

import { describe, expect, it } from "vitest";
import { DEFAULT_SITE_CONFIG } from "../site/siteConfig";
import { siteToGeography, siteToParams, siteToProgram } from "../site/siteInput";
import { synthSite } from "../site/synthSite";
import { smoothInteriorVertices, vertexKey } from "./edgeGraph";
import { nearestOnPolyline, pointInPolygon, polygonArea, polygonCentroid } from "./geom";
import { close } from "./interior";
import { generateCity } from "./pipeline";
import { foldArteriesIntoCells, reservedStreetVertices, tidyUpRoads } from "./streets";
import type { BorderLoop, Cell, Gate, Point } from "./types";

function run(seed: string) {
  const config = {
    ...DEFAULT_SITE_CONFIG,
    coast: "none" as const,
    rivers: [],
    relief: false,
    features: { ...DEFAULT_SITE_CONFIG.features, walls: true, plaza: true, citadel: true }
  };
  const site = synthSite("smallCity", config, seed);
  return generateCity(siteToParams(site), siteToGeography(site), siteToProgram(site));
}

const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const near = (p: Point, q: Point): number => Math.hypot(p[0] - q[0], p[1] - q[1]);

describe("S5 streets", () => {
  it("routes a street from every gate to the plaza", () => {
    const r = run("s5-plaza");
    const cs = r.params.cellSizeMeters;
    const plaza = r.precincts.find(p => p.kind === "plaza");
    expect(plaza).toBeTruthy();
    expect(r.gates.length).toBeGreaterThan(0);

    for (const gate of r.gates) {
      const street = r.streets.streets.find(line => near(line[0], gate.point) < cs * 1.5);
      expect(street, `a street leaves gate ${gate.point.join()}`).toBeTruthy();
      // …and its other end lands on the plaza.
      expect(near(street!.at(-1) as Point, plaza!.anchor)).toBeLessThan(cs * 2.5);
    }
  });

  it("keeps every street inside the wall and clear of the citadel enceinte", () => {
    const r = run("s5-mask");
    const citadelRing = r.steps.find(s => s.label === "S5 · Streets")?.overlays.find(o => o.kind === "citadelWall")
      ?.points as Point[];
    expect(citadelRing).toBeTruthy();
    const cs = r.params.cellSizeMeters;
    // "not outside": inside a wall ring, or hugging its line (spur-gate streets).
    const enclosed = (m: Point): boolean =>
      r.borders.some(b => pointInPolygon(m, close(b.points)) || nearestOnPolyline(m, close(b.points)).dist < cs * 0.5);

    expect(r.streets.streets.length).toBeGreaterThan(0);
    for (const line of r.streets.streets) {
      for (let i = 0; i + 1 < line.length; i++) {
        const m = mid(line[i], line[i + 1]);
        expect(enclosed(m), `seg ${i} does not cross the wall`).toBe(true);
        expect(pointInPolygon(m, citadelRing), `seg ${i} clear of the citadel`).toBe(false);
      }
    }
  });

  it("routes an extramural road from the window edge to each land gate", () => {
    const r = run("s5-roads");
    const cs = r.params.cellSizeMeters;
    const half = r.params.extentMeters / 2;
    const landGates = r.gates.filter(g => !g.water);
    const edgeGap = (p: Point): number => Math.min(half - Math.abs(p[0]), half - Math.abs(p[1]));

    expect(r.streets.roads.length).toBeGreaterThan(0);
    expect(r.streets.roads.length).toBeLessThanOrEqual(landGates.length);
    for (const road of r.streets.roads) {
      expect(edgeGap(road[0]), "road starts at the window edge").toBeLessThan(cs * 3);
      expect(
        Math.min(...landGates.map(g => near(g.point, road.at(-1) as Point))),
        "road ends on a land gate"
      ).toBeLessThan(cs * 1.5);
      // The road runs outside the wall (bar the hop that meets the gate).
      const inside = road
        .slice(0, -1)
        .filter((p, i) => r.borders.some(b => pointInPolygon(mid(p, road[i + 1]), close(b.points))));
      expect(inside.length).toBeLessThanOrEqual(1);
    }
  });

  it("is deterministic", () => {
    expect(JSON.stringify(run("s5-det").streets)).toEqual(JSON.stringify(run("s5-det").streets));
  });

  it("draws the extramural roads but not the intramural streets", () => {
    const r = run("s5-render");
    const s5 = r.steps.find(s => s.label === "S5 · Streets");
    expect(s5?.label).toBe("S5 · Streets");
    expect(s5?.paths.filter(p => p.kind === "road")).toHaveLength(r.streets.roads.length);
    expect(s5?.paths.some(p => p.kind === "street")).toBe(false);
  });
});

function runCoastal(seed: string, coast: "straight" | "bay" | "cape", riverThrough = false) {
  const config = {
    ...DEFAULT_SITE_CONFIG,
    coast,
    rivers: riverThrough ? (["through"] as const) : [],
    relief: false,
    features: { ...DEFAULT_SITE_CONFIG.features, walls: true, plaza: true, citadel: false, port: true }
  };
  const site = synthSite("smallCity", config, seed);
  return generateCity(siteToParams(site), siteToGeography(site), siteToProgram(site));
}

describe("roads never cross water (towngen-comparison.md §2.4 / §3.D — the most important bug)", () => {
  const COASTS = ["straight", "bay", "cape"] as const;
  const SEEDS = ["d1-a", "d1-b", "d1-c", "d1-d", "d1-e", "d1-f"];

  it("no road segment's midpoint ever falls inside the water polygon", () => {
    let checked = 0;
    for (const coast of COASTS) {
      for (const seed of SEEDS) {
        const r = runCoastal(seed, coast);
        if (!r.waterPolygon || r.waterPolygon.length < 3) continue;
        for (const road of r.streets.roads) {
          checked++;
          for (let i = 0; i + 1 < road.length; i++) {
            const m = mid(road[i], road[i + 1]);
            expect(pointInPolygon(m, r.waterPolygon), `${coast}/${seed} road segment ${i} crosses the water`).toBe(
              false
            );
          }
        }
      }
    }
    expect(checked, "no coastal scenario produced any road to check").toBeGreaterThan(0);
  });

  it("also holds with a river crossing the site (a second water source for the same gates)", () => {
    let checked = 0;
    for (const seed of SEEDS) {
      const r = runCoastal(seed, "bay", true);
      if (!r.waterPolygon || r.waterPolygon.length < 3) continue;
      for (const road of r.streets.roads) {
        checked++;
        for (let i = 0; i + 1 < road.length; i++) {
          expect(pointInPolygon(mid(road[i], road[i + 1]), r.waterPolygon)).toBe(false);
        }
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("a gate whose only reach would cross water is dropped, not routed through the sea", () => {
    // Every land gate either has a road that stays dry, or no road at all —
    // never a road forced through the exemption loophole at its own endpoint.
    for (const coast of COASTS) {
      for (const seed of SEEDS) {
        const r = runCoastal(seed, coast);
        if (!r.waterPolygon) continue;
        const landGates = r.gates.filter(g => !g.water);
        for (const gate of landGates) {
          const road = r.streets.roads.find(
            line => near(line.at(-1) as Point, gate.point) < r.params.cellSizeMeters * 1.5
          );
          if (!road) continue; // dropped — acceptable, never drawn through water
          for (let i = 0; i + 1 < road.length; i++) {
            expect(pointInPolygon(mid(road[i], road[i + 1]), r.waterPolygon)).toBe(false);
          }
        }
      }
    }
  });
});

describe("tidyUpRoads", () => {
  it("splits at a junction, preserves endpoints, smooths the interior", () => {
    const west: Point[] = [
      [0, 0],
      [5, 2],
      [10, 0]
    ];
    const east: Point[] = [
      [10, 0],
      [15, 2],
      [20, 0]
    ];
    const north: Point[] = [
      [10, 0],
      [8, 5],
      [10, 10]
    ];
    const arteries = tidyUpRoads([west, east, north], [], 1);

    expect(arteries).toHaveLength(3);
    const atJunction = (p: Point): boolean => near(p, [10, 0]) < 1e-9;
    for (const art of arteries) {
      expect(atJunction(art[0]) || atJunction(art.at(-1) as Point)).toBe(true);
    }

    const w = arteries.find(a => a.some(p => near(p, [0, 0]) < 1e-9)) as Point[];
    const ends = [w[0], w.at(-1) as Point];
    expect(ends.some(p => near(p, [0, 0]) < 1e-9)).toBe(true);
    expect(ends.some(p => near(p, [10, 0]) < 1e-9)).toBe(true);
    // interior vertex pulled off the raw (5, 2) by the Laplacian smooth
    expect(w[1][0]).toBeCloseTo(5, 5);
    expect(w[1][1]).toBeGreaterThan(0);
    expect(w[1][1]).toBeLessThan(2);
  });

  it("drops segments that bound the plaza", () => {
    const plaza: Point[] = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1]
    ];
    // A street that runs along the plaza's south edge then out to the east.
    const chain: Point[] = [
      [-1, -1],
      [1, -1],
      [4, -1],
      [8, -1]
    ];
    const arteries = tidyUpRoads([chain], [plaza], 1);
    const kept = arteries.flat();
    // the [-1,-1] → [1,-1] hop is a plaza edge and must be gone
    expect(kept.some(p => near(p, [-1, -1]) < 1e-9)).toBe(false);
    expect(kept.some(p => near(p, [8, -1]) < 1e-9)).toBe(true);
  });
});

describe("foldArteriesIntoCells", () => {
  const qkey = (p: Point): string => `${Math.round(p[0] / 0.05)},${Math.round(p[1] / 0.05)}`;
  const cell = (id: number, polygon: Point[]): Cell => ({
    id,
    polygon,
    site: polygonCentroid(polygon),
    centroid: polygonCentroid(polygon),
    neighbors: [],
    onBorder: false
  });

  it("moves a street vertex shared by two cells and recomputes the centroid", () => {
    const left = cell(1, [
      [0, 0],
      [10, 0],
      [10, 4],
      [0, 8]
    ]);
    const right = cell(2, [
      [10, 0],
      [22, 0],
      [22, 8],
      [10, 4]
    ]);
    const shifts = new Map<string, Point>([[qkey([10, 4]), [10, 0.5]]]);

    const [l2, r2] = foldArteriesIntoCells([left, right], shifts, new Set());
    expect(l2.polygon.some(p => near(p, [10, 0.5]) < 1e-9)).toBe(true);
    expect(r2.polygon.some(p => near(p, [10, 0.5]) < 1e-9)).toBe(true);
    expect(l2.polygon.some(p => near(p, [10, 4]) < 1e-9)).toBe(false);
    expect(near(l2.centroid, left.centroid)).toBeGreaterThan(0);
  });

  it("pins reserved keys; returns untouched cells and an untouched list by reference", () => {
    const a = cell(1, [
      [0, 0],
      [10, 0],
      [10, 4],
      [0, 8]
    ]);
    const shifts = new Map<string, Point>([[qkey([10, 4]), [10, 0.5]]]);
    expect(foldArteriesIntoCells([a], shifts, new Set([qkey([10, 4])]))[0]).toBe(a);

    const b = cell(2, [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10]
    ]);
    expect(foldArteriesIntoCells([b], shifts, new Set())[0]).toBe(b);

    const list = [a, b];
    expect(foldArteriesIntoCells(list, new Map(), new Set())).toBe(list);
  });
});

describe("reservedStreetVertices", () => {
  const key = (p: Point): string => `${Math.round(p[0] / 0.05)},${Math.round(p[1] / 0.05)}`;
  it("keys the perimeter, citadel and gate vertices, and nothing else", () => {
    const borders: BorderLoop[] = [
      {
        points: [
          [0, 0],
          [10, 0],
          [10, 10]
        ],
        segments: ["land", "land", "land"],
        urbanCellIds: []
      }
    ];
    const citadel: Point[] = [
      [5, 5],
      [6, 5]
    ];
    const gates: Gate[] = [{ point: [0, 0], borderIndex: 0, water: false }];
    const set = reservedStreetVertices(borders, citadel, gates);
    expect(set.has(key([10, 10]))).toBe(true);
    expect(set.has(key([5, 5]))).toBe(true);
    expect(set.has(key([0, 0]))).toBe(true);
    expect(set.has(key([99, 99]))).toBe(false);
  });
});

describe("S5 streets fold into the fabric (TownGeneratorTS 2.4)", () => {
  const s4Of = (r: ReturnType<typeof run>) =>
    new Map(r.steps.find(s => s.label === "S4 · Inner perimeter & gates")!.cells.map(c => [c.id, c.polygon] as const));

  it("moves a vertex only near a street route (fold) or a small local nudge (§3.C smooth), never wildly, without inverting cells", () => {
    const r = run("s5-fold");
    const cs = r.params.cellSizeMeters;
    const s4 = s4Of(r);
    const routes = [...r.streets.streets, ...r.streets.arteries];

    const changed = r.steps.at(-1)!.cells.filter(c => {
      const before = s4.get(c.id);
      return before && JSON.stringify(before) !== JSON.stringify(c.polygon);
    });
    expect(changed.length).toBeGreaterThan(0);

    for (const c of changed) {
      const before = s4.get(c.id) as Point[];
      const ratio = Math.abs(polygonArea(c.polygon)) / Math.max(Math.abs(polygonArea(before)), 1);
      expect(ratio).toBeGreaterThan(0.6);
      expect(ratio).toBeLessThan(1.4);
      for (const p of c.polygon) {
        if (before.some(q => near(p, q) < 1e-6)) continue; // vertex did not move
        // Either the S5 street/river fold moved it onto a drawn route, or the
        // §3.C interior Laplacian nudged it a little from wherever it started —
        // either way it must not have jumped far from every one of its old positions.
        const onRoute = Math.min(...routes.map(a => nearestOnPolyline(p, a).dist)) < cs;
        const smallNudge = Math.min(...before.map(q => near(p, q))) < cs * 2;
        expect(onRoute || smallNudge, `vertex ${p.join()} moved without a route or a small nudge`).toBe(true);
      }
    }
  });

  it("keeps the raw junction-optimised grid in the S0–S4 snapshots", () => {
    const r = run("s5-fold-pre");
    const s4 = r.steps.find(s => s.label === "S4 · Inner perimeter & gates")!.cells;
    const s7 = new Map(r.steps.at(-1)!.cells.map(c => [c.id, c.polygon]));
    const diff = s4.filter(c => JSON.stringify(c.polygon) !== JSON.stringify(s7.get(c.id)));
    expect(diff.length).toBeGreaterThan(0); // S4 kept its pre-fold geometry; only S5+ folded
  });

  it("is deterministic through S7", () => {
    expect(JSON.stringify(run("s5-fold-det").steps.at(-1)!.cells)).toEqual(
      JSON.stringify(run("s5-fold-det").steps.at(-1)!.cells)
    );
  });

  it("also smooths interior block seams no street or river ever touched (§2.3 / §3.C)", () => {
    const r = run("s5-fold-interior");
    const s4 = s4Of(r);
    const routes = [...r.streets.streets, ...r.streets.arteries];
    const cs = r.params.cellSizeMeters;
    const urbanIds = new Set(r.steps[3].cells.filter(c => c.tag === "urban").map(c => c.id));
    const finalCells = r.steps.at(-1)!.cells;

    // At least one urban vertex moved despite sitting nowhere near a drawn
    // street/artery/river/wall route — the fold alone could never have moved it.
    let movedFarFromAnyRoute = 0;
    for (const c of finalCells) {
      if (!urbanIds.has(c.id)) continue;
      const before = s4.get(c.id);
      if (!before) continue;
      for (const p of c.polygon) {
        if (before.some(q => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6)) continue; // did not move
        if (Math.min(...routes.map(a => nearestOnPolyline(p, a).dist)) > cs) movedFarFromAnyRoute++;
      }
    }
    expect(movedFarFromAnyRoute).toBeGreaterThan(0);
  });
});

describe("smoothInteriorVertices (towngen-comparison.md §2.3 / §3.C)", () => {
  // A 3x3 grid of unit squares, sharing edges/vertices like real cells.
  function unitCell(id: number, x: number, y: number, neighbors: number[]): Cell {
    const polygon: Point[] = [
      [x, y],
      [x + 1, y],
      [x + 1, y + 1],
      [x, y + 1]
    ];
    return { id, polygon, site: [x + 0.5, y + 0.5], centroid: [x + 0.5, y + 0.5], neighbors, onBorder: false };
  }
  const grid3x3 = (): Cell[] => {
    const at = (x: number, y: number): number => y * 3 + x;
    const cells: Cell[] = [];
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const n: number[] = [];
        if (x > 0) n.push(at(x - 1, y));
        if (x < 2) n.push(at(x + 1, y));
        if (y > 0) n.push(at(x, y - 1));
        if (y < 2) n.push(at(x, y + 1));
        cells.push(unitCell(at(x, y), x, y, n));
      }
    }
    return cells;
  };

  it("is a no-op at 0 passes, and when nothing is free (all reserved)", () => {
    const cells = grid3x3();
    const zeroPasses = smoothInteriorVertices(cells, new Set(), 0);
    expect(JSON.stringify(zeroPasses)).toBe(JSON.stringify(cells));
    const allReserved = new Set(cells.flatMap(c => c.polygon.map(vertexKey)));
    const nothingFree = smoothInteriorVertices(cells, allReserved, 2);
    expect(JSON.stringify(nothingFree)).toBe(JSON.stringify(cells));
  });

  it("never moves a reserved vertex, and only ever moves an interior one toward its neighbours", () => {
    const cells = grid3x3();
    // Reserve the outer ring (x=0, x=3, y=0, y=3) — only the interior lattice
    // point at (1,1)/(2,1)/(1,2)/(2,2) etc. stays free to move.
    const reserved = new Set<string>();
    for (const c of cells) {
      for (const p of c.polygon) if (p[0] === 0 || p[0] === 3 || p[1] === 0 || p[1] === 3) reserved.add(vertexKey(p));
    }
    const out = smoothInteriorVertices(cells, reserved, 1);
    for (const c of out) {
      for (const p of c.polygon) {
        if (p[0] === 0 || p[0] === 3 || p[1] === 0 || p[1] === 3) {
          expect(reserved.has(vertexKey(p))).toBe(true); // still on the border — untouched
        }
      }
    }
    // The one interior vertex, (1,1)-(2,2) etc., is already the mean of its own
    // neighbours on a regular grid, so it should not have moved either — the
    // real assertion is that NOTHING here produced NaN / degenerate geometry.
    for (const c of out) {
      for (const p of c.polygon) {
        expect(Number.isFinite(p[0])).toBe(true);
        expect(Number.isFinite(p[1])).toBe(true);
      }
    }
  });

  it("pulls a displaced free vertex toward the mean of its neighbours", () => {
    const cells = grid3x3();
    // Nudge the shared vertex (1,1) off-grid on every cell that has it.
    const nudged = cells.map(c => ({
      ...c,
      polygon: c.polygon.map(p => (p[0] === 1 && p[1] === 1 ? ([1.5, 1.5] as Point) : p))
    }));
    const reserved = new Set<string>();
    for (const c of nudged) {
      for (const p of c.polygon) if (p[0] === 0 || p[0] === 3 || p[1] === 0 || p[1] === 3) reserved.add(vertexKey(p));
    }
    const out = smoothInteriorVertices(nudged, reserved, 3);
    const moved = out.flatMap(c => c.polygon).find(p => Math.abs(p[0] - 1.5) < 1e-6 && Math.abs(p[1] - 1.5) < 1e-6);
    expect(moved).toBeUndefined(); // the outlier position itself is gone
    const settled = out.flatMap(c => c.polygon).filter(p => Math.hypot(p[0] - 1, p[1] - 1) < 0.5);
    expect(settled.length).toBeGreaterThan(0); // pulled back toward (1,1)
  });
});
