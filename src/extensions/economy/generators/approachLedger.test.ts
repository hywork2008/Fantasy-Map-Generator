import { describe, expect, it } from "vitest";
import { applyApproachJourney, approachesOfJourney, decayApproachRows } from "./approachLedger";
import type { TradeRouteSegment } from "./marketTypes";

// Cells 0..4 in a row along x; burgs 1 (cell 0), 2 (cell 2, passed through), 3 (cell 4).
// Route 7 runs 0-1-2-3-4.
function pack() {
  const routes: Record<number, Record<number, number>> = {};
  const link = (a: number, b: number) => {
    routes[a] = { ...routes[a], [b]: 7 };
    routes[b] = { ...routes[b], [a]: 7 };
  };
  for (let c = 0; c < 4; c++) link(c, c + 1);
  return {
    cells: { burg: [1, 0, 2, 0, 3], routes, p: [0, 1, 2, 3, 4].map(x => [x * 10, 0]), fl: [0, 0, 0, 0, 0] },
    burgs: [
      { cell: 0, x: 0, y: 0 },
      { i: 1, cell: 0, x: 0, y: 0 },
      { i: 2, cell: 2, x: 20, y: 0 },
      { i: 3, cell: 4, x: 40, y: 0 }
    ]
  } as never;
}
const land: TradeRouteSegment[] = [{ type: "land", points: [0, 1, 2, 2, 3, 4].map(c => [c * 10, 0, c]) }];

describe("approach ledger", () => {
  it("gives a through-town route separate gates on each side", () => {
    const ends = approachesOfJourney(pack(), land, 1, 3);
    expect(ends.outbound?.approachId).toBe("burg:1:route:7:edge:1");
    expect(ends.inbound?.approachId).toBe("burg:3:route:7:edge:3");
    expect(ends.through.map(ref => ref.approachId)).toEqual(["burg:2:route:7:edge:1", "burg:2:route:7:edge:3"]);
  });

  it("records outbound, inbound and through flows and decays them", () => {
    const rows = applyApproachJourney([], approachesOfJourney(pack(), land, 1, 3), {
      originBurgId: 1,
      destinationBurgId: 3,
      cargoSlots: 10,
      value: 5,
      goods: [{ id: 4, slots: 10 }]
    });
    const row = (id: string) => rows.find(r => r.approachId === id)!;
    expect(row("burg:1:route:7:edge:1").outbound).toEqual({ departures: 1, cargoSlots: 10, value: 5 });
    expect(row("burg:3:route:7:edge:3").inbound.cargoSlots).toBe(10);
    expect(row("burg:3:route:7:edge:3").partners).toEqual({ 1: 10 });
    expect(row("burg:2:route:7:edge:3").through).toEqual({ departures: 1, cargoSlots: 10 });
    expect(decayApproachRows(rows)[0].outbound.cargoSlots).toBe(7);
  });

  it("uses sea and open approaches off the route network", () => {
    const sea: TradeRouteSegment[] = [
      {
        type: "sea",
        points: [
          [0, 0, 0],
          [0, -10, 9]
        ]
      }
    ];
    expect(approachesOfJourney(pack(), sea, 1, 3).outbound?.mode).toBe("sea");
    const wild: TradeRouteSegment[] = [
      {
        type: "land",
        points: [
          [0, 0, 0],
          [0, -10, 9]
        ]
      }
    ];
    expect(approachesOfJourney(pack(), wild, 1, 3).outbound?.approachId).toBe("burg:1:open:n");
  });
});
