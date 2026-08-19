import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { simulationContext } from "../../../context/simulationContext";
import { setTechnologyProgressForTests } from "../../../generators/technologyProgress";
import {
  getPersonalTechnologyKnowledge,
  initCharactersContext,
  setPersonalTechnologyKnowledge
} from "../../characters/charactersContext";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  getInstructionResidues,
  getTechnologyHints,
  initEconomyContext,
  setGoods,
  setMarkets
} from "../economyContext";
import { nearbyBurgs, startCopyNotes, startInstructMission, tickInstructMissions } from "./technologyInstruct";

describe("technologyInstruct", () => {
  beforeEach(() => {
    const api = { worldContext, simulationContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);
    simulationContext.currentYear = 1200;
    simulationContext.technology = { lastEvaluatedYear: null, progress: [] };
    worldContext.options = { year: 1200 } as typeof worldContext.options;
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Lab", removed: false, capital: 1, treasury: 80 }],
      burgs: [
        { i: 0 },
        { i: 1, state: 1, market: 1, capital: 1, cell: 1, x: 0, y: 0, removed: false },
        { i: 2, state: 1, market: 1, capital: 0, cell: 2, x: 10, y: 0, removed: false },
        { i: 3, state: 2, market: 2, capital: 1, cell: 9, x: 90, y: 0, removed: false }
      ],
      routes: [
        {
          i: 1,
          group: "roads",
          feature: 0,
          points: [
            [0, 0, 1],
            [10, 0, 2]
          ]
        }
      ],
      characters: [
        {
          i: 1,
          name: "Teacher",
          location: 1,
          dead: false,
          wealth: 20,
          titles: [],
          skills: { learning: 70 }
        }
      ]
    } as unknown as PackedGraph;
    setPersonalTechnologyKnowledge({ "1": "all" });
    setGoods([
      { i: 1, name: "Books", tags: [], value: 4, unit: "tome", icon: "good-books", color: "#864" },
      { i: 2, name: "Paper", tags: [], value: 2, unit: "sheet", icon: "good-paper", color: "#eee" }
    ]);
    setMarkets([
      {
        i: 1,
        centerBurgId: 1,
        color: "#111",
        goods: { 1: { stock: 4, price: 4 }, 2: { stock: 4, price: 2 } }
      }
    ]);
  });

  afterEach(() => {
    clearEconomyContext();
    setPersonalTechnologyKnowledge({});
    setTechnologyProgressForTests([]);
  });

  it("rejects teaching unknown personal knowledge", () => {
    setPersonalTechnologyKnowledge({ "1": ["recordReplication"] });
    const result = startInstructMission({
      characterId: 1,
      burgId: 1,
      technologyIds: ["experimentalNaturalPhilosophy"]
    });
    expect(result.ok).toBe(false);
  });

  it("pulses residue and a known-hint at the source burg after the lag+mission days", () => {
    expect(
      startInstructMission({
        characterId: 1,
        burgId: 1,
        technologyIds: ["experimentalNaturalPhilosophy"]
      }).ok
    ).toBe(true);
    tickInstructMissions(37, { spreadNeighborhood: true });
    expect(getInstructionResidues()[0]?.stock).toBeCloseTo(0.6);
    expect(getTechnologyHints()[0]?.technologyId).toBe("experimentalNaturalPhilosophy");
    expect(nearbyBurgs(1).get(2)).toBe(1);
    expect(nearbyBurgs(1).has(3)).toBe(false);
  });

  it("copy notes requires demonstrated and adds personal knowledge", () => {
    setPersonalTechnologyKnowledge({});
    setTechnologyProgressForTests([
      { technologyId: "improvedMining", scope: "state", ownerId: 1, stage: "known", diffusion: 0 }
    ]);
    expect(startCopyNotes({ characterId: 1, burgId: 1, technologyId: "improvedMining" }).ok).toBe(false);
    setTechnologyProgressForTests([
      { technologyId: "improvedMining", scope: "state", ownerId: 1, stage: "demonstrated", diffusion: 0 }
    ]);
    expect(startCopyNotes({ characterId: 1, burgId: 1, technologyId: "improvedMining" }).ok).toBe(true);
    tickInstructMissions(14);
    expect(getPersonalTechnologyKnowledge()["1"]).toContain("improvedMining");
  });
});
