import { curveCatmullRom, line, path } from "d3";
import { describe, expect, it } from "vitest";
import {
  createProvisionalRiverCrossing,
  validateProvisionalRiverCrossing
} from "../generators/riverCrossingCandidates";
import {
  buildCatmullRomRiverAxis,
  buildCubicRiverAxis,
  type CubicRiverAxis,
  evaluateCubicRiverAxis,
  evaluateRiverCubic,
  type RiverCubic,
  sampleCubicRiverAxis
} from "./riverCurveGeometry";
import { buildPolylineRiverAxis } from "./riverGeometry";
import { buildPhysicalRiverGeometry } from "./riverPhysicalGeometryBuilder";

const precision = { arcToleranceMeters: 1e-8, maxIntegrationDepth: 24, maxEvaluations: 100000 };
const parabola: RiverCubic = [
  [0, 0],
  [100 / 3, 0],
  [200 / 3, 50 / 3],
  [100, 50]
];
const analyticLength = (t: number) => 50 * (t * Math.sqrt(1 + t * t) + Math.asinh(t));
function axisFor(curves: readonly RiverCubic[]): CubicRiverAxis {
  const result = buildCubicRiverAxis(5, 2, curves, precision);
  if (!("axis" in result)) throw new Error(result.reason);
  return result.axis;
}
const sampling = { maxStepMeters: 5, maxChordErrorMeters: 0.01, maxSamples: 2000 };
function waterFor(axis: CubicRiverAxis, settings = sampling) {
  return buildPhysicalRiverGeometry(
    axis,
    [
      { arcLengthMeters: 0, widthMeters: 8 },
      { arcLengthMeters: axis.length, widthMeters: 8 }
    ],
    settings
  );
}

describe("canonical cubic river axis", () => {
  it("integrates and inverts a known curved axis and derives its tangent analytically", () => {
    const axis = axisFor([parabola]);
    expect(axis.length).toBeCloseTo(analyticLength(1), 7);
    const value = evaluateCubicRiverAxis(axis, analyticLength(0.5))!;
    expect(value.parameter).toBeCloseTo(0.5, 8);
    expect(value.point[0]).toBeCloseTo(50, 7);
    expect(value.point[1]).toBeCloseTo(12.5, 7);
    expect(value.tangent[0]).toBeCloseTo(1 / Math.sqrt(1.25), 9);
    expect(value.tangent[1]).toBeCloseTo(0.5 / Math.sqrt(1.25), 9);
    expect(value.curvature).toBeCloseTo(0.01 / 1.25 ** 1.5, 9);
    expect(evaluateCubicRiverAxis(axis, -1)).toBeNull();
  });
  it("captures d3's Catmull-Rom control points exactly instead of a sampled tangent", () => {
    const points: [number, number][] = [
      [0, 0],
      [20, 5],
      [45, 30],
      [70, 25]
    ];
    const result = buildCatmullRomRiverAxis(5, 2, points, 0.1, precision);
    expect(result).toHaveProperty("axis");
    if (!("axis" in result)) return;
    const captured = path();
    captured.moveTo(...points[0]);
    for (const s of result.axis.segments) captured.bezierCurveTo(...s.controls[1], ...s.controls[2], ...s.controls[3]);
    const reference = path();
    const generator = curveCatmullRom.alpha(0.1)(reference);
    generator.lineStart();
    for (const p of points) generator.point(...p);
    generator.lineEnd();
    expect(captured.toString()).toBe(reference.toString());
    const render = line<[number, number]>().curve(curveCatmullRom.alpha(0.1))(points);
    expect(render).toContain("C");
  });
  it("uses the same direction when bank/display sampling changes", () => {
    const axis = axisFor([parabola]);
    const fine = waterFor(axis),
      coarse = waterFor(axis, { ...sampling, maxStepMeters: 15, maxChordErrorMeters: 0.1 });
    expect(fine).toHaveProperty("geometry");
    expect(coarse).toHaveProperty("geometry");
    if (!("geometry" in fine) || !("geometry" in coarse)) return;
    const input = {
      id: 8,
      arcLengthMeters: analyticLength(0.37),
      dimensions: { bankSeatMeters: 2, straightApproachMeters: 4, roadWidthMeters: 2, localWindowMeters: 10 },
      otherWater: [],
      capability: { depthMeters: 3 },
      supportsDryFootprint: () => true
    };
    const a = createProvisionalRiverCrossing({ ...input, geometry: fine.geometry });
    const b = createProvisionalRiverCrossing({ ...input, geometry: coarse.geometry });
    expect(a).toHaveProperty("candidate");
    expect(b).toHaveProperty("candidate");
    if (!("candidate" in a) || !("candidate" in b)) return;
    expect(a.candidate.tRiver).toEqual(b.candidate.tRiver);
    expect(a.candidate.nCrossing).toEqual(b.candidate.nCrossing);
    const c = a.candidate;
    for (const p of [c.waterA, c.waterB, c.deckA, c.deckB, c.approachA, c.approachB])
      expect((p[0] - c.q[0]) * c.tRiver[0] + (p[1] - c.q[1]) * c.tRiver[1]).toBeCloseTo(0, 9);
  });
  it("accepts a continuous split of the same curve, but rejects a true corner's window", () => {
    const midpoint = evaluateRiverCubic(parabola, 0.5).point;
    const lerp = (a: readonly [number, number], b: readonly [number, number]): [number, number] => [
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2
    ];
    const p01 = lerp(parabola[0], parabola[1]),
      p12 = lerp(parabola[1], parabola[2]),
      p23 = lerp(parabola[2], parabola[3]);
    const p012 = lerp(p01, p12),
      p123 = lerp(p12, p23);
    const split = axisFor([
      [parabola[0], p01, p012, midpoint],
      [midpoint, p123, p23, parabola[3]]
    ]);
    const a = sampleCubicRiverAxis(split, analyticLength(0.5), 2)!;
    const b = sampleCubicRiverAxis(axisFor([parabola]), analyticLength(0.5), 2)!;
    expect(a.point[0]).toBeCloseTo(b.point[0], 7);
    expect(a.tangent[1]).toBeCloseTo(b.tangent[1], 8);
    const corner = axisFor([
      [
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0]
      ],
      [
        [30, 0],
        [30, 10],
        [30, 20],
        [30, 30]
      ]
    ]);
    expect(sampleCubicRiverAxis(corner, 30)).toBeNull();
    expect(sampleCubicRiverAxis(corner, 29, 2)).toBeNull();
  });
  it("reports integration budget separately from invalid curves", () => {
    expect(buildCubicRiverAxis(5, 2, [parabola], { ...precision, maxEvaluations: 5 })).toEqual({
      reason: "integration-budget"
    });
    expect(
      buildCubicRiverAxis(
        5,
        2,
        [
          [
            [0, 0],
            [1, 0],
            [-1, 0],
            [0, 0]
          ]
        ],
        precision
      )
    ).toEqual({ reason: "invalid-curve" });
    expect(
      buildCatmullRomRiverAxis(
        5,
        2,
        [
          [0, 0],
          [NaN, 0]
        ],
        0.1,
        precision
      )
    ).toEqual({ reason: "invalid-curve" });
  });
  it("supports two-point rivers and leaves input controls independent", () => {
    const result = buildCatmullRomRiverAxis(
      5,
      2,
      [
        [0, 0],
        [0, 100]
      ],
      0.1,
      precision
    );
    expect(result).toHaveProperty("axis");
    if (!("axis" in result)) return;
    expect(result.axis.length).toBeCloseTo(100, 9);
    expect(sampleCubicRiverAxis(result.axis, 50)?.tangent).toEqual([0, 1]);
    const controls: [[number, number], [number, number], [number, number], [number, number]] = [
      [0, 0],
      [10, 0],
      [20, 0],
      [30, 0]
    ];
    const axis = axisFor([controls]);
    controls[1][1] = 99;
    expect(axis.segments[0].controls[1]).toEqual([10, 0]);
  });
  it("preserves physical crossings after a saved-geometry round trip without RNG", () => {
    const originalRandom = Math.random;
    Math.random = () => {
      throw new Error("geometry must not consume world RNG");
    };
    try {
      const axis = axisFor([parabola]);
      const physical = waterFor(axis);
      expect(physical).toHaveProperty("geometry");
      if (!("geometry" in physical)) return;
      const input = {
        id: 8,
        arcLengthMeters: analyticLength(0.37),
        geometry: physical.geometry,
        dimensions: { bankSeatMeters: 2, straightApproachMeters: 4, roadWidthMeters: 2, localWindowMeters: 10 },
        otherWater: [],
        capability: { depthMeters: 3 },
        supportsDryFootprint: () => true
      };
      const result = createProvisionalRiverCrossing(input);
      expect(result).toHaveProperty("candidate");
      if (!("candidate" in result)) return;
      const restored = JSON.parse(JSON.stringify({ geometry: physical.geometry, candidate: result.candidate }));
      expect(validateProvisionalRiverCrossing(restored.candidate, { ...input, geometry: restored.geometry })).toBe(
        true
      );
      expect(createProvisionalRiverCrossing({ ...input, geometry: restored.geometry })).toEqual(result);
    } finally {
      Math.random = originalRandom;
    }
  });
});

describe("physical curve bank construction", () => {
  it("preserves width survey breakpoints, bank arcs and conservative sample budget", () => {
    const axis = axisFor([parabola]);
    const result = buildPhysicalRiverGeometry(
      axis,
      [
        { arcLengthMeters: 0, widthMeters: 4 },
        { arcLengthMeters: 30, widthMeters: 8 },
        { arcLengthMeters: axis.length, widthMeters: 6 }
      ],
      sampling
    );
    expect(result).toHaveProperty("geometry");
    if (!("geometry" in result)) return;
    const refs = result.geometry.water.bankReferences![0];
    expect(refs.some(r => r?.arcStart === 30)).toBe(true);
    expect(refs.filter(r => r === null)).toHaveLength(2);
    expect(waterFor(axis, { ...sampling, maxSamples: 5 })).toEqual({ reason: "sampling-budget" });
  });
  it("rejects incomplete width surveys and corners without inventing banks", () => {
    const axis = axisFor([parabola]);
    expect(
      buildPhysicalRiverGeometry(
        axis,
        [
          { arcLengthMeters: 1, widthMeters: 4 },
          { arcLengthMeters: axis.length, widthMeters: 4 }
        ],
        sampling
      )
    ).toEqual({ reason: "invalid-survey" });
    const polyline = buildPolylineRiverAxis(5, 2, [
      [0, 0],
      [30, 0],
      [30, 30]
    ])!;
    expect(
      buildPhysicalRiverGeometry(
        polyline,
        [
          { arcLengthMeters: 0, widthMeters: 4 },
          { arcLengthMeters: polyline.length, widthMeters: 4 }
        ],
        sampling
      )
    ).toEqual({ reason: "unstable-axis" });
  });
  it("rejects widths that fold normal offsets through the curve", () => {
    const axis = axisFor([parabola]);
    expect(
      buildPhysicalRiverGeometry(
        axis,
        [
          { arcLengthMeters: 0, widthMeters: 500 },
          { arcLengthMeters: axis.length, widthMeters: 500 }
        ],
        sampling
      )
    ).toEqual({ reason: "folded-banks" });
  });
  it("accepts a transverse normal crossing at a sampled bank vertex", () => {
    const axis = axisFor([
      [
        [0, 0],
        [0, 100 / 3],
        [0, 200 / 3],
        [0, 100]
      ]
    ]);
    const physical = waterFor(axis);
    expect(physical).toHaveProperty("geometry");
    if (!("geometry" in physical)) return;
    const result = createProvisionalRiverCrossing({
      id: 8,
      arcLengthMeters: 50,
      geometry: physical.geometry,
      dimensions: { bankSeatMeters: 2, straightApproachMeters: 4, roadWidthMeters: 2, localWindowMeters: 10 },
      otherWater: [],
      capability: { depthMeters: 3 },
      supportsDryFootprint: () => true
    });
    expect(result).toHaveProperty("candidate");
  });
});
