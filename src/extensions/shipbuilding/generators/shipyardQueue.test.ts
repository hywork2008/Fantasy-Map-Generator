import { beforeEach, describe, expect, it } from "vitest";
import type { Burg } from "../../hostTypes";
import type { ShipyardCandidate } from "./shipyardCandidates";
import {
  clearShipyardQueues,
  getCompletedHulls,
  getQueueEntry,
  getStateTechPoints,
  runShipyardTick
} from "./shipyardQueue";

function makeBurgs(overrides: Partial<Burg>[]): Burg[] {
  const burgs: Burg[] = [{} as Burg]; // index 0 is unused, matches pack.burgs convention
  for (const o of overrides) burgs.push({ x: 0, y: 0, cell: 0, ...o } as Burg);
  return burgs;
}

describe("shipyardQueue", () => {
  beforeEach(() => {
    clearShipyardQueues();
  });

  it("assigns a state-owned queue to a state capital", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, 1);

    expect(getQueueEntry(1)?.owner).toBe("state");
  });

  it("assigns a state-owned queue to a fortified (citadel) port even if not the capital", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 0, citadel: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, 1);

    expect(getQueueEntry(1)?.owner).toBe("state");
  });

  it("assigns a market-owned queue to an ordinary port of a state", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 0, citadel: 0 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, 1);

    expect(getQueueEntry(1)?.owner).toBe("market");
  });

  it("assigns a market-owned queue to a stateless (free-city) port", () => {
    const burgs = makeBurgs([{ i: 1, state: 0 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, 1);

    expect(getQueueEntry(1)?.owner).toBe("market");
  });

  it("accumulates state tech points proportional to shipyard count", () => {
    const burgs = makeBurgs([
      { i: 1, state: 1, capital: 1 },
      { i: 2, state: 1, capital: 0 }
    ]);
    const candidates: ShipyardCandidate[] = [
      { burgId: 1, forestRatio: 0.5 },
      { burgId: 2, forestRatio: 0.5 }
    ];

    runShipyardTick(candidates, burgs, 3); // 2 shipyards * 1 point/year * 3 years

    expect(getStateTechPoints(1)).toBe(6);
  });

  it("completes a sloop hull exactly when progress reaches its build-point threshold, then resets", () => {
    const burgs = makeBurgs([{ i: 1, state: 0 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    // BUILD_POINTS_PER_YEAR=2, sloop.buildPointsRequired=10 -> exactly 5 years to complete one hull
    runShipyardTick(candidates, burgs, 5);

    expect(getCompletedHulls("market", 1, "sloop")).toBe(1);
    expect(getQueueEntry(1)?.progress).toBe(0);
  });

  it("drains every hull completed within a single large tick, not just one", () => {
    const burgs = makeBurgs([{ i: 1, state: 0 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    // BUILD_POINTS_PER_YEAR=2 * 21 years = 42 progress -> floor(42/10) = 4 sloops, 2 leftover
    runShipyardTick(candidates, burgs, 21);

    expect(getCompletedHulls("market", 1, "sloop")).toBe(4);
    expect(getQueueEntry(1)?.progress).toBe(2);
  });

  it("upgrades a state's queue to caravel once tech points clear the threshold", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    // 1 shipyard * 1 point/year * 60 years = 60 tech points >= 50 required for caravel
    runShipyardTick(candidates, burgs, 60);

    expect(getStateTechPoints(1)).toBe(60);
    expect(getQueueEntry(1)?.shipClassId).toBe("caravel");
  });
});
