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

/** 10×10 squares covering [-100, 100]². Inner 6×6 is urban. Four NESW gates. */
function walledTown(over: Partial<StreetInputs> = {}): StreetInputs {
  const s = 20;
  const cells = grid(10, 10, s, [-100, -100]);
  const urban = new Set<number>();
  for (let j = 2; j < 8; j++) for (let i = 2; i < 8; i++) urban.add(j * 10 + i);
  const border = [
    [60, -60],
    [60, 60],
    [-60, 60],
    [-60, -60]
  ] as Point[];
  return {
    cells,
    urban,
    sea: new Set(),
    waterPolygon: null,
    borders: [{ points: border, segments: ["land", "land", "land", "land"], urbanCellIds: [...urban] }],
    gates: [
      { point: [60, 0], borderIndex: 0, water: false },
      { point: [-60, 0], borderIndex: 0, water: false },
      { point: [0, 60], borderIndex: 0, water: false },
      { point: [0, -60], borderIndex: 0, water: false }
    ],
    precincts: [{ kind: "plaza", cellIds: [44, 45, 54, 55], anchor: [0, 0], label: "Plaza" }],
    citadelOutline: null,
    geo: { coast: null, rivers: [], roadBearings: [0, 90, 180, 270] },
    cellSizeMeters: s,
    halfExtentMeters: 800,
    ...over
  };
}

describe("buildStreets — intramural through-axes, ribs, and ring", () => {
  it("keeps Tiny maps as a gate-to-plaza star", () => {
    const result = buildStreets(townInputs());
    expect(result.streets).toHaveLength(1);
    const street = result.streets[0];
    expect(nearPoint(street[0], [20, 0]) || nearPoint(street[street.length - 1], [20, 0])).toBe(true);
    expect(nearPoint(street[0], [0, 0], 25) || nearPoint(street[street.length - 1], [0, 0], 25)).toBe(true);
  });

  it("routes Small+ opposite gates through the town instead of only to the plaza", () => {
    const result = buildStreets(walledTown());
    expect(result.streets.length).toBeGreaterThan(4);
    const through = result.streets.filter(street => {
      const a = street[0],
        b = street[street.length - 1];
      const gates = walledTown().gates.map(g => g.point);
      const hits = gates.filter(g => nearPoint(a, g, 12) || nearPoint(b, g, 12));
      return hits.length >= 2 && Math.hypot(a[0] - b[0], a[1] - b[1]) > 80;
    });
    expect(through.length).toBeGreaterThanOrEqual(2);
    const eastWest = through.some(street => Math.abs(street[0][1]) < 25 && Math.abs(street.at(-1)![1]) < 25);
    const northSouth = through.some(street => Math.abs(street[0][0]) < 25 && Math.abs(street.at(-1)![0]) < 25);
    expect(eastWest && northSouth).toBe(true);
  });

  it("adds a wall-hugging ring between consecutive gates", () => {
    const result = buildStreets(walledTown());
    const ring = result.streets.filter(street => {
      const a = street[0],
        b = street[street.length - 1];
      const gates = walledTown().gates.map(g => g.point);
      const from = gates.find(g => nearPoint(a, g, 12));
      const to = gates.find(g => nearPoint(b, g, 12));
      if (!from || !to || from === to) return false;
      const mid = street[Math.floor(street.length / 2)];
      return Math.max(Math.abs(mid[0]), Math.abs(mid[1])) > 35;
    });
    expect(ring.length).toBeGreaterThanOrEqual(2);
  });

  it("still hard-bars intramural arteries off walked river edges", () => {
    const open = buildStreets(walledTown());
    const river = open.streets.find(s => Math.hypot(s[0][0] - s.at(-1)![0], s[0][1] - s.at(-1)![1]) > 80)!;
    const banned = undirectedPairs(river);
    const blocked = buildStreets(walledTown({ rivers: [river] }));
    expect(usesPairs(blocked.streets, banned)).toBe(false);
  });
});

function nearPoint(a: Point, b: Point, limit = 8): boolean {
  return Math.hypot(a[0] - b[0], a[1] - b[1]) < limit;
}
