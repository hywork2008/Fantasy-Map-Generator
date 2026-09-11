import { describe, expect, it } from "vitest";
import type { Burg, Culture, State } from "../types/models";
import {
  calculateAffinity,
  calculateEconomicDependence,
  calculateThreat,
  determineOverallStance,
  evaluateBurgStanceToState
} from "./independentBurgStance";

describe("independentBurgStance", () => {
  const cultures: Culture[] = [
    { i: 0, name: "Wildlands", base: 0 },
    { i: 1, name: "Aethel", base: 1 },
    { i: 2, name: "Gaelic", base: 1 }, // same base
    { i: 3, name: "Zul", base: 5 } // distant base
  ];

  it("calculates affinity with culture bonuses and alien penalties", () => {
    const burg: Burg = { cell: 1, x: 0, y: 0, culture: 1 };
    const sameCultState: State = { i: 1, name: "State 1", culture: 1 } as State;
    const sameGroupState: State = { i: 2, name: "State 2", culture: 2 } as State;
    const alienState: State = { i: 3, name: "State 3", culture: 3 } as State;

    expect(calculateAffinity(burg, sameCultState, cultures)).toBe(40);
    expect(calculateAffinity(burg, sameGroupState, cultures)).toBe(15);
    expect(calculateAffinity(burg, alienState, cultures)).toBe(-25);
  });

  it("calculates threat based on expansionism, enclosure and distance", () => {
    const burg: Burg = { cell: 1, x: 0, y: 0 };
    const state: State = { i: 1, name: "Empire", expansionism: 2.5 } as State;

    // Distant, low enclosure
    const lowThreat = calculateThreat(burg, state, { distance: 1600, borderEnclosureRatio: 0 });
    expect(lowThreat).toBeLessThan(30);

    // Enclosed and very close
    const highThreat = calculateThreat(burg, state, { distance: 100, borderEnclosureRatio: 0.8 });
    expect(highThreat).toBeGreaterThan(80);
  });

  it("calculates economic dependence with trade routes and proximity", () => {
    const burg: Burg = { cell: 1, x: 0, y: 0, port: 1 };
    const state: State = { i: 1, name: "Naval Power", type: "Naval" } as State;

    const connected = calculateEconomicDependence(burg, state, {
      hasTradeRoute: true,
      distance: 250
    });
    // baseline 10 + tradeRoute 35 + close 25 + naval/port 15 = 85
    expect(connected).toBe(85);
  });

  it("determines overall stance categories", () => {
    // Overwhelming threat + low resolve = submissive
    expect(determineOverallStance(10, 80, 30)).toBe("submissive");

    // High affinity + low threat = friendly
    expect(determineOverallStance(40, 30, 50)).toBe("friendly");

    // High threat + high resolve = hostile
    expect(determineOverallStance(-10, 75, 70)).toBe("hostile");

    // Moderate everything = cautious
    expect(determineOverallStance(10, 45, 40)).toBe("cautious");
  });

  it("evaluates comprehensive burg stance", () => {
    const burg: Burg = {
      cell: 10,
      x: 100,
      y: 100,
      culture: 1,
      independentGovernance: {
        form: "autocracy",
        defenseResolve: 35,
        factions: [],
        stances: {}
      }
    };
    const state: State = {
      i: 1,
      name: "Dominion",
      culture: 1,
      expansionism: 2.0
    } as State;

    const stance = evaluateBurgStanceToState(burg, state, {
      cultures,
      distance: 150,
      borderEnclosureRatio: 0.9,
      hasTradeRoute: true
    });

    expect(stance.targetStateId).toBe(1);
    expect(stance.affinity).toBe(40);
    expect(stance.threat).toBeGreaterThan(70);
    expect(stance.economicDependence).toBeGreaterThan(60);
    expect(stance.overallStance).toBe("submissive");
  });
});
