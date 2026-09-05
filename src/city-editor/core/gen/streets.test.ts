import { describe, expect, it } from "vitest";
import { MERGE_QUANTUM } from "./edgeGraph";
import { pointInPolygon, vecToAzimuth } from "./geom";
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

/** Sea as a north–south strip just east of the urban blob, covering x ∈ [20, 40]. */
function coastalTown(over: Partial<StreetInputs> = {}): StreetInputs {
  const _cells = grid(6, 6, SIZE, [-60, -60]);
  // i = 4 is x ∈ [20, 40] — a bay the east-facing gate would otherwise cut across.
  const sea = new Set<number>();
  for (let j = 0; j < 6; j++) sea.add(4 + j * 6);
  const waterPolygon: Point[] = [
    [20, -60],
    [40, -60],
    [40, 60],
    [20, 60]
  ];
  return townInputs({
    sea,
    waterPolygon,
    geo: {
      coast: {
        corridor: [
          [0, 0],
          [0, -80]
        ],
        waterAzimuthDeg: 180
      },
      rivers: [],
      roadBearings: [90]
    },
    ...over
  });
}

const mid = (a: Point, b: Point): Point => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

describe("buildStreets — Phase G2 sea hard bar and farNode modes", () => {
  it("with avoidSea, no road segment midpoint sits in the water polygon", () => {
    const result = buildStreets(coastalTown({ avoidSea: true }));
    for (const road of result.roads) {
      for (let i = 0; i + 1 < road.length; i++) {
        expect(pointInPolygon(mid(road[i], road[i + 1]), coastalTown().waterPolygon as Point[])).toBe(false);
      }
    }
  });

  it("with avoidSea false, a road is allowed to cut across the sea strip", () => {
    const wet = coastalTown({ avoidSea: false }).waterPolygon as Point[];
    const result = buildStreets(coastalTown({ avoidSea: false }));
    expect(result.roads.length).toBeGreaterThan(0);
    const crosses = result.roads.some(road =>
      road.some((p, i) => i + 1 < road.length && pointInPolygon(mid(p, road[i + 1]), wet))
    );
    expect(crosses).toBe(true);
  });

  it("A* never steps on a sea-cell vertex when avoidSea is on", () => {
    const input = coastalTown({ avoidSea: true });
    const result = buildStreets(input);
    const seaKeys = new Set<string>();
    for (const c of input.cells) {
      if (!input.sea.has(c.id)) continue;
      for (const v of c.polygon) seaKeys.add(qk(v));
    }
    for (const road of result.roads) {
      for (const p of road.slice(0, -1)) expect(seaKeys.has(qk(p))).toBe(false);
    }
  });

  it("farNode radial aims along the gate radius", () => {
    const result = buildStreets(townInputs({ farNode: "radial", avoidSea: false }));
    expect(result.roads.length).toBeGreaterThan(0);
    const far = result.roads[0][0];
    const gate = townInputs().gates[0].point;
    expect(vecToAzimuth(far[0] - gate[0], far[1] - gate[1])).toBeCloseTo(90, 0);
  });

  it("farNode descriptorEnd prefers the matching road-path end over radial", () => {
    const geo: CityGeography = {
      coast: null,
      rivers: [],
      roadBearings: [90],
      roadPaths: [
        [
          [0, 0],
          [80, 20]
        ]
      ]
    };
    const radial = buildStreets(townInputs({ farNode: "radial", avoidSea: false }));
    const result = buildStreets(townInputs({ farNode: "descriptorEnd", geo, avoidSea: false }));
    expect(result.roads.length).toBeGreaterThan(0);
    expect(radial.roads.length).toBeGreaterThan(0);
    const descFar = result.roads[0][0];
    const radialFar = radial.roads[0][0];
    // The descriptor road ends north of east, so the far vertex should sit
    // north of the purely radial (due-east) aim once both snap to the grid.
    expect(descFar[1]).toBeGreaterThan(radialFar[1]);
  });

  it("farNode manualBearings uses the given compass azimuth", () => {
    const result = buildStreets(townInputs({ farNode: "manualBearings", manualBearings: [0], avoidSea: false }));
    expect(result.roads.length).toBeGreaterThan(0);
    const far = result.roads[0][0];
    const gate = townInputs().gates[0].point;
    expect(vecToAzimuth(far[0] - gate[0], far[1] - gate[1])).toBeCloseTo(0, 0);
  });
});
