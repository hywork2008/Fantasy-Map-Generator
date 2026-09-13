import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyFuneralSimulationState, simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { createDefaultRaces, raceIdByKey } from "../data/races";
import type { MilitaryRegiment } from "../types/models";
import type { PackedGraph } from "../types/PackedGraph";
import { processFuneralDeaths, resetFuneralState } from "./funeralRites";
import { currentLandTroops, scaleLandMilitary } from "./manpower";
import { advanceAlongPath } from "./regimentMovement";
import { raiseUndeadOnCellEntered, reinjectRaisedUndead, snapshotRisenRegiments } from "./undeadRaising";

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
    simulationContext.funeral.seeded = true;
  });

  afterEach(() => {
    simulationContext.funeral = createEmptyFuneralSimulationState();
  });

  function army(state: number, cell: number): MilitaryRegiment {
    const r = { i: 0, state, cell, a: 100, t: 100, u: { infantry: 100 }, n: 0, x: cell * 10, y: 0 } as MilitaryRegiment;
    worldContext.pack.states[state].military!.push(r);
    return r;
  }

  function war(): void {
    worldContext.pack.states[1].diplomacy![2] = "Enemy";
    worldContext.pack.states[2].diplomacy![1] = "Enemy";
  }

  it("raises only entered cells, merges into the marching army, and stops while stationary", () => {
    stubWorld("inhumation");
    war();
    processFuneralDeaths(2, 100);
    processFuneralDeaths(3, 100);
    const r = army(1, 1);
    r.path = [1, 2];
    r.pathIndex = 0;
    advanceAlongPath(worldContext.pack, r, 10, raiseUndeadOnCellEntered);
    expect(r.a).toBe(180);
    expect(r.t).toBe(100);
    expect(currentLandTroops(worldContext.pack.states[1])).toBe(100);
    expect(worldContext.pack.states[1].military).toHaveLength(1);
    expect(simulationContext.funeral.remainsByCell[2]).toBeUndefined();
    expect(simulationContext.funeral.remainsByCell[3]).toBe(80);

    processFuneralDeaths(2, 100);
    for (let i = 0; i < 20; i++) advanceAlongPath(worldContext.pack, r, 100, raiseUndeadOnCellEntered);
    expect(r.a).toBe(180);
    expect(simulationContext.funeral.remainsByCell[2]).toBe(80);
    expect(simulationContext.funeral.remainsByCell[3]).toBe(80);
  });

  it("raises every traversed enemy cell during a long advance without leaving separate hosts", () => {
    stubWorld("inhumation");
    war();
    processFuneralDeaths(2, 100);
    processFuneralDeaths(3, 100);
    const r = army(1, 1);
    r.path = [1, 2, 3];
    r.pathIndex = 0;
    advanceAlongPath(worldContext.pack, r, 100, raiseUndeadOnCellEntered);
    expect(r.a).toBe(260);
    expect(r.cell).toBe(3);
    expect(worldContext.pack.states[1].military).toHaveLength(1);
    expect(simulationContext.funeral.remainsByCell).toEqual({});
    expect(raiseUndeadOnCellEntered(r, 3)).toBe(false);
  });

  it.each([false, true])("raises defenders only in the invaded cell (existing defender=%s)", existing => {
    stubWorld("inhumation");
    war();
    // Graves remain after this human cell becomes Lich territory.
    processFuneralDeaths(2, 100);
    processFuneralDeaths(3, 100);
    worldContext.pack.cells.state[2] = 1;
    const defender = existing ? army(1, 2) : undefined;
    const invader = army(2, 2);
    expect(raiseUndeadOnCellEntered(invader, 2)).toBe(true);
    const host = worldContext.pack.states[1].military![0];
    expect(host.a).toBe(existing ? 180 : 80);
    if (defender) expect(host).toBe(defender);
    else expect(host.isRisen).toBe(true);
    expect(invader.a).toBe(100);
    expect(simulationContext.funeral.remainsByCell[3]).toBe(80);
  });

  it.each(["peace", "own land", "fleet", "destroyed", "water", "cremation"])("does not raise on %s", scenario => {
    stubWorld(scenario === "cremation" ? "cremation" : "inhumation");
    war();
    processFuneralDeaths(2, 100);
    const r = army(1, 2);
    if (scenario === "peace") {
      worldContext.pack.states[1].diplomacy![2] = "Ally";
      worldContext.pack.states[2].diplomacy![1] = "Ally";
    }
    if (scenario === "own land") worldContext.pack.cells.state[2] = 1;
    if (scenario === "fleet") r.n = 1;
    if (scenario === "destroyed") r.a = 0;
    if (scenario === "water") worldContext.pack.cells.h[2] = 10;
    expect(raiseUndeadOnCellEntered(r, 2)).toBe(false);
    expect(r.u).toEqual({ infantry: 100 });
  });

  it("preserves the undead component across living-population scaling and military rebuild", () => {
    stubWorld("inhumation");
    war();
    processFuneralDeaths(2, 100);
    const r = army(1, 2);
    raiseUndeadOnCellEntered(r, 2);
    scaleLandMilitary(worldContext.pack.states[1], 0.5);
    expect(r.a).toBe(130);
    expect(r.u.skeletons! + r.u.zombies!).toBe(80);
    snapshotRisenRegiments();
    worldContext.pack.states[1].military = [];
    reinjectRaisedUndead();
    expect(worldContext.pack.states[1].military![0].a).toBe(80);
  });
});
