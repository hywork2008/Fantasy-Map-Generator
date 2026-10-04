import { describe, expect, it } from "vitest";
import { buildPolylineRiverAxis } from "../services/riverGeometry";
import { convergeRiverRoadLegs } from "./convergingRiverRoads";
import { type CrossingCandidateInput, createProvisionalRiverCrossing } from "./riverCrossingCandidates";

function input(): CrossingCandidateInput {
  return {
    id: 42,
    arcLengthMeters: 100,
    geometry: {
      axis: buildPolylineRiverAxis(7, 3, [
        [0, -100],
        [0, 100]
      ])!,
      water: {
        id: 7,
        rings: [
          [
            [-5, -100],
            [5, -100],
            [5, 100],
            [-5, 100]
          ]
        ],
        bankReferences: [
          [null, { side: "right", arcStart: 0, arcEnd: 200 }, null, { side: "left", arcStart: 200, arcEnd: 0 }]
        ]
      }
    },
    dimensions: { bankSeatMeters: 1, straightApproachMeters: 4, roadWidthMeters: 2, localWindowMeters: 5 },
    otherWater: [],
    capability: { period: "ageOfExploration", depthMeters: 3 },
    supportsDryFootprint: () => true
  };
}
function plan(source = input()) {
  const c = createProvisionalRiverCrossing(source);
  if (!("candidate" in c)) throw new Error(c.reason);
  return { crossing: c.candidate, input: source };
}
const legs = [-30, 0, 30].map((y, id) => ({
  id,
  points: [
    [-50, 0],
    [50, y]
  ] as [number, number][]
}));
describe("FMG city-side river road convergence", () => {
  it("uses one common trunk and perpendicular shortest deck, branching only on the far bank", () => {
    const before = structuredClone(legs);
    const result = convergeRiverRoadLegs([-50, 0], legs, [plan()], 100)!;
    expect(result.legs).toHaveLength(3);
    expect(result.trunk).toEqual([
      [-50, 0],
      [-10, 0],
      [-6, 0],
      [6, 0],
      [10, 0]
    ]);
    for (const leg of result.legs) {
      expect(leg.points.slice(0, 5)).toEqual(result.trunk);
      expect(leg.points.at(-1)).toEqual(legs[leg.id].points.at(-1));
      expect(leg.points[5][0]).toBeGreaterThan(10);
    }
    expect(legs).toEqual(before);
  });
  it("preserves independent same-bank roads", () => {
    const result = convergeRiverRoadLegs(
      [-50, 0],
      [
        ...legs,
        {
          id: 9,
          points: [
            [-50, 0],
            [-40, 30]
          ]
        }
      ],
      [plan()],
      100
    )!;
    expect(result.legs.map(leg => leg.id)).toEqual([0, 1, 2]);
  });
  it("preserves a lone crossing road with the same certified bridge contract", () => {
    const result = convergeRiverRoadLegs([-50, 0], [legs[0]], [plan()], 100)!;
    expect(result.legs).toHaveLength(1);
    expect(result.legs[0].points.at(-1)).toEqual(legs[0].points.at(-1));
    expect(result.trunk.slice(2, 4)).toEqual([
      [-6, 0],
      [6, 0]
    ]);
  });
  it("does not borrow an unvalidated crossing", () => {
    const candidate = plan();
    candidate.crossing.deckA = [6, 1];
    expect(convergeRiverRoadLegs([-50, 0], legs, [candidate], 100)).toBeNull();
  });
  it("rejects wet outside arms and unsupported approach land", () => {
    const candidate = plan();
    candidate.input.otherWater = [
      {
        id: 8,
        rings: [
          [
            [-35, -20],
            [-25, -20],
            [-25, 20],
            [-35, 20]
          ]
        ]
      }
    ];
    expect(convergeRiverRoadLegs([-50, 0], legs, [candidate], 100)).toBeNull();
    const blocked = plan();
    blocked.input.supportsDryFootprint = () => false;
    expect(convergeRiverRoadLegs([-50, 0], legs, [blocked], 100)).toBeNull();
  });
  it("moves a lone road to a nearby perpendicular section when its direct approach hits a lake", () => {
    const source = input();
    source.otherWater = [
      {
        id: 8,
        rings: [
          [
            [-35, -5],
            [-25, -5],
            [-25, 5],
            [-35, 5]
          ]
        ]
      }
    ];
    const nearby = { ...source, arcLengthMeters: 130 };
    const result = convergeRiverRoadLegs([-50, 0], [legs[1]], [plan(source), plan(nearby)], 100)!;
    expect(result).not.toBeNull();
    expect(result.crossing.q).toEqual([0, 30]);
    expect(result.trunk.slice(2, 4)).toEqual([
      [-6, 30],
      [6, 30]
    ]);
    expect(result.legs[0].points.at(-1)).toEqual([50, 0]);
  });
});
