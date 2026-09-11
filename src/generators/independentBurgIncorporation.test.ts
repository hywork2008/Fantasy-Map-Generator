import { describe, expect, it } from "vitest";
import type { Burg, IndependentBurgStance, State } from "../types/models";
import {
  applyBurgIncorporation,
  evaluateDiplomaticIncorporation,
  evaluateMilitaryUltimatum,
  evaluateThirdPartyIntervention
} from "./independentBurgIncorporation";

describe("independentBurgIncorporation", () => {
  it("evaluates diplomatic incorporation acceptance with autonomy guarantee", () => {
    const burg: Burg = {
      cell: 1,
      x: 100,
      y: 100,
      name: "Freehaven",
      independentGovernance: {
        form: "free_commune",
        defenseResolve: 40,
        factions: [
          { targetStateId: 0, weight: 40, label: "Independent" },
          { targetStateId: 1, weight: 60, label: "Pro-State" }
        ],
        stances: {}
      }
    };
    const state: State = { i: 1, name: "Kingdom" } as State;
    const stance: IndependentBurgStance = {
      targetStateId: 1,
      affinity: 40,
      threat: 30,
      economicDependence: 50,
      overallStance: "friendly"
    };

    const accepted = evaluateDiplomaticIncorporation({
      burg,
      state,
      stance,
      guaranteeAutonomy: true
    });

    expect(accepted.accepted).toBe(true);
    expect(accepted.autonomyStatus).toBe("protectorate");
  });

  it("evaluates diplomatic incorporation rejection when sovereignty is prioritized", () => {
    const burg: Burg = {
      cell: 1,
      x: 100,
      y: 100,
      name: "Ironhold",
      independentGovernance: {
        form: "autocracy",
        defenseResolve: 70,
        factions: [
          { targetStateId: 0, weight: 80, label: "Strict Sovereign" },
          { targetStateId: 1, weight: 20, label: "Pro-State" }
        ],
        stances: {}
      }
    };
    const state: State = { i: 1, name: "Empire" } as State;
    const stance: IndependentBurgStance = {
      targetStateId: 1,
      affinity: -20,
      threat: 60,
      economicDependence: 10,
      overallStance: "hostile"
    };

    const rejected = evaluateDiplomaticIncorporation({
      burg,
      state,
      stance,
      guaranteeAutonomy: false
    });

    expect(rejected.accepted).toBe(false);
    expect(rejected.autonomyStatus).toBe("full_independent");
  });

  it("evaluates military ultimatum outcomes", () => {
    // Low resolve faced with 4x overwhelming force capitulates
    const weakBurg: Burg = {
      cell: 1,
      x: 0,
      y: 0,
      independentGovernance: {
        form: "autocracy",
        defenseResolve: 20,
        factions: [],
        stances: {}
      }
    };
    const state: State = { i: 1, name: "Invaders" } as State;
    const capitulated = evaluateMilitaryUltimatum({
      burg: weakBurg,
      state,
      militaryRatio: 4.0
    });
    expect(capitulated.outcome).toBe("capitulation");
    expect(capitulated.autonomyStatus).toBe("tributary");

    // Fortress burg with high resolve resists
    const fortBurg: Burg = {
      cell: 2,
      x: 0,
      y: 0,
      independentGovernance: {
        form: "autocracy",
        defenseResolve: 85,
        factions: [],
        stances: {}
      }
    };
    const resisted = evaluateMilitaryUltimatum({
      burg: fortBurg,
      state,
      militaryRatio: 2.0
    });
    expect(resisted.outcome).toBe("resistance");
    expect(resisted.autonomyStatus).toBe("full_independent");
  });

  it("evaluates third-party proxy intervention to protect buffer zone / prevent bridgehead", () => {
    const targetBurg: Burg = { cell: 10, x: 100, y: 100, name: "Border Port" };
    const aggressorState: State = { i: 1, name: "Aggressor Empire" } as State;
    const thirdPartyState: State = { i: 2, name: "Rival Coalition" } as State;

    const thirdPartyStance: IndependentBurgStance = {
      targetStateId: 2,
      affinity: 35,
      threat: 20,
      economicDependence: 50,
      overallStance: "friendly"
    };

    const intervention = evaluateThirdPartyIntervention({
      targetBurg,
      aggressorState,
      thirdPartyState,
      thirdPartyStanceToBurg: thirdPartyStance,
      areStatesRivals: true,
      distanceThirdPartyToBurg: 200
    });

    expect(intervention.shouldIntervene).toBe(true);
    expect(intervention.interventionType).toBe("declare_war");
    expect(intervention.reason).toContain("prevent Aggressor Empire from securing a vital bridgehead");
  });

  it("applies burg incorporation properly onto graph and models", () => {
    const burg: Burg = {
      cell: 5,
      x: 50,
      y: 50,
      state: 0,
      independentGovernance: {
        form: "free_commune",
        defenseResolve: 50,
        factions: [],
        stances: {}
      }
    };
    const cells = { state: new Uint16Array([0, 0, 0, 0, 0, 0]) };
    const state: State = { i: 2, name: "Protector Realm" } as State;

    applyBurgIncorporation(burg, state, cells, "protectorate");

    expect(burg.state).toBe(2);
    expect(cells.state[5]).toBe(2);
    expect(burg.independentGovernance?.autonomyStatus).toBe("protectorate");
    expect(burg.independentGovernance?.protectorStateId).toBe(2);
    expect(burg.stateHistory).toEqual([0, 2]);
  });

  it("advances annual independent burg diplomacy with neighboring states", async () => {
    const burg: Burg = {
      i: 1,
      cell: 1,
      x: 10,
      y: 10,
      state: 0,
      culture: 1,
      independentGovernance: {
        form: "patrician_council",
        defenseResolve: 30,
        factions: [{ targetStateId: 2, weight: 80, label: "Pro-State" }],
        stances: {}
      }
    };
    const states = [
      { i: 0, name: "Neutral" },
      { i: 1, name: "Far Realm" },
      { i: 2, name: "Neighbor State", culture: 1 }
    ] as State[];
    const cells = {
      c: [[], [2]], // cell 1 neighbors cell 2
      state: new Uint16Array([0, 0, 2]) // cell 2 belongs to state 2
    };

    const world = {
      pack: {
        burgs: [0 as any, burg],
        states,
        cells,
        cultures: []
      }
    };

    // Non-annual tick does nothing
    const notAnnual = (await import("./independentBurgIncorporation")).advanceIndependentBurgDiplomacy({
      world,
      simulation: { currentYear: 100, currentMonth: 5, currentDay: 1 }
    });
    expect(notAnnual).toBe(false);
    expect(burg.state).toBe(0);

    // Annual tick on Jan 1 triggers diplomacy
    const annualChanged = (await import("./independentBurgIncorporation")).advanceIndependentBurgDiplomacy({
      world,
      simulation: { currentYear: 100, currentMonth: 1, currentDay: 1 }
    });
    expect(annualChanged).toBe(true);
    expect(burg.state).toBe(2);
    expect(cells.state[1]).toBe(2);
    expect(burg.independentGovernance?.autonomyStatus).toBe("protectorate");
  });
});
