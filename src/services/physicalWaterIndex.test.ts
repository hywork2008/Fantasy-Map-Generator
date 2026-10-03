import { describe, expect, it } from "vitest";
import { type CrossingCandidateInput, createProvisionalRiverCrossing } from "../generators/riverCrossingCandidates";
import { checkDryLandSegment } from "./dryLandCorridor";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "./physicalWaterIndex";
import { buildPolylineRiverAxis, type RiverPoint } from "./riverGeometry";
import { footprintTouchesWater, type PhysicalWaterPolygon } from "./riverPhysicalGeometry";

function box(id: number, x: number, y = 0, width = 10, height = 10): PhysicalWaterPolygon {
  return {
    id,
    rings: [
      [
        [x, y],
        [x + width, y],
        [x + width, y + height],
        [x, y + height]
      ]
    ]
  };
}
function indexFor(waters: readonly PhysicalWaterPolygon[]) {
  const index = PhysicalWaterIndex.build(waters, new PhysicalWaterValidationCache());
  if (!index) throw new Error("invalid fixture water");
  return index;
}
const rectangle = (x: number, y: number, width = 2, height = 2): RiverPoint[] => [
  [x, y],
  [x + width, y],
  [x + width, y + height],
  [x, y + height]
];
function crossingFixture(): CrossingCandidateInput {
  return {
    id: 1,
    arcLengthMeters: 50,
    geometry: {
      axis: buildPolylineRiverAxis(7, 1, [
        [0, -50],
        [0, 50]
      ])!,
      water: {
        id: 7,
        rings: [
          [
            [-5, -50],
            [5, -50],
            [5, 50],
            [-5, 50]
          ]
        ],
        bankReferences: [
          [null, { side: "right", arcStart: 0, arcEnd: 100 }, null, { side: "left", arcStart: 100, arcEnd: 0 }]
        ]
      }
    },
    dimensions: { bankSeatMeters: 1, straightApproachMeters: 4, roadWidthMeters: 2, localWindowMeters: 5 },
    otherWater: [],
    capability: { depthMeters: 3 },
    supportsDryFootprint: () => true
  };
}

describe("validated water snapshots and BVH", () => {
  it("matches brute-force water collision tests, including holes, enclosing footprints and boundary contact", () => {
    const donut = box(1, 0);
    donut.rings = [...donut.rings, box(1, 3, 3, 4, 4).rings[0]];
    const waters = [donut, box(2, 50), box(3, -20, -10)];
    const index = indexFor(waters);
    const footprints = [
      rectangle(4, 4, 1, 1),
      rectangle(0, 0),
      rectangle(10, 4),
      rectangle(-30, -20, 100, 50),
      rectangle(20, 20),
      rectangle(49, 4),
      rectangle(-10, -4),
      rectangle(2.5, 4),
      rectangle(0, 10 + 0.5e-9)
    ];
    for (const p of footprints) expect(index.touchesWater(p)).toBe(waters.some(w => footprintTouchesWater(p, w)));
    expect(index.touchesWater(rectangle(4, 4, 1, 1))).toBe(false);
  });
  it("retains source order and excludes by identity even when river/lake IDs coincide", () => {
    const a = box(7, 20),
      b = box(7, 0),
      c = box(8, 10);
    const index = indexFor([a, b, c]);
    expect(index.query({ minX: -1, minY: -1, maxX: 40, maxY: 20 }).map(w => w.rings[0][0][0])).toEqual([20, 0, 10]);
    expect(index.query({ minX: -1, minY: -1, maxX: 40, maxY: 20 }, b)).toHaveLength(2);
    expect(index.touchesWater(rectangle(1, 1), b)).toBe(false);
    expect(index.touchesWater(rectangle(21, 1), b)).toBe(true);
  });
  it("prunes remote water polygons rather than scanning every obstacle", () => {
    const waters = Array.from({ length: 1024 }, (_, i) => box(i, i * 100));
    const index = indexFor(waters);
    expect(index.touchesWater(rectangle(1, 1))).toBe(true);
    expect(index.stats.polygonTests).toBe(1);
    expect(index.stats.boundsTests).toBeLessThan(10);
    expect(index.stats.visitedNodes).toBeLessThan(30);
    expect(index.stats.queries).toBe(1);
  });
  it("caches validation and reuses the index, then rebuilds after mutable geometry changes", () => {
    const source = box(1, 0),
      cache = new PhysicalWaterValidationCache();
    const a = PhysicalWaterIndex.build([source], cache)!;
    expect(PhysicalWaterIndex.build([source], cache, a)).toBe(a);
    expect(cache.stats).toEqual({ validations: 1, cacheHits: 1 });
    (source.rings as [number, number][][])[0][0][0] = -1;
    expect(a.getSnapshot(source)).toBeNull();
    const b = PhysicalWaterIndex.build([source], cache, a)!;
    expect(b).not.toBe(a);
    expect(b.getSnapshot(source)).not.toBeNull();
    expect(cache.stats.validations).toBe(2);
  });
  it("does not trust shallow freezing, and never changes an already-created snapshot", () => {
    const source = box(1, 0);
    Object.freeze(source);
    const cache = new PhysicalWaterValidationCache();
    const index = PhysicalWaterIndex.build([source], cache)!;
    const snapshot = index.getSnapshot(source)!;
    expect(Object.isFrozen(snapshot.rings[0][0])).toBe(true);
    (source.rings as [number, number][][])[0][0][0] = -5;
    expect(snapshot.rings[0][0][0]).toBe(0);
    expect(index.getSnapshot(source)).toBeNull();
    expect(PhysicalWaterIndex.build([source], cache, index)).not.toBe(index);
  });
  it("caches failed validation but allows repair, and blocks any partial index", () => {
    const bad: PhysicalWaterPolygon = { id: 1, rings: [] },
      cache = new PhysicalWaterValidationCache();
    expect(PhysicalWaterIndex.build([box(2, 10), bad], cache)).toBeNull();
    expect(cache.get(bad)).toBeNull();
    expect(cache.stats.cacheHits).toBe(1);
    bad.rings = box(1, 0).rings;
    expect(PhysicalWaterIndex.build([bad], cache)).not.toBeNull();
    expect(cache.stats.validations).toBe(3);
  });
  it("treats invalid footprints as unsafe and rejects malformed query bounds", () => {
    const index = indexFor([]);
    expect(index.touchesWater([])).toBe(true);
    expect(
      index.touchesWater([
        [0, 0],
        [1, 0],
        [2, 0]
      ])
    ).toBe(true);
    expect(
      PhysicalWaterIndex.build([box(1, -1e308, 0, 1.7e308, 1e308)], new PhysicalWaterValidationCache())
    ).toBeNull();
    expect(
      index.touchesWater([
        [0, 0],
        [NaN, 0],
        [0, 1]
      ])
    ).toBe(true);
    expect(() => index.query({ minX: 1, maxX: 0, minY: 0, maxY: 1 })).toThrow(RangeError);
  });
});

describe("indexed provisional crossing parity", () => {
  it("returns the same geometry and rejection reasons as the full-scan path", () => {
    for (const obstacles of [[], [box(8, 30)], [box(8, 7, 0.5, 1, 2)], [box(8, -1, -1, 2, 2)]]) {
      const input = crossingFixture();
      input.otherWater = obstacles;
      const brute = createProvisionalRiverCrossing(input);
      const indexed = createProvisionalRiverCrossing({
        ...input,
        otherWater: [],
        waterIndex: indexFor([input.geometry.water, ...obstacles])
      });
      expect(indexed).toEqual(brute);
    }
  });
  it("rejects a missing or edited target and ambiguous mixed obstacle modes", () => {
    const input = crossingFixture();
    const index = indexFor([input.geometry.water]);
    expect(createProvisionalRiverCrossing({ ...input, waterIndex: indexFor([]) })).toEqual({ reason: "invalid-input" });
    expect(createProvisionalRiverCrossing({ ...input, waterIndex: index, otherWater: [box(8, 20)] })).toEqual({
      reason: "invalid-input"
    });
    (input.geometry.water.rings as [number, number][][])[0][0][0] = -6;
    expect(createProvisionalRiverCrossing({ ...input, waterIndex: index })).toEqual({ reason: "invalid-input" });
  });
});

describe("finite dry land edge validation", () => {
  it("checks physical water even when neither endpoint is in water", () => {
    expect(
      checkDryLandSegment({
        start: [-5, 5],
        end: [15, 5],
        widthMeters: 2,
        water: indexFor([box(1, 0)]),
        supportsDryFootprint: () => true
      })
    ).toEqual({ reason: "water-intersection" });
  });
  it("rejects water beneath road width or an end cap, despite a dry centerline", () => {
    const water = indexFor([box(1, 0)]);
    expect(
      checkDryLandSegment({
        start: [-5, 10.5],
        end: [15, 10.5],
        widthMeters: 2,
        water,
        supportsDryFootprint: () => true
      })
    ).toEqual({ reason: "water-intersection" });
    expect(
      checkDryLandSegment({ start: [-5, 5], end: [-0.5, 5], widthMeters: 2, water, supportsDryFootprint: () => true })
    ).toEqual({ reason: "water-intersection" });
  });
  it("allows a dry same-bank segment, supplies its complete footprint and keeps terrain rejection separate", () => {
    const water = indexFor([box(1, 0)]),
      footprints: (readonly RiverPoint[])[] = [];
    const input = {
      start: [-5, -5] as RiverPoint,
      end: [15, -5] as RiverPoint,
      widthMeters: 2,
      water,
      supportsDryFootprint: (p: readonly RiverPoint[]) => {
        footprints.push(p);
        return true;
      }
    };
    const result = checkDryLandSegment(input);
    expect(result).toMatchObject({ lengthMeters: 20, tangent: [1, 0] });
    expect(footprints).toEqual([
      [
        [-6, -6],
        [16, -6],
        [16, -4],
        [-6, -4]
      ]
    ]);
    expect(checkDryLandSegment({ ...input, supportsDryFootprint: () => false })).toEqual({
      reason: "unsupported-terrain"
    });
  });
  it("rejects zero-length and nonfinite edges without calling terrain support", () => {
    const water = indexFor([]);
    let calls = 0;
    const input = {
      start: [0, 0] as RiverPoint,
      end: [0, 0] as RiverPoint,
      widthMeters: 2,
      water,
      supportsDryFootprint: () => {
        calls++;
        return true;
      }
    };
    expect(checkDryLandSegment(input)).toEqual({ reason: "invalid-segment" });
    expect(checkDryLandSegment({ ...input, end: [Infinity, 0] })).toEqual({ reason: "invalid-segment" });
    expect(checkDryLandSegment({ ...input, end: [10, 0], widthMeters: Number.MIN_VALUE })).toEqual({
      reason: "invalid-segment"
    });
    expect(calls).toBe(0);
  });
});
