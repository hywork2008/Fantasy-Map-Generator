import { describe, expect, it } from "vitest";
import { MERGE_QUANTUM } from "./edgeGraph";
import { buildStreets, type StreetInputs } from "./streets";
import type { Cell, CityGeography, Point } from "./types";

const GEO: CityGeography = { coast: null, rivers: [], roadBearings: [90] };
const SIZE = 20;
const HALF = 80;

function square(id: number, x: number, y: number, s: number): Cell {
  const polygon: Point[] = [
    [x, y],
    [x + s, y],
    [x + s, y + s],
    [x, y + s]
  ];
  return {
    id,
    site: [x + s / 2, y + s / 2],
    polygon,
    centroid: [x + s / 2, y + s / 2],
    neighbors: [],
    onBorder: false
  };
}

function grid(nx: number, ny: number, s: number, origin: Point): Cell[] {
  const cells: Cell[] = [];
  let id = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) cells.push(square(id++, origin[0] + i * s, origin[1] + j * s, s));
  }
  return cells;
}

const qk = (p: Point): string => `${Math.round(p[0] / MERGE_QUANTUM)},${Math.round(p[1] / MERGE_QUANTUM)}`;

function undirectedPairs(line: Point[]): Set<string> {
  const set = new Set<string>();
  for (let i = 0; i + 1 < line.length; i++) {
    const a = qk(line[i]);
    const b = qk(line[i + 1]);
    if (a === b) continue;
    set.add(a < b ? `${a}~${b}` : `${b}~${a}`);
  }
  return set;
}

function usesPairs(lines: Point[][], banned: Set<string>): boolean {
  for (const line of lines) for (const key of undirectedPairs(line)) if (banned.has(key)) return true;
  return false;
}

/** 6×6 squares covering [-60, 60]². Inner 2×2 around the origin is urban. */
function townInputs(over: Partial<StreetInputs> = {}): StreetInputs {
  const cells = grid(6, 6, SIZE, [-60, -60]);
  const urban = new Set<number>([14, 15, 20, 21]); // i=2,3 × j=2,3
  return {
    cells,
    urban,
    sea: new Set(),
    waterPolygon: null,
    borders: [
      {
        points: [
          [20, -20],
          [20, 20],
          [-20, 20],
          [-20, -20]
        ],
        segments: ["land", "land", "land", "land"],
        urbanCellIds: [...urban]
      }
    ],
    gates: [{ point: [20, 0], borderIndex: 0, water: false }],
    precincts: [{ kind: "plaza", cellIds: [14], anchor: [0, 0], label: "Plaza" }],
    citadelOutline: null,
    geo: GEO,
    cellSizeMeters: SIZE,
    halfExtentMeters: HALF,
    ...over
  };
}

describe("buildStreets — Phase G7 river-edge hard bar", () => {
  it("with no rivers, still routes at least one road on the test town", () => {
    const result = buildStreets(townInputs());
    expect(result.roads.length).toBeGreaterThan(0);
  });

  it("roads and streets never occupy a walked river edge", () => {
    const open = buildStreets(townInputs());
    expect(open.roads.length).toBeGreaterThan(0);
    const river = open.roads[0];
    const banned = undirectedPairs(river);
    const blocked = buildStreets(townInputs({ rivers: [river] }));
    expect(usesPairs(blocked.roads, banned)).toBe(false);
    expect(usesPairs(blocked.streets, banned)).toBe(false);
  });

  it("hard-bars the first hop off a gate that sits on a river vertex (not a weight)", () => {
    const open = buildStreets(townInputs());
    const road = open.roads[0];
    expect(road.length).toBeGreaterThan(1);
    // Road polylines run far → gate; the last hop is the radial stub onto the gate.
    const stub: Point[] = [road[road.length - 2], road[road.length - 1]];
    const banned = undirectedPairs(stub);
    expect(banned.size).toBeGreaterThan(0);
    const blocked = buildStreets(townInputs({ rivers: [stub] }));
    expect(usesPairs(blocked.roads, banned)).toBe(false);
  });

  it("drops the road when every cell-edge of the town is a river (no fallback walk)", () => {
    const cells = townInputs().cells;
    const rivers: Point[][] = cells.map(c => [...c.polygon, c.polygon[0]]);
    const blocked = buildStreets(townInputs({ rivers }));
    expect(blocked.roads).toEqual([]);
    expect(blocked.streets).toEqual([]);
  });

  it("is a no-op on the network when rivers is empty (regression vs pre-G7)", () => {
    const a = buildStreets(townInputs());
    const b = buildStreets(townInputs({ rivers: [] }));
    expect(b).toEqual(a);
  });
});
