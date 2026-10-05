import { describe, expect, it } from "vitest";
import { buildPolylineRiverAxis } from "./riverGeometry";
import { footprintTouchesWater, pointInWater } from "./riverPhysicalGeometry";
import { buildPhysicalRiverGeometry } from "./riverPhysicalGeometryBuilder";
import { coveredByTerrainCells, findRiverSettlementSite, nearestSettlementBank } from "./settlementRiverSite";

function fixture() {
  const axis = buildPolylineRiverAxis(7, 1, [
    [0, -1000],
    [0, 1000]
  ]);
  if (!axis) throw new Error("axis");
  const built = buildPhysicalRiverGeometry(
    axis,
    [
      { arcLengthMeters: 0, widthMeters: 100 },
      { arcLengthMeters: 2000, widthMeters: 100 }
    ],
    { maxStepMeters: 100, maxChordErrorMeters: 0.1, maxSamples: 1000 }
  );
  if (!("geometry" in built)) throw new Error(built.reason);
  return {
    geometry: built.geometry,
    origin: [100, 0] as const,
    radiusMeters: 80,
    bankGapMeters: 20,
    accessWidthMeters: 2,
    maxMoveMeters: 300,
    maxCandidates: 128,
    otherWater: [],
    supports: () => true
  };
}

describe("physical settlement bank reservation", () => {
  it("reserves a complete dry urban footprint and dry water access on the existing bank", () => {
    const input = fixture();
    const result = findRiverSettlementSite(input);
    expect("site" in result).toBe(true);
    if (!("site" in result)) return;
    expect(result.site.point).toEqual([150, 0]);
    expect(result.site.bankPoint).toEqual([50, 0]);
    expect(result.site.bankDistanceMeters).toBe(100);
    expect(footprintTouchesWater(result.site.footprint, input.geometry.water)).toBe(false);
    expect(result.site.access.every(p => !pointInWater(p, input.geometry.water))).toBe(true);
    expect(footprintTouchesWater(result.site.accessFootprint, input.geometry.water)).toBe(false);
    expect(nearestSettlementBank(input.geometry, result.site.point)?.distance).toBe(100);
  });
  it("represents measured zero-width headwaters by a closed tip without inventing water", () => {
    const axis = buildPolylineRiverAxis(7, 1, [
      [0, 0],
      [0, 100],
      [0, 200]
    ])!;
    const survey = [
      { arcLengthMeters: 0, widthMeters: 0 },
      { arcLengthMeters: 100, widthMeters: 0 },
      { arcLengthMeters: 200, widthMeters: 20 }
    ];
    const settings = { maxStepMeters: 20, maxChordErrorMeters: 0.1, maxSamples: 1000, allowDrySource: true };
    const result = buildPhysicalRiverGeometry(axis, survey, settings);
    expect("geometry" in result).toBe(true);
    if (!("geometry" in result)) return;
    expect(result.geometry.water.rings[0].filter(p => p[0] === 0 && p[1] === 100)).toHaveLength(1);
    expect(pointInWater([0, 50], result.geometry.water)).toBe(false);
    expect(pointInWater([0, 150], result.geometry.water)).toBe(true);
    expect(
      buildPhysicalRiverGeometry(
        axis,
        survey.map(p => ({ ...p, widthMeters: 0 })),
        settings
      )
    ).toEqual({ reason: "invalid-survey" });
    expect(buildPhysicalRiverGeometry(axis, survey, { ...settings, allowDrySource: false })).toEqual({
      reason: "invalid-survey"
    });
  });
  it("keeps the opposite bank and rejects support, terrain and permission failures", () => {
    const input = fixture();
    const result = findRiverSettlementSite({ ...input, origin: [-100, 0] });
    expect("site" in result && result.site.point[0]).toBe(-150);
    expect(findRiverSettlementSite({ ...input, supports: () => false })).toEqual({ reason: "no-dry-site" });
  });
  it("rejects a second channel intersecting the urban footprint even when its centre is dry", () => {
    const input = fixture();
    const obstruction = {
      id: 8,
      rings: [
        [
          [180, -1000],
          [300, -1000],
          [300, 1000],
          [180, 1000]
        ] as const
      ]
    };
    const result = findRiverSettlementSite({ ...input, otherWater: [obstruction], supports: (_f, _a, p) => p[0] > 0 });
    expect("reason" in result).toBe(true);
  });
  it("rejects an obstruction between the city and its water landing", () => {
    const input = fixture();
    const obstruction = {
      id: 8,
      rings: [
        [
          [55, -1000],
          [60, -1000],
          [60, 1000],
          [55, 1000]
        ] as const
      ]
    };
    const result = findRiverSettlementSite({ ...input, otherWater: [obstruction], supports: (_f, _a, p) => p[0] > 0 });
    expect("reason" in result).toBe(true);
  });
  it("requires full terrain coverage, including the area between dry corners", () => {
    const square = [
      [0, 0],
      [100, 0],
      [100, 100],
      [0, 100]
    ] as const;
    const left = [
      [0, 0],
      [40, 0],
      [40, 100],
      [0, 100]
    ] as const;
    const right = [
      [60, 0],
      [100, 0],
      [100, 100],
      [60, 100]
    ] as const;
    expect(coveredByTerrainCells(square, [left, right])).toBe(false);
    const middle = [
      [40, 0],
      [60, 0],
      [60, 100],
      [40, 100]
    ] as const;
    expect(coveredByTerrainCells(square, [left, middle, right])).toBe(true);
    expect(coveredByTerrainCells(square, [square.toReversed()])).toBe(true);
  });
  it("keeps finite candidate and relocation budgets explicit", () => {
    const input = fixture();
    expect(findRiverSettlementSite({ ...input, maxCandidates: 1, supports: () => false })).toEqual({
      reason: "candidate-budget"
    });
    expect(findRiverSettlementSite({ ...input, maxMoveMeters: 1 })).toEqual({ reason: "no-dry-site" });
    expect(findRiverSettlementSite({ ...input, radiusMeters: Number.NaN })).toEqual({ reason: "invalid-settings" });
  });
});
