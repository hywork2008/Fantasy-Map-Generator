import { describe, expect, it } from "vitest";
import { attachApproachTraffic } from "./approachId";

describe("attachApproachTraffic", () => {
  it("shares a town's approach traffic and folds bundled routes into a shared crossing", () => {
    const roads: Parameters<typeof attachApproachTraffic>[0] = [
      { approachId: "burg:1:route:4:edge:9", routeId: 4 },
      { approachId: "burg:1:crossing:2", routeId: 5, sharedRouteIds: [5, 6] }
    ];
    attachApproachTraffic(roads, [
      { approachId: "burg:1:route:4:edge:9", routeId: 4, cargoSlots: 6, through: 0 },
      { approachId: "burg:1:route:5:edge:3", routeId: 5, cargoSlots: 1, through: 1 },
      { approachId: "burg:1:route:6:edge:7", routeId: 6, cargoSlots: 2, through: 0 }
    ]);
    expect(roads[0].approachTraffic).toEqual({ cargoSlots: 6, through: 0, share: 0.6 });
    expect(roads[1].approachTraffic).toEqual({ cargoSlots: 3, through: 1, share: 0.4 });
  });
});
