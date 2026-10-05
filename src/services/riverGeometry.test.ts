import { describe, expect, it } from "vitest";
import { diagnosePolylineRiverCrossings } from "./riverCrossingDiagnostics";
import { buildPolylineRiverAxis, samplePolylineRiverAxis } from "./riverGeometry";

describe("piecewise-linear river reference", () => {
  it("keeps arc length and tangent across collinear resampling and duplicate points", () => {
    const original = buildPolylineRiverAxis(1, 2, [
      [0, 0],
      [6, 8]
    ])!;
    const sampled = buildPolylineRiverAxis(1, 2, [
      [0, 0],
      [3, 4],
      [3, 4],
      [6, 8]
    ])!;
    expect(samplePolylineRiverAxis(sampled, 5, 2)?.point).toEqual(samplePolylineRiverAxis(original, 5, 2)?.point);
    expect(samplePolylineRiverAxis(sampled, 5, 2)?.tangent).toEqual([0.6, 0.8]);
    expect(original.length).toBe(10);
  });
  it("does not average corner tangents or accept a window spanning a corner", () => {
    const axis = buildPolylineRiverAxis(1, 0, [
      [0, 0],
      [10, 0],
      [10, 10]
    ])!;
    expect(samplePolylineRiverAxis(axis, 10)).toBeNull();
    expect(samplePolylineRiverAxis(axis, 9, 2)).toBeNull();
    expect(samplePolylineRiverAxis(axis, 5, 2)?.normal).toEqual([-0, 1]);
    expect(samplePolylineRiverAxis(axis, 0)).toBeNull();
  });
  it("rejects missing and nonfinite geometry without inventing an axis", () => {
    expect(
      buildPolylineRiverAxis(1, 0, [
        [0, 0],
        [0, 0]
      ])
    ).toBeNull();
    expect(
      buildPolylineRiverAxis(1, 0, [
        [0, 0],
        [NaN, 1]
      ])
    ).toBeNull();
  });
});

it("rejects finite coordinates whose arc length overflows", () => {
  expect(
    buildPolylineRiverAxis(1, 0, [
      [-1e308, 0],
      [1e308, 0]
    ])
  ).toBeNull();
});

describe("fixed pre-implementation crossing fixtures", () => {
  const rivers = [
    {
      id: 1,
      points: [
        [0, -10],
        [0, 10]
      ] as const
    }
  ];
  it("distinguishes perpendicular and oblique routes without cell-ID filtering and preserves inputs", () => {
    const routes = [
      {
        id: 2,
        points: [
          [-10, 0],
          [10, 0]
        ] as const
      },
      {
        id: 3,
        points: [
          [-10, -5],
          [10, 5]
        ] as const
      }
    ];
    const before = structuredClone({ rivers, routes });
    const report = diagnosePolylineRiverCrossings(rivers, routes);
    expect(report.crossings.map(c => c.status)).toEqual(["perpendicular", "oblique"]);
    expect(report.crossings[0].riverArcLength).toBe(10);
    expect({ rivers, routes }).toEqual(before);
    expect(diagnosePolylineRiverCrossings(rivers, routes)).toEqual(report);
  });
  it("records repeated crossings and ambiguous vertices without treating them as valid bridges", () => {
    const report = diagnosePolylineRiverCrossings(rivers, [
      {
        id: 2,
        points: [
          [-5, -5],
          [5, -5],
          [5, 5],
          [-5, 5]
        ]
      }
    ]);
    expect(report.repeatedCrossings).toEqual([{ routeId: 2, riverId: 1, count: 2 }]);
    const vertex = diagnosePolylineRiverCrossings(rivers, [
      {
        id: 2,
        points: [
          [-5, 0],
          [0, 0],
          [5, 0]
        ]
      }
    ]);
    expect(vertex.crossings).toHaveLength(1);
    expect(vertex.crossings[0].status).toBe("ambiguous");
  });
  it("reports water-axis overlap and broken inputs as unresolved", () => {
    const report = diagnosePolylineRiverCrossings(
      [...rivers, { id: 4, points: [] }],
      [
        {
          id: 2,
          points: [
            [0, -5],
            [0, 5]
          ]
        },
        { id: 3, points: [] }
      ]
    );
    expect(report.unresolved).toEqual([
      { kind: "river", id: 4, reason: "invalid-axis" },
      { kind: "route", id: 2, otherId: 1, reason: "overlap" },
      { kind: "route", id: 3, reason: "invalid-axis" }
    ]);
  });
  it("preserves crossing classification after rotation, scaling and translation", () => {
    const transform = ([x, y]: readonly [number, number]): [number, number] => [100 + 3 * (x - y), 50 + 3 * (x + y)];
    const routes = [
      {
        id: 2,
        points: [
          [-5, 0],
          [5, 0]
        ] as const
      }
    ];
    const report = diagnosePolylineRiverCrossings(
      rivers.map(r => ({ ...r, points: r.points.map(transform) })),
      routes.map(r => ({ ...r, points: r.points.map(transform) }))
    );
    expect(report.crossings[0].status).toBe("perpendicular");
    expect(report.crossings[0].normalizedDot).toBeLessThan(1e-9);
  });
});
