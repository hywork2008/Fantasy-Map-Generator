import { describe, expect, it } from "vitest";
import type { WorldContext } from "../context/worldContext";
import type { ConstrainedLandNetwork } from "./constrainedLandNetwork";
import type { LandConnectionCalibration } from "./landConnectionCalibration";
import { selectNearbyWorldConnectionPairs, selectSharedFacilityGroups } from "./landConnectionSelection";
import type { WorldConnectionPair } from "./worldLandConnectionProposals";

const calibration: LandConnectionCalibration = {
  baseSizeReference: 100,
  maximumImportance: 4,
  capitalBonus: 1,
  portBonus: 0.5,
  allowanceMeters: 200,
  maximumAllowanceMeters: 600,
  constructionAllowanceMeters: 100,
  maximumConstructionMeters: 300,
  bridgeFixedCostMeters: 20,
  bridgeCostPerSquareMeter: 2,
  bridgeLongSpanCostPerCubicMeter: 0.1,
  bridgeUseCostMeters: 5,
  bridgeUseCostPerMeter: 0.2,
  approachCostPerSquareMeter: 0.5
};
const assessment = {
  minimumImprovementMeters: 1,
  nearEqualCostMeters: 1,
  maxConstructionCostMeters: 1000,
  maxRouteCostMeters: 1000,
  maxSearches: 4
};
function world() {
  return {
    distanceScale: 0.001,
    graphWidth: 1000,
    graphHeight: 1000,
    pack: {
      cells: { capacity: [100], subsistenceCapacity: [100], s: [100], h: [30], g: [0] },
      features: [],
      burgs: [
        {},
        { i: 1, cell: 0, x: 9, y: 10 },
        { i: 2, cell: 0, x: 11, y: 10 },
        { i: 3, cell: 0, x: 15, y: 10 },
        { i: 4, cell: 0, x: 500, y: 500 }
      ]
    },
    grid: { cells: { temp: [12], prec: [45] } }
  } as unknown as WorldContext;
}
const nearby = {
  maxCities: 10,
  maxNeighbourChecks: 100,
  maxNeighboursPerCity: 1,
  maxPairs: 4,
  radiusMeters: 10,
  firstPairId: 20
};

describe("bounded nearby city selection", () => {
  it("finds neighbours across bucket boundaries, excludes distant towns and preserves input", () => {
    const w = world(),
      before = structuredClone(w);
    const result = selectNearbyWorldConnectionPairs(w, "km", [1, 2, 3, 4], nearby, calibration, assessment);
    expect(result).toMatchObject({ status: "selected", checks: 6, truncated: false });
    if (result.status === "selected")
      expect(result.pairs.map(p => [p.id, p.cityAId, p.cityBId])).toEqual([
        [20, 1, 2],
        [21, 2, 3]
      ]);
    expect(selectNearbyWorldConnectionPairs(w, "km", [4, 3, 2, 1], nearby, calibration, assessment)).toEqual(result);
    expect(w).toEqual(before);
  });
  it("reports truncation separately from exhausted checks; never certifies a partial selection", () => {
    expect(
      selectNearbyWorldConnectionPairs(world(), "km", [1, 2, 3], { ...nearby, maxPairs: 1 }, calibration, assessment)
    ).toMatchObject({ status: "selected", truncated: true });
    expect(
      selectNearbyWorldConnectionPairs(
        world(),
        "km",
        [1, 2, 3],
        { ...nearby, maxNeighbourChecks: 1 },
        calibration,
        assessment
      )
    ).toMatchObject({ status: "unresolved", reason: "neighbour-budget" });
    expect(
      selectNearbyWorldConnectionPairs(world(), "km", [1, 2, 3], { ...nearby, maxCities: 2 }, calibration, assessment)
    ).toMatchObject({ status: "unresolved", reason: "city-budget" });
  });
  it("rejects duplicate, moved, removed and nonfinite cities without population fallback", () => {
    expect(selectNearbyWorldConnectionPairs(world(), "km", [1, 1], nearby, calibration, assessment)).toMatchObject({
      reason: "invalid-input"
    });
    const w = world();
    w.pack.burgs[2].x = Infinity;
    expect(selectNearbyWorldConnectionPairs(w, "km", [1, 2], nearby, calibration, assessment)).toMatchObject({
      reason: "invalid-input"
    });
  });
});

const groupSettings = { maxGroups: 4, maxPairsPerGroup: 2, maxFacilitiesPerGroup: 2, maxChecks: 1000 };
const pairs: WorldConnectionPair[] = [
  { id: 1, cityAId: 1, cityBId: 2, weight: 1, unconnectedAllowanceMeters: 200 },
  { id: 2, cityAId: 3, cityBId: 2, weight: 2, unconnectedAllowanceMeters: 200 },
  { id: 3, cityAId: 4, cityBId: 5, weight: 1, unconnectedAllowanceMeters: 200 }
];
const network = {
  nodes: [],
  roadWidthMeters: 2,
  edges: [
    { id: 1, from: 1, to: 2, crossing: { facilityId: 10 } },
    { id: 2, from: 3, to: 2, crossing: { facilityId: 10 } },
    { id: 3, from: 4, to: 5, crossing: { facilityId: 20 } },
    { id: 4, from: 1, to: 2, crossing: { facilityId: 11 } },
    { id: 5, from: 3, to: 2, crossing: { facilityId: 11 } },
    { id: 6, from: 1, to: 3 }
  ]
} as unknown as ConstrainedLandNetwork;

describe("bounded shared facility group selection", () => {
  it("separates unrelated facilities and retains complete observed two-bridge bundles", () => {
    const result = selectSharedFacilityGroups(
      network,
      pairs,
      [],
      [
        { pairId: 1, facilityIds: [11, 10] },
        { pairId: 2, facilityIds: [10, 11] }
      ],
      groupSettings
    );
    expect(result.status).toBe("selected");
    if (result.status !== "selected") return;
    expect(result.groups.map(g => g.facilityIds)).toEqual([[10], [11], [10, 11]]);
    expect(result.groups.map(g => g.pairIds)).toEqual([
      [1, 2],
      [1, 2],
      [1, 2]
    ]);
    expect(result.groups[0].connectionIds).toEqual([1, 2, 6]);
    expect(result.groups[2].connectionIds).toEqual([1, 2, 4, 5, 6]);
    expect(result.groups.every(g => !g.connectionIds.includes(3))).toBe(true);
  });
  it("keeps baseline facilities, selects highest importance pairs and exposes approximation", () => {
    const result = selectSharedFacilityGroups(network, pairs, [3], [], { ...groupSettings, maxGroups: 1 });
    expect(result).toMatchObject({ status: "selected", truncated: true });
    if (result.status === "selected") expect(result.groups[0].connectionIds).toContain(3);
  });
  it("distinguishes group enumeration budget from no shared opportunity", () => {
    expect(selectSharedFacilityGroups(network, pairs, [], [], { ...groupSettings, maxChecks: 1 })).toMatchObject({
      status: "unresolved",
      reason: "group-budget"
    });
    expect(selectSharedFacilityGroups(network, [pairs[2]], [], [], groupSettings)).toMatchObject({
      status: "selected",
      groups: []
    });
  });
});
