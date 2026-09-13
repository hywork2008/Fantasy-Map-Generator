import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyFuneralSimulationState, simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { createDefaultRaces, raceIdByKey } from "../data/races";
import type { PackedGraph } from "../types/PackedGraph";
import {
  ensureFuneralRemainsSeeded,
  getFuneralRemainsAtCell,
  processFuneralDeaths,
  resetFuneralState,
  takePendingFuneralMaterials
} from "./funeralRites";

describe("funeralRites", () => {
  const races = createDefaultRaces();
  const human = raceIdByKey(races, "human");
  const lich = raceIdByKey(races, "lich");

  function stubPack(opts: { funeralRite: string; cultureRace?: number }): void {
    const n = 4;
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.pack = {
      races,
      cultures: [
        { i: 0, name: "Wildlands", race: 0, shield: "" },
        {
          i: 1,
          name: "Folk",
          race: opts.cultureRace ?? human,
          type: "Generic",
          funeralRite: opts.funeralRite,
          shield: ""
        }
      ],
      burgs: [0 as never],
      states: [{ i: 0 }, { i: 1, culture: 1 }],
      cells: {
        i: Array.from({ length: n }, (_, i) => i),
        h: new Uint8Array(n).fill(25),
        pop: new Float32Array(n).fill(100),
        culture: new Uint16Array(n).fill(1),
        burg: new Uint16Array(n),
        state: new Uint16Array(n).fill(1),
        c: Array.from({ length: n }, () => []),
        p: Array.from({ length: n }, (_, i) => [i, 0] as [number, number]),
        forestStock: new Float32Array(n).fill(1),
        forestCover: new Float32Array(n).fill(1)
      }
    } as unknown as PackedGraph;
  }

  beforeEach(() => {
    resetFuneralState();
  });

  afterEach(() => {
    simulationContext.funeral = createEmptyFuneralSimulationState();
  });

  it("buries most of the dead and queues coffin wood", () => {
    stubPack({ funeralRite: "inhumation" });
    processFuneralDeaths(1, 100);
    expect(getFuneralRemainsAtCell(1)).toBeCloseTo(80);
    const pending = takePendingFuneralMaterials();
    expect(pending[1]?.wood).toBeCloseTo(2);
  });

  it("cremates without leaving raisable remains, consuming pyre wood", () => {
    stubPack({ funeralRite: "cremation" });
    processFuneralDeaths(1, 100);
    expect(getFuneralRemainsAtCell(1)).toBe(0);
    expect(takePendingFuneralMaterials()[1]?.wood).toBeCloseTo(12);
  });

  it("does not bury the dead of a Lich culture", () => {
    stubPack({ funeralRite: "inhumation", cultureRace: lich });
    processFuneralDeaths(1, 100);
    expect(getFuneralRemainsAtCell(1)).toBe(0);
    expect(takePendingFuneralMaterials()).toEqual({});
  });

  it("seeds historical graves for burial cultures and skips cremation", () => {
    stubPack({ funeralRite: "inhumation" });
    worldContext.pack.cultures[1].funeralRite = "inhumation";
    ensureFuneralRemainsSeeded();
    expect(getFuneralRemainsAtCell(1)).toBeGreaterThan(0);

    resetFuneralState();
    stubPack({ funeralRite: "cremation" });
    ensureFuneralRemainsSeeded();
    expect(getFuneralRemainsAtCell(1)).toBe(0);
  });
});
