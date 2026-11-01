import { describe, expect, it } from "vitest";
import {
  type ApproachPriorGood,
  type ApproachPriorLink,
  type ApproachPriorTown,
  approachPrior,
  approachPriorFromWorld,
  blendApproachProfiles
} from "./approachPrior";
import { approachProfiles } from "./approachProfile";

/**
 * §5 on the §4.3 shape: same-market population beyond the gate, and through-traffic when the
 * path from the market centre crosses the town. Town 4 is another market and must not count.
 * East (pop 30 end + 30 through) beats west (pop 10 end + 30 through).
 */
const towns: ApproachPriorTown[] = [
  { id: "1", population: 10, marketId: "m", center: true },
  { id: "2", population: 5, marketId: "m" },
  { id: "3", population: 30, marketId: "m" },
  { id: "4", population: 100, marketId: "other" }
];

const links: ApproachPriorLink[] = [
  { fromId: "1", toId: "2", approachId: "east", length: 10 },
  { fromId: "2", toId: "1", approachId: "west", length: 10 },
  { fromId: "2", toId: "3", approachId: "east", length: 10 },
  { fromId: "3", toId: "2", approachId: "west", length: 10 },
  { fromId: "2", toId: "4", approachId: "north", length: 5 },
  { fromId: "4", toId: "2", approachId: "south", length: 5 }
];

function linePack() {
  const routes: Record<number, Record<number, number>> = {};
  const link = (a: number, b: number, routeId: number) => {
    routes[a] = { ...routes[a], [b]: routeId };
    routes[b] = { ...routes[b], [a]: routeId };
  };
  for (let cell = 0; cell < 4; cell++) link(cell, cell + 1, 7);
  link(2, 5, 8);
  return {
    cells: {
      burg: [1, 0, 2, 0, 3, 4],
      routes,
      p: [
        [0, 0],
        [10, 0],
        [20, 0],
        [30, 0],
        [40, 0],
        [20, 10]
      ]
    },
    burgs: [
      undefined,
      { i: 1, cell: 0, x: 0, y: 0, population: 10, market: 1 },
      { i: 2, cell: 2, x: 20, y: 0, population: 5, market: 1 },
      { i: 3, cell: 4, x: 40, y: 0, population: 30, market: 1 },
      { i: 4, cell: 5, x: 20, y: 10, population: 100, market: 9 }
    ]
  };
}

describe("approach prior", () => {
  it("picks the gate toward the larger same-market town and marks the path that crosses", () => {
    const prior = approachPrior({ townId: "2", towns, links, retention: 0.7 });
    expect(prior.baseline).toBe(100);
    expect(prior.profiles.get("east")).toMatchObject({
      share: 0.6,
      throughShare: 0.5,
      axisPartner: "west",
      inboundShare: 0.5,
      cargo: {},
      wagonsPerYear: 0.353,
      source: "prior"
    });
    expect(prior.profiles.get("west")).toMatchObject({
      share: 0.4,
      throughShare: 0.75,
      axisPartner: "east",
      wagonsPerYear: 0.235,
      source: "prior"
    });
    expect(prior.profiles.has("north")).toBe(false);
  });

  it("estimates cargo from a partner surplus and a home shortage", () => {
    const goods: ApproachPriorGood[] = [
      { id: "grain", cargoClass: "grain", homeStock: 1, partnerStock: 5, approachId: "east", unitValue: 2 },
      { id: "wool", cargoClass: "livestock", homeStock: 5, partnerStock: 1, approachId: "west", unitValue: 2 }
    ];
    const prior = approachPrior({ townId: "2", towns, links, goods, retention: 0.7 });
    expect(prior.profiles.get("east")?.cargo).toEqual({ grain: 1 });
    expect(prior.profiles.get("east")?.cargoValue).toEqual({ grain: 1 });
    expect(prior.profiles.get("east")?.inboundShare).toBe(1);
    expect(prior.profiles.get("west")?.cargo).toEqual({});
    expect(prior.profiles.get("west")?.inboundShare).toBe(0);
  });

  it("walks the route graph to the same gates the ledger uses", () => {
    const prior = approachPriorFromWorld({
      burgId: 2,
      pack: linePack(),
      markets: [
        { i: 1, centerBurgId: 1, goods: { 4: { stock: 1 } } },
        { i: 9, centerBurgId: 4, goods: { 4: { stock: 8 } } }
      ],
      goods: [{ i: 4, tags: ["cereal"], value: 3 }],
      classOf: tags => (tags?.includes("cereal") ? "grain" : "other"),
      retention: 0.7
    });
    const east = "burg:2:route:7:edge:3";
    const west = "burg:2:route:7:edge:1";
    const side = "burg:2:route:8:edge:5";
    expect(prior.profiles.get(east)?.share).toBe(0.6);
    expect(prior.profiles.get(west)?.share).toBe(0.4);
    expect(prior.profiles.get(east)?.axisPartner).toBe(west);
    expect(prior.profiles.get(side)).toMatchObject({ share: 0, cargo: { grain: 1 }, inboundShare: 1, source: "prior" });
  });

  it("blends by annual flow over annual flow plus the prior baseline, then keeps a full ledger", () => {
    const prior = approachPrior({ townId: "2", towns, links, retention: 0.7 }).profiles;
    const ledger = new Map([
      [
        "east",
        {
          share: 1,
          throughShare: 0,
          inboundShare: 0.4,
          cargo: { grain: 1 },
          cargoValue: {},
          wagonsPerYear: 2,
          source: "ledger" as const
        }
      ]
    ]);
    const blended = blendApproachProfiles(ledger, prior, 3, 100);
    expect(blended.get("east")).toMatchObject({
      share: 0.612,
      throughShare: 0.485,
      axisPartner: "west",
      inboundShare: 0.497,
      wagonsPerYear: 0.401,
      source: "blend"
    });
    expect(blended.get("west")?.share).toBe(0.388);
    expect(blended.get("west")?.source).toBe("blend");

    const full = blendApproachProfiles(ledger, prior, 100, 100);
    expect(full.get("east")).toEqual(ledger.get("east"));
    expect(full.has("west")).toBe(false);

    const fresh = blendApproachProfiles(new Map(), prior, 0, 100);
    expect(fresh.get("east")?.source).toBe("prior");
    expect(fresh.get("east")?.share).toBe(0.6);
  });

  it("leaves a ledger profile marked ledger", () => {
    const profiles = approachProfiles(
      [
        {
          approachId: "gate",
          inbound: { cargoSlots: 10 },
          outbound: { cargoSlots: 0 },
          through: { cargoSlots: 0 },
          goodsSlots: {}
        }
      ],
      () => "grain",
      0.7
    );
    expect(profiles.get("gate")?.source).toBe("ledger");
    expect(profiles.get("gate")?.share).toBe(1);
  });
});
