import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setGuildChapters,
  setGuildKnowledgeStocks,
  setIndividualSkills
} from "../economyContext";
import { listGuildsForBurg } from "./burgGuilds";

describe("listGuildsForBurg", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      burgs: [undefined, { i: 1, cell: 0, x: 0, y: 0, state: 1, name: "Anvil" }],
      characters: [
        {
          i: 7,
          name: "Master Arin",
          roles: [
            {
              source: "economy",
              kind: "guildMaster",
              entityType: "burg",
              entityId: 1,
              domain: "metallurgy",
              label: "Guild Master"
            }
          ]
        }
      ],
      cells: { i: [0], p: [[0, 0]], h: Uint8Array.from([55]), r: Uint16Array.from([0]), routes: {} }
    } as unknown as PackedGraph;
  });

  afterEach(() => clearEconomyContext());

  it("lists an empty formal hall and an informal stock separately", () => {
    setGuildChapters([{ burgId: 1, domain: "metallurgy", foundedYear: 500, status: "chapter", suitability: 0.9 }]);
    setGuildKnowledgeStocks([{ burgId: 1, domain: "textiles", stock: 0.4, treasury: 12 }]);
    setIndividualSkills([
      {
        characterId: 7,
        domain: "blacksmithing",
        proficiency: 82,
        aptitude: "gifted",
        techniques: ["heatTreatment"],
        reconstructionLeads: [{ technique: "patternWelding", progress: 0.45 }]
      }
    ]);

    expect(listGuildsForBurg(1)).toEqual([
      expect.objectContaining({
        domain: "metallurgy",
        status: "chapter",
        stock: 0,
        treasury: 0,
        foundedYear: 500,
        masterName: "Master Arin",
        masterProficiency: 82,
        masterAptitude: "gifted",
        masterTechniques: ["heatTreatment"],
        masterReconstructionLeads: [{ technique: "patternWelding", progress: 0.45 }]
      }),
      expect.objectContaining({ domain: "textiles", status: "informal", stock: 0.4, treasury: 12, foundedYear: null })
    ]);
  });
});
