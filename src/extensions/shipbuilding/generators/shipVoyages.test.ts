import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Burg, State } from "../../hostTypes";
import { runVoyageTick } from "./shipVoyages";
import type { ShipyardCandidate } from "./shipyardCandidates";
import type { GetEffectiveSkillFn } from "./shipyardQueue";
import { clearShipyardQueues, getHulls, runShipyardTick } from "./shipyardQueue";

function makeBurgs(overrides: Partial<Burg>[]): Burg[] {
  const burgs: Burg[] = [{} as Burg];
  for (const o of overrides) burgs.push({ x: 0, y: 0, cell: 0, ...o } as Burg);
  return burgs;
}

function makeStates(overrides: Partial<State>[]): State[] {
  const states: State[] = [{} as State];
  for (const o of overrides) states.push({ ...o } as State);
  return states;
}

const noSkill: GetEffectiveSkillFn = () => 0;

function dispatchedEventsOf(spy: ReturnType<typeof vi.spyOn>, type: string): { detail: Record<string, unknown> }[] {
  return spy.mock.calls
    .map(([event]) => event as CustomEvent)
    .filter(event => event.type === type)
    .map(event => ({ detail: event.detail as Record<string, unknown> }));
}

describe("runVoyageTick", () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clearShipyardQueues();
    dispatchSpy = vi.spyOn(document, "dispatchEvent");
  });

  afterEach(() => {
    dispatchSpy.mockRestore();
  });

  it("keeps a wartime navy hull docked and pays no income or intel", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
    const states = makeStates([{ i: 1, diplomacy: ["Neutral", "Enemy"] }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    // BUILD_POINTS_PER_YEAR=2, sloop.buildPointsRequired=10 -> exactly 5 years to complete one hull
    runShipyardTick(candidates, burgs, states, 5, noSkill);
    expect(getHulls()[0].status).toBe("docked");

    runVoyageTick(burgs, states, 1);

    expect(getHulls()[0].status).toBe("docked");
    expect(dispatchedEventsOf(dispatchSpy, "fmg:shipbuilding-voyage-income")).toHaveLength(0);
    expect(dispatchedEventsOf(dispatchSpy, "fmg:shipbuilding-voyage-intel")).toHaveLength(0);
  });

  it("recalls a peacetime voyage hull to dock once its state goes to war", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
    const peaceStates = makeStates([{ i: 1, diplomacy: [] }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, peaceStates, 5, noSkill);
    expect(getHulls()[0].status).toBe("voyage"); // completed at peace -> launched straight out

    const warStates = makeStates([{ i: 1, diplomacy: ["Neutral", "Enemy"] }]);
    runVoyageTick(burgs, warStates, 1);

    expect(getHulls()[0].status).toBe("docked");
  });

  it("sends a docked wartime hull back out once the war ends, paying gold income", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
    const warStates = makeStates([{ i: 1, diplomacy: ["Neutral", "Enemy"] }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, warStates, 5, noSkill);
    expect(getHulls()[0].status).toBe("docked");

    const peaceStates = makeStates([{ i: 1, diplomacy: [] }]);
    runVoyageTick(burgs, peaceStates, 1);

    expect(getHulls()[0].status).toBe("voyage");
    const incomeEvents = dispatchedEventsOf(dispatchSpy, "fmg:shipbuilding-voyage-income");
    expect(incomeEvents).toHaveLength(1);
    // sloop.buildPointsRequired=10 * GOLD_PER_BUILD_POINT_PER_YEAR=4 * deltaYears=1
    expect(incomeEvents[0].detail.amount).toBe(40);
    expect(incomeEvents[0].detail.stateId).toBe(1);
  });

  it("gathers intel for a state hull against its most-watched rival (Enemy > Rival > Suspicion)", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 1 }]);
    const states = makeStates([{ i: 1 }, { i: 2 }, { i: 3 }]);
    states[1].diplomacy = ["Neutral", undefined as unknown as string, "Rival", "Suspicion"];
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, states, 5, noSkill);
    expect(getHulls()[0].status).toBe("voyage");

    runVoyageTick(burgs, states, 1);

    const intelEvents = dispatchedEventsOf(dispatchSpy, "fmg:shipbuilding-voyage-intel");
    expect(intelEvents).toHaveLength(1);
    expect(intelEvents[0].detail.observerStateId).toBe(1);
    expect(intelEvents[0].detail.targetStateId).toBe(2); // "Rival" beats "Suspicion"
    // INTEL_GAIN_PER_YEAR=3 * deltaYears=1
    expect(intelEvents[0].detail.amount).toBe(3);
  });

  it("never gathers intel for a market-owned hull", () => {
    const burgs = makeBurgs([{ i: 1, state: 1, capital: 0, citadel: 0 }]); // ordinary port -> market owner
    const states = makeStates([{ i: 1, diplomacy: ["Neutral", "Rival"] }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, states, 5, noSkill);
    expect(getHulls()[0].owner).toBe("market");

    runVoyageTick(burgs, states, 1);

    expect(dispatchedEventsOf(dispatchSpy, "fmg:shipbuilding-voyage-intel")).toHaveLength(0);
    expect(dispatchedEventsOf(dispatchSpy, "fmg:shipbuilding-voyage-income")).toHaveLength(1);
  });

  it("skips income/intel for a stateless free-city hull (no treasury to credit)", () => {
    const burgs = makeBurgs([{ i: 1, state: 0 }]);
    const candidates: ShipyardCandidate[] = [{ burgId: 1, forestRatio: 0.5 }];

    runShipyardTick(candidates, burgs, [], 5, noSkill);
    expect(getHulls()[0].owner).toBe("market");

    runVoyageTick(burgs, [], 1);

    expect(dispatchedEventsOf(dispatchSpy, "fmg:shipbuilding-voyage-income")).toHaveLength(0);
  });
});
