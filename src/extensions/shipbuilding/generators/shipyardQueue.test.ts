import { beforeEach, describe, expect, it } from "vitest";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import type { Burg, State } from "../../hostTypes";
import type { PortCapacity } from "./portCapacity";
import type { ShipyardCandidate } from "./shipyardCandidates";
import {
  clearShipyardQueues,
  type GetEffectiveSkillFn,
  getCompletedHulls,
  getHullsAtBurg,
  getInitialStateOwnedDemand,
  getQueueEntry,
  getStateNavalCrewCapacity,
  getStateTechPoints,
  isStateAtWar,
  runShipyardTick,
  setHullStatus
} from "./shipyardQueue";

/** Technology-graph gate for caravel/galleon (roadmap Phase 3); tests that assert higher hulls must seed it. */
function unlockOceanGoingHulls(stateId: number, stage: "demonstrated" | "adopted" = "demonstrated"): void {
  setTechnologyProgressForTests([
    {
      technologyId: "oceanGoingHulls",
      scope: "state",
      ownerId: stateId,
      stage,
      diffusion: stage === "adopted" ? 0.2 : 0
    },
    {
      technologyId: "oceanNavigation",
      scope: "state",
      ownerId: stateId,
      stage: stage === "adopted" ? "known" : "locked",
      diffusion: 0
    }
  ]);
}

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
    // Default: no ocean-going tech — sloop only unless a test unlocks higher tiers.
    setTechnologyProgressForTests([]);
  });

  it("assigns a state-owned queue to a state capital", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, [], 1, noSkill);

    expect(getQueueEntry(1)?.owner).toBe("state");
  });

  it("counts only completed, serviceable state hulls toward naval crew capacity", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];
    const allowMaterials = () => ({ status: "fulfilled" as const });

    for (let i = 0; i < 5; i++) runShipyardTick(candidates, burgs, makeStates([{}]), 1, noSkill, allowMaterials);

    expect(getStateNavalCrewCapacity(1)).toBe(100);
    const hull = getHullsAtBurg(1)[0];
    setHullStatus(hull.id, "maintenance");
    expect(getStateNavalCrewCapacity(1)).toBe(0);
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

  it("only advances work batches whose materials Economy fulfills, and preserves the attempted work points across the failure", () => {
    const burgs = makeBurgs([{ i: 1, state: 0, market: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];
    const requests: number[] = [];

    runShipyardTick(candidates, burgs, [], 1, noSkill, request => {
      requests.push(request.workPoints);
      return { status: "insufficientMaterials", missing: { Wood: 0.1 } };
    });

    expect(getQueueEntry(1)).toMatchObject({
      progress: 0,
      blockedReason: "insufficientMaterials",
      pendingWorkPoints: 0.5
    });
    expect(requests).toEqual([0.5]);

    // The failed attempt's 0.5 carries over on top of this tick's own 2 build points (BUILD_POINTS_PER_YEAR),
    // so all 2.5 accumulated work points clear once materials become available — not just the new tick's 2.
    runShipyardTick(candidates, burgs, [], 1, noSkill, () => ({ status: "fulfilled" }));

    expect(getQueueEntry(1)).toMatchObject({ progress: 2.5, blockedReason: undefined });
  });

  it("does not force a state-owned shipyard to reaccumulate a full MATERIAL_REQUEST_WORK_POINTS threshold from zero after one bad day", () => {
    // Mirrors real daily Advance Time: SHIPYARD_BUILD_POINTS_PER_YEAR=2 accrued over ~1/365.2425
    // of a year per tick, ~0.00548 build points/day. Reaching the 0.5 request threshold from zero
    // takes ~91 days; before the fix, one failed attempt at that threshold reset the accumulator
    // and forced another ~91-day wait — so a shipyard could show 0% for an entire year even though
    // materials were only ever missing on the one day each ~quarter that the threshold was hit.
    const oneDay = 1 / 365.2425;
    const burgs = makeBurgs([{ i: 1, state: 0, market: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    for (let day = 0; day < 91; day++) {
      runShipyardTick(candidates, burgs, [], oneDay, noSkill, () => ({ status: "fulfilled" }));
    }
    // ~91 days accumulates just under the 0.5 request threshold — no request attempted yet.
    expect(getQueueEntry(1)?.progress).toBe(0);
    expect(getQueueEntry(1)?.blockedReason).toBeUndefined();

    // The day the threshold is finally crossed, materials happen to be unavailable.
    runShipyardTick(candidates, burgs, [], oneDay, noSkill, () => ({ status: "insufficientMaterials", missing: {} }));
    expect(getQueueEntry(1)).toMatchObject({ progress: 0, blockedReason: "insufficientMaterials" });

    // Materials arrive the very next day — this must succeed immediately, not ~91 days later.
    runShipyardTick(candidates, burgs, [], oneDay, noSkill, () => ({ status: "fulfilled" }));
    expect(getQueueEntry(1)?.progress).toBeGreaterThan(0);
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
    unlockOceanGoingHulls(1, "demonstrated");

    // 1 shipyard * 1 point/year * 60 years = 60 tech points >= 50 required for caravel
    runShipyardTick(candidates, burgs, [], 60, noSkill);

    expect(getStateTechPoints(1)).toBe(60);
    expect(getQueueEntry(1)?.shipClassId).toBe("caravel");
  });

  it("turns only a market queue's unused capacity into a port-limited generic ship stock", () => {
    const burgs = makeBurgs([{ i: 1, state: 0, market: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];
    const portCapacity: ReadonlyMap<number, PortCapacity> = new Map([[1, { small: 1, medium: 1, large: 0 }]]);
    const stock = { Sloop: 0, Caravel: 0, Galleon: 0 };
    const completed: string[] = [];

    const requestMaterials = ({ owner }: { owner: string }) =>
      owner === "market"
        ? { status: "insufficientMaterials" as const, missing: { Wood: 0.1 } }
        : { status: "fulfilled" as const };
    const getShipStock = () => ({ ...stock });
    const addShipStock = (_burgId: number, _marketId: number, shipClassId: string) => {
      completed.push(shipClassId);
      stock[shipClassId === "sloop" ? "Sloop" : shipClassId === "caravel" ? "Caravel" : "Galleon"]++;
      return true;
    };

    runShipyardTick(
      candidates,
      burgs,
      [],
      5,
      noSkill,
      requestMaterials,
      undefined,
      getShipStock,
      addShipStock,
      portCapacity
    );
    runShipyardTick(
      candidates,
      burgs,
      [],
      1,
      noSkill,
      requestMaterials,
      undefined,
      getShipStock,
      addShipStock,
      portCapacity
    );

    expect(completed).toEqual(["sloop"]);
    expect(stock).toEqual({ Sloop: 1, Caravel: 0, Galleon: 0 });
    expect(getHullsAtBurg(1)).toEqual([]);
    expect(getCompletedHulls("market", 1, "sloop")).toBe(0);
  });

  it("never starts the surplus stream at a state-owned shipyard", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1, market: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];
    const completed: string[] = [];

    runShipyardTick(
      candidates,
      burgs,
      [],
      5,
      noSkill,
      ({ owner }) => (owner === "market" ? { status: "insufficientMaterials", missing: {} } : { status: "fulfilled" }),
      undefined,
      () => ({ Sloop: 0, Caravel: 0, Galleon: 0 }),
      (_burgId, _marketId, shipClassId) => {
        completed.push(shipClassId);
        return true;
      },
      new Map([[1, { small: 99, medium: 99, large: 99 }]])
    );

    expect(completed).toEqual([]);
  });

  it("shares a berth tier between docked hulls and generic ship stock", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1, market: 1 }]);
    const states = makeStates([{ i: 1, diplomacy: ["Enemy"] }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];
    const capacity = new Map([[1, { small: 1, medium: 1, large: 0 }]]);
    const completed: string[] = [];
    const getShipStock = () => ({ Sloop: 0, Caravel: 0, Galleon: 0 });
    const addShipStock = (_burgId: number, _marketId: number, shipClassId: string) => {
      completed.push(shipClassId);
      return true;
    };

    // Build a docked state hull first, then make this same burg an ordinary market yard.
    runShipyardTick(candidates, burgs, states, 5, noSkill);
    expect(getHullsAtBurg(1)[0]?.status).toBe("docked");
    burgs[1].capital = 0;

    runShipyardTick(
      candidates,
      burgs,
      states,
      5,
      noSkill,
      ({ owner }) => (owner === "market" ? { status: "insufficientMaterials", missing: {} } : { status: "fulfilled" }),
      undefined,
      getShipStock,
      addShipStock,
      capacity
    );
    expect(completed).toEqual([]);

    setHullStatus(getHullsAtBurg(1)[0].id, "voyage");
    runShipyardTick(
      candidates,
      burgs,
      states,
      5,
      noSkill,
      ({ owner }) => (owner === "market" ? { status: "insufficientMaterials", missing: {} } : { status: "fulfilled" }),
      undefined,
      getShipStock,
      addShipStock,
      capacity
    );
    runShipyardTick(
      candidates,
      burgs,
      states,
      1,
      noSkill,
      ({ owner }) => (owner === "market" ? { status: "insufficientMaterials", missing: {} } : { status: "fulfilled" }),
      undefined,
      getShipStock,
      addShipStock,
      capacity
    );

    expect(completed).toEqual(["sloop"]);
  });

  it("uses one Caravel stock slot when unlocked, then returns to Sloop instead of producing Galleons", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, market: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];
    const capacity = new Map([[1, { small: 2, medium: 1, large: 1 }]]);
    const stock = { Sloop: 1, Caravel: 0, Galleon: 0 };
    const completed: string[] = [];
    const requestMaterials = ({ owner }: { owner: string }) =>
      owner === "market" ? { status: "insufficientMaterials" as const, missing: {} } : { status: "fulfilled" as const };
    const getShipStock = () => ({ ...stock });
    const addShipStock = (_burgId: number, _marketId: number, shipClassId: string) => {
      completed.push(shipClassId);
      stock[shipClassId === "sloop" ? "Sloop" : shipClassId === "caravel" ? "Caravel" : "Galleon"]++;
      return true;
    };

    // Tech points + technology-graph gate (oceanGoingHulls demonstrated) unlock Caravel.
    unlockOceanGoingHulls(1, "demonstrated");
    runShipyardTick(candidates, burgs, [], 50, noSkill);
    runShipyardTick(
      candidates,
      burgs,
      [],
      12.5,
      noSkill,
      requestMaterials,
      undefined,
      getShipStock,
      addShipStock,
      capacity
    );
    runShipyardTick(
      candidates,
      burgs,
      [],
      0.5,
      noSkill,
      requestMaterials,
      undefined,
      getShipStock,
      addShipStock,
      capacity
    );
    expect(completed).toEqual(["caravel"]);

    runShipyardTick(
      candidates,
      burgs,
      [],
      5,
      noSkill,
      requestMaterials,
      undefined,
      getShipStock,
      addShipStock,
      capacity
    );
    runShipyardTick(
      candidates,
      burgs,
      [],
      1,
      noSkill,
      requestMaterials,
      undefined,
      getShipStock,
      addShipStock,
      capacity
    );

    expect(completed).toEqual(["caravel", "sloop"]);
    expect(completed).not.toContain("galleon");
  });

  it("finishes a partially built surplus hull's class even if the heuristic would switch mid-build", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, market: 1 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];
    const capacity = new Map([[1, { small: 5, medium: 5, large: 5 }]]);
    const completed: string[] = [];
    const requestMaterials = ({ owner }: { owner: string }) =>
      owner === "market" ? { status: "insufficientMaterials" as const, missing: {} } : { status: "fulfilled" as const };
    const addShipStock = (_burgId: number, _marketId: number, shipClassId: string) => {
      completed.push(shipClassId);
      return true;
    };

    // Sink half a Sloop's worth of progress (and materials) while Caravel is still locked.
    runShipyardTick(candidates, burgs, [], 1, noSkill); // tech warm-up, doesn't touch the surplus stream
    runShipyardTick(
      candidates,
      burgs,
      [],
      2.75,
      noSkill,
      requestMaterials,
      undefined,
      () => ({ Sloop: 0, Caravel: 0, Galleon: 0 }),
      addShipStock,
      capacity
    );
    expect(completed).toEqual([]);

    // Cross the Caravel tech threshold via a plain (non-surplus) tick, then report a Sloop
    // already in stock (e.g. imported by trade) — exactly the condition that would otherwise
    // make the heuristic switch the in-progress hull to Caravel.
    runShipyardTick(candidates, burgs, [], 50, noSkill);
    runShipyardTick(
      candidates,
      burgs,
      [],
      2.75,
      noSkill,
      requestMaterials,
      undefined,
      () => ({ Sloop: 1, Caravel: 0, Galleon: 0 }),
      addShipStock,
      capacity
    );

    // The half-finished hull must complete as the Sloop it was started as, not be silently
    // reset into a fresh, still-incomplete Caravel that throws away the materials already spent.
    expect(completed).toEqual(["sloop"]);
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
