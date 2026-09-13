import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyFuneralSimulationState, simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { createDefaultRaces, raceIdByKey } from "../data/races";
import type { PackedGraph } from "../types/PackedGraph";
import { processFuneralDeaths, resetFuneralState } from "./funeralRites";
import { raiseUndeadWhereLichPresent, SKELETON_UNIT_NAME, ZOMBIE_UNIT_NAME } from "./undeadRaising";

describe("undeadRaising", () => {
  const races = createDefaultRaces();
  const human = raceIdByKey(races, "human");
  const lich = raceIdByKey(races, "lich");

  function stubWorld(burialRite: "inhumation" | "cremation"): void {
    const n = 4;
    worldContext.populationRate = 1;
    worldContext.options = { military: [] } as never;
    worldContext.pack = {
      races,
      cultures: [
        { i: 0, name: "Wildlands", race: 0, shield: "" },
        { i: 1, name: "Morbane", race: lich, type: "Highland", funeralRite: "inhumation", shield: "" },
        { i: 2, name: "Folk", race: human, type: "Generic", funeralRite: burialRite, shield: "" }
      ],
      burgs: [0 as never],
      states: [
        { i: 0, diplomacy: [] },
        {
          i: 1,
          name: "Morbane",
          culture: 1,
          military: [],
          diplomacy: ["x", "x", "Neutral"]
        },
        {
          i: 2,
          name: "Folkland",
          culture: 2,
          military: [],
          diplomacy: ["x", "Neutral", "x"]
        }
      ],
      cells: {
        i: Array.from({ length: n }, (_, i) => i),
        h: new Uint8Array(n).fill(25),
        pop: new Float32Array(n).fill(50),
        culture: new Uint16Array([0, 1, 2, 2]),
        burg: new Uint16Array(n),
        state: new Uint16Array([0, 1, 2, 2]),
        province: new Uint16Array(n),
        c: [[], [2], [1], [2]],
        p: Array.from({ length: n }, (_, i) => [i * 10, 0] as [number, number])
      }
    } as unknown as PackedGraph;
  }

  beforeEach(() => {
    resetFuneralState();
  });

  afterEach(() => {
    simulationContext.funeral = createEmptyFuneralSimulationState();
  });

  it("raises burial remains next to a Lich realm as hostile undead soldiers", () => {
    stubWorld("inhumation");
    processFuneralDeaths(2, 100);
    expect(raiseUndeadWhereLichPresent()).toBe(true);

    const risen = worldContext.pack.states[1].military?.find(r => r.isRisen);
    expect(risen).toBeTruthy();
    expect((risen?.u[SKELETON_UNIT_NAME] ?? 0) + (risen?.u[ZOMBIE_UNIT_NAME] ?? 0)).toBeGreaterThan(0);
    expect(worldContext.pack.states[1].diplomacy?.[2]).toBe("Enemy");
    expect(worldContext.pack.states[2].diplomacy?.[1]).toBe("Enemy");
    expect(simulationContext.funeral.remainsByCell[2]).toBeUndefined();
  });

  it.each([
    [2, 3],
    [3, 2]
  ])("freezes the aura for a chain through cells %i and %i", (near, far) => {
    stubWorld("inhumation");
    worldContext.pack.cells.c = [[], [near], [], []];
    worldContext.pack.cells.c[near] = [1, far];
    worldContext.pack.cells.c[far] = [near];
    processFuneralDeaths(near, 100);
    processFuneralDeaths(far, 100);

    raiseUndeadWhereLichPresent();
    expect(simulationContext.funeral.remainsByCell[near]).toBeUndefined();
    expect(simulationContext.funeral.remainsByCell[far]).toBe(80);
    expect(worldContext.pack.states[1].military?.map(r => r.cell)).toEqual([near]);

    raiseUndeadWhereLichPresent();
    expect(simulationContext.funeral.remainsByCell[far]).toBeUndefined();
    expect(worldContext.pack.states[1].military?.map(r => r.cell)).toEqual([near, far]);
  });

  it("cannot raise cremated dead", () => {
    stubWorld("cremation");
    processFuneralDeaths(2, 100);
    expect(raiseUndeadWhereLichPresent()).toBe(false);
    expect(worldContext.pack.states[1].military).toEqual([]);
  });
});
