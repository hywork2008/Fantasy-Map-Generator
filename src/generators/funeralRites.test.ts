import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createEmptyFuneralSimulationState, simulationContext } from "../context/simulationContext";
import { worldContext } from "../context/worldContext";
import { getBurialCulturePreset } from "../data/burialCultures";
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

describe("burial profile funeral mechanics", () => {
  it("uses culture-specific remains and aromatic material demand for live and historical deaths", () => {
    worldContext.populationRate = 1;
    worldContext.urbanization = 1;
    worldContext.pack = {
      cultures: [
        { i: 0 },
        {
          i: 1,
          name: "Catacombs",
          burialProfile: "catacomb_paris",
          funeralRite: "inhumation",
          race: 0,
          type: "Generic"
        }
      ],
      races: [],
      burgs: [{}],
      states: [{}],
      cells: {
        i: [0],
        h: new Uint8Array([25]),
        pop: new Float32Array([100]),
        culture: new Uint16Array([1]),
        burg: new Uint16Array(1),
        state: new Uint16Array(1),
        c: [[]],
        p: [[0, 0]],
        forestStock: new Float32Array([1]),
        forestCover: new Float32Array([1])
      }
    } as unknown as PackedGraph;
    resetFuneralState();
    processFuneralDeaths(0, 100);
    expect(getFuneralRemainsAtCell(0)).toBeCloseTo(60);
    expect(takePendingFuneralMaterials()[0]).toEqual({ wood: 0, stone: 2, linen: 0 });
    resetFuneralState();
    ensureFuneralRemainsSeeded();
    expect(getFuneralRemainsAtCell(0)).toBeCloseTo(120);
    worldContext.pack.cultures[1].burialProfile = {
      ...getBurialCulturePreset("roman_via_appia"),
      bodyFate: "mummification_embalmed",
      mechanics: {
        remainFraction: 0.9,
        zombieRatio: 0.7,
        sanitationRisk: 0.1,
        pilgrimageAppeal: 0.2,
        resourceCostPerCapita: { linen: 0.04, incense: 0.02 }
      }
    };
    worldContext.pack.cultures[1].funeralRite = "mummification";
    resetFuneralState();
    processFuneralDeaths(0, 100);
    expect(getFuneralRemainsAtCell(0)).toBeCloseTo(90);
    expect(takePendingFuneralMaterials()[0]).toEqual({ wood: 0, stone: 0, linen: 4, incense: 2 });
    resetFuneralState();
  });
});
