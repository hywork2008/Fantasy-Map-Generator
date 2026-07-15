import { beforeEach, describe, expect, it } from "vitest";
import type { Burg, State } from "../../hostTypes";
import type { ShipyardCandidate } from "./shipyardCandidates";
import {
  clearShipyardQueues,
  type GetEffectiveSkillFn,
  getCompletedHulls,
  getHullsAtBurg,
  getInitialStateOwnedDemand,
  getQueueEntry,
  getStateTechPoints,
  isStateAtWar,
  runShipyardTick
} from "./shipyardQueue";

function makeBurgs(overrides: Partial<Burg>[]): Burg[] {
  const burgs: Burg[] = [{} as Burg]; // index 0 is unused, matches pack.burgs convention
  for (const o of overrides) burgs.push({ x: 0, y: 0, cell: 0, ...o } as Burg);
  return burgs;
}

// rulerId is declared via a module augmentation in nobility/types.ts (only activated
// when that file is imported); declare it locally so this test stays self-contained
// and doesn't need to import another extension's types just for one optional field.
function makeStates(overrides: (Partial<State> & { rulerId?: number })[]): State[] {
  const states: State[] = [{} as State];
  for (const o of overrides) states.push({ ...o } as State);
  return states;
}

const noSkill: GetEffectiveSkillFn = () => 0; // no Nobility ruler data -> engineering multiplier stays 1x

describe("shipyardQueue", () => {
  beforeEach(() => {
    clearShipyardQueues();
  });

  it("assigns a state-owned queue to a state capital", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, [], 1, noSkill);

    expect(getQueueEntry(1)?.owner).toBe("state");
  });

  it("assigns a state-owned queue to a fortified (citadel) port even if not the capital", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 0, citadel: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, [], 1, noSkill);

    expect(getQueueEntry(1)?.owner).toBe("state");
  });

  it("assigns a market-owned queue to an ordinary port of a state", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 0, citadel: 0 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, [], 1, noSkill);

    expect(getQueueEntry(1)?.owner).toBe("market");
  });

  it("assigns a market-owned queue to a stateless (free-city) port", () => {
    const burgs = makeBurgs([{ i: 1, state: 0 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, [], 1, noSkill);

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

    runShipyardTick(candidates, burgs, [], 3, noSkill); // 2 shipyards * 1 point/year * 3 years

    expect(getStateTechPoints(1)).toBe(6);
  });

  it("completes a sloop hull exactly when progress reaches its build-point threshold, then resets", () => {
    const burgs = makeBurgs([{ i: 1, state: 0 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    // BUILD_POINTS_PER_YEAR=2, sloop.buildPointsRequired=10 -> exactly 5 years to complete one hull
    runShipyardTick(candidates, burgs, [], 5, noSkill);

    expect(getCompletedHulls("market", 1, "sloop")).toBe(1);
    expect(getQueueEntry(1)?.progress).toBe(0);
  });

  it("drains every hull completed within a single large tick, not just one", () => {
    const burgs = makeBurgs([{ i: 1, state: 0 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    // BUILD_POINTS_PER_YEAR=2 * 21 years = 42 progress -> floor(42/10) = 4 sloops, 2 leftover
    runShipyardTick(candidates, burgs, [], 21, noSkill);

    expect(getCompletedHulls("market", 1, "sloop")).toBe(4);
    expect(getQueueEntry(1)?.progress).toBe(2);
  });

  it("only advances work batches whose materials Economy fulfills", () => {
    const burgs = makeBurgs([{ i: 1, state: 0, market: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];
    const requests: number[] = [];

    runShipyardTick(candidates, burgs, [], 1, noSkill, request => {
      requests.push(request.workPoints);
      return { status: "insufficientMaterials", missing: { Wood: 0.1 } };
    });

    expect(getQueueEntry(1)).toMatchObject({ progress: 0, blockedReason: "insufficientMaterials" });
    expect(requests).toEqual([0.5]);

    runShipyardTick(candidates, burgs, [], 1, noSkill, () => ({ status: "fulfilled" }));

    expect(getQueueEntry(1)).toMatchObject({ progress: 2, blockedReason: undefined });
  });

  it("notifies Economy of annual material demand for state-owned queues only", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1, market: 2 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];
    const demands: unknown[] = [];

    runShipyardTick(
      candidates,
      burgs,
      [],
      1,
      noSkill,
      () => ({ status: "fulfilled" }),
      demand => demands.push(demand)
    );

    expect(demands).toEqual([
      {
        source: "shipbuilding",
        stateId: 1,
        destinationMarketId: 2,
        annualMaterials: { Wood: 0.4, Sails: 0.4, Ropes: 0.4, Tar: 0.2 }
      }
    ]);
  });

  it("requests exactly one Sloop recipe over its full construction progress", () => {
    const burgs = makeBurgs([{ i: 1, state: 0, market: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];
    const consumed = { Wood: 0, Sails: 0, Ropes: 0, Tar: 0 };

    runShipyardTick(candidates, burgs, [], 5, noSkill, request => {
      for (const material of Object.keys(consumed) as Array<keyof typeof consumed>) {
        consumed[material] += request.materials[material];
      }
      return { status: "fulfilled" };
    });

    expect(consumed.Wood).toBeCloseTo(2, 10);
    expect(consumed.Sails).toBeCloseTo(2, 10);
    expect(consumed.Ropes).toBeCloseTo(2, 10);
    expect(consumed.Tar).toBeCloseTo(1, 10);
    expect(getCompletedHulls("market", 1, "sloop")).toBe(1);
  });

  it("upgrades a state's queue to caravel once tech points clear the threshold", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    // 1 shipyard * 1 point/year * 60 years = 60 tech points >= 50 required for caravel
    runShipyardTick(candidates, burgs, [], 60, noSkill);

    expect(getStateTechPoints(1)).toBe(60);
    expect(getQueueEntry(1)?.shipClassId).toBe("caravel");
  });

  it("boosts tech point accumulation with the state ruler's Engineering skill", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
    const states = makeStates([{ i: 1, rulerId: 42 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];
    const engineering100: GetEffectiveSkillFn = (characterId, skill) =>
      characterId === 42 && skill === "engineering" ? 100 : 0;

    // 1 shipyard * 1 point/year * 10 years * (1 + 100/100) = 20, vs. 10 with no bonus
    runShipyardTick(candidates, burgs, states, 10, engineering100);

    expect(getStateTechPoints(1)).toBe(20);
  });

  it("applies no bonus when the state has no ruler (rulerId unset)", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
    const states = makeStates([{ i: 1 }]); // no rulerId
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];
    const engineering100: GetEffectiveSkillFn = () => 100;

    runShipyardTick(candidates, burgs, states, 10, engineering100);

    expect(getStateTechPoints(1)).toBe(10);
  });

  describe("hull lifecycle (docs/plan/ships.md 航海訓練・偽装通商・諜報)", () => {
    it("launches a peacetime-completed market hull straight to voyage, occupying no berth", () => {
      const burgs = makeBurgs([{ i: 1, state: 0 }]);
      const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

      runShipyardTick(candidates, burgs, [], 5, noSkill);

      const hulls = getHullsAtBurg(1);
      expect(hulls).toHaveLength(1);
      expect(hulls[0]).toMatchObject({ owner: "market", ownerId: 1, homeBurgId: 1, status: "voyage" });
    });

    it("launches a peacetime-completed state hull straight to voyage as well", () => {
      const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
      const states = makeStates([{ i: 1, diplomacy: [] }]);
      const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

      runShipyardTick(candidates, burgs, states, 5, noSkill);

      expect(getHullsAtBurg(1)[0]).toMatchObject({ owner: "state", ownerId: 1, status: "voyage" });
    });

    it("keeps a wartime-completed state hull docked/mobilized", () => {
      const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
      const states = makeStates([{ i: 1, diplomacy: ["Neutral", "Enemy"] }]);
      const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

      runShipyardTick(candidates, burgs, states, 5, noSkill);

      expect(getHullsAtBurg(1)[0]).toMatchObject({ owner: "state", status: "docked" });
    });

    it("isStateAtWar is true only when diplomacy includes an Enemy relation", () => {
      const states = makeStates([
        { i: 1, diplomacy: ["Neutral", "Ally"] },
        { i: 2, diplomacy: ["Neutral", "Enemy"] }
      ]);

      expect(isStateAtWar(1, states)).toBe(false);
      expect(isStateAtWar(2, states)).toBe(true);
    });
  });

  // New-map initial-stock warm-up input (docs/plan/shipbuilding-industrial-policy.md §4.6).
  describe("getInitialStateOwnedDemand", () => {
    const sloopDemand = { Wood: 0.4, Sails: 0.4, Ropes: 0.4, Tar: 0.2 };

    it("returns nothing for an empty candidate list", () => {
      expect(getInitialStateOwnedDemand([], [])).toEqual([]);
    });

    it("includes only state-owned (capital/citadel) shipyards, not ordinary market-owned ports", () => {
      const burgs = makeBurgs([
        { i: 1, state: 1, capital: 1, market: 10 },
        { i: 2, state: 1, capital: 0, citadel: 0, market: 10 }
      ]);
      const candidates: ShipyardCandidate[] = [
        { burgId: 1, forestRatio: 0.5 },
        { burgId: 2, forestRatio: 0.5 }
      ];

      const demands = getInitialStateOwnedDemand(candidates, burgs);

      expect(demands).toEqual([
        { source: "shipbuilding", stateId: 1, destinationMarketId: 10, annualMaterials: sloopDemand }
      ]);
    });

    it("sums multiple state-owned shipyards that share the same (state, market) pair", () => {
      const burgs = makeBurgs([
        { i: 1, state: 1, capital: 1, market: 10 },
        { i: 2, state: 1, capital: 0, citadel: 1, market: 10 }
      ]);
      const candidates: ShipyardCandidate[] = [
        { burgId: 1, forestRatio: 0.5 },
        { burgId: 2, forestRatio: 0.5 }
      ];

      const demands = getInitialStateOwnedDemand(candidates, burgs);

      expect(demands).toEqual([
        {
          source: "shipbuilding",
          stateId: 1,
          destinationMarketId: 10,
          annualMaterials: { Wood: 0.8, Sails: 0.8, Ropes: 0.8, Tar: 0.4 }
        }
      ]);
    });

    it("keeps separate entries for different (state, market) pairs", () => {
      const burgs = makeBurgs([
        { i: 1, state: 1, capital: 1, market: 10 },
        { i: 2, state: 2, capital: 1, market: 20 }
      ]);
      const candidates: ShipyardCandidate[] = [
        { burgId: 1, forestRatio: 0.5 },
        { burgId: 2, forestRatio: 0.5 }
      ];

      const demands = getInitialStateOwnedDemand(candidates, burgs);

      expect(demands).toHaveLength(2);
      expect(demands).toEqual(
        expect.arrayContaining([
          { source: "shipbuilding", stateId: 1, destinationMarketId: 10, annualMaterials: sloopDemand },
          { source: "shipbuilding", stateId: 2, destinationMarketId: 20, annualMaterials: sloopDemand }
        ])
      );
    });

    it("skips a candidate with no market or no state, even if otherwise state-owned", () => {
      const burgs = makeBurgs([
        { i: 1, state: 1, capital: 1 }, // no market assigned yet
        { i: 2, state: 0, capital: 1, market: 20 } // stateless (free city)
      ]);
      const candidates: ShipyardCandidate[] = [
        { burgId: 1, forestRatio: 0.5 },
        { burgId: 2, forestRatio: 0.5 }
      ];

      expect(getInitialStateOwnedDemand(candidates, burgs)).toEqual([]);
    });
  });
});
