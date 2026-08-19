import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import {
  clearEconomyContext,
  initEconomyContext,
  setInstructionResidues,
  setResearchNamedSeats
} from "../economyContext";
import { ACADEMY_SATURATION_WORKERS } from "./academyKnowledge";
import { GUILD_SATURATION_WORKERS } from "./guildKnowledge";
import {
  extraWorkersFromEngineering,
  extraWorkersFromResidue,
  extraWorkersKey,
  getDerivedExtraWorkers,
  RESIDUE_ACADEMY_SATURATION_WORKERS,
  RESIDUE_GUILD_SATURATION_WORKERS
} from "./technologyBiasApply";

function character(id: number, engineering: number): Character {
  return {
    i: id,
    name: `Character ${id}`,
    age: 30,
    gender: "female",
    culture: 0,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {
      artistry: 1,
      diplomacy: 1,
      engineering,
      geography: 1,
      intrigue: 1,
      learning: 1,
      martial: 1,
      prowess: 1,
      stewardship: 1
    },
    personality: {
      boldness: 1,
      compassion: 1,
      greed: 1,
      honor: 1,
      rationality: 1,
      sociability: 1,
      vengefulness: 1,
      zeal: 1,
      energy: 1,
      piety: 1,
      guile: 1,
      confidence: 1
    },
    family: { spouses: 0, children: 0, grandchildren: 0, greatGrandchildren: 0 },
    appearance: 50,
    prestige: 50,
    wealth: 0,
    pastTitles: []
  };
}

describe("technologyBiasApply", () => {
  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);
    worldContext.pack = { characters: [] } as unknown as PackedGraph;
  });

  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  it("uses the same residue saturation as guild and academy settlers", () => {
    expect(RESIDUE_GUILD_SATURATION_WORKERS).toBe(GUILD_SATURATION_WORKERS);
    expect(RESIDUE_ACADEMY_SATURATION_WORKERS).toBe(ACADEMY_SATURATION_WORKERS);
  });

  it("maps workshop engineering bands and treats missing skills as one worker", () => {
    expect(extraWorkersFromEngineering(undefined)).toBe(1);
    expect(extraWorkersFromEngineering(null)).toBe(1);
    expect(extraWorkersFromEngineering(59)).toBe(0);
    expect(extraWorkersFromEngineering(60)).toBe(1);
    expect(extraWorkersFromEngineering(79)).toBe(1);
    expect(extraWorkersFromEngineering(80)).toBe(2);
    expect(extraWorkersFromEngineering(94)).toBe(2);
    expect(extraWorkersFromEngineering(95)).toBe(3);
  });

  it("converts residue stock to extraWorkers capped at saturation", () => {
    expect(extraWorkersFromResidue(0.6, ACADEMY_SATURATION_WORKERS)).toBe(4.8);
    expect(extraWorkersFromResidue(0.6, GUILD_SATURATION_WORKERS)).toBe(3.6);
    expect(extraWorkersFromResidue(1.5, GUILD_SATURATION_WORKERS)).toBe(GUILD_SATURATION_WORKERS);
    expect(extraWorkersFromResidue(0, GUILD_SATURATION_WORKERS)).toBe(0);
  });

  it("rebuilds an empty scratchpad when seats and residues are empty", () => {
    expect(getDerivedExtraWorkers().size).toBe(0);
  });

  it("adds one metallurgy worker from a mineLaborer seat", () => {
    setResearchNamedSeats([{ burgId: 2, characterId: 4, role: "mineLaborer" }]);
    const entry = getDerivedExtraWorkers().get(extraWorkersKey(2, "metallurgy"));
    expect(entry?.extraWorkers).toBe(1);
  });

  it("maps a workshopResearcher seat onto academy naturalPhilosophy from character engineering", () => {
    worldContext.pack.characters = [character(7, 95)];
    setResearchNamedSeats([{ burgId: 3, characterId: 7, role: "workshopResearcher" }]);
    const entry = getDerivedExtraWorkers().get(extraWorkersKey(3, "naturalPhilosophy"));
    expect(entry?.extraWorkers).toBe(3);
  });

  it("treats a workshopResearcher seat with no character skills as one extra worker", () => {
    setResearchNamedSeats([{ burgId: 3, characterId: 99, role: "workshopResearcher" }]);
    const entry = getDerivedExtraWorkers().get(extraWorkersKey(3, "naturalPhilosophy"));
    expect(entry?.extraWorkers).toBe(1);
  });

  it("does not treat trial seats as extraWorkers", () => {
    setResearchNamedSeats([{ burgId: 1, characterId: 1, role: "trialMachinist", mineOperationId: 8 }]);
    expect(getDerivedExtraWorkers().size).toBe(0);
  });

  it("adds residue extraWorkers for scholarly and craft domains", () => {
    setInstructionResidues([
      { burgId: 1, domain: "naturalPhilosophy", stock: 0.6, sourceCharacterId: 1, lastPulseYear: 500 },
      { burgId: 1, domain: "metallurgy", stock: 0.6, sourceCharacterId: 1, lastPulseYear: 500 }
    ]);
    const workers = getDerivedExtraWorkers();
    expect(workers.get(extraWorkersKey(1, "naturalPhilosophy"))?.extraWorkers).toBe(4.8);
    expect(workers.get(extraWorkersKey(1, "metallurgy"))?.extraWorkers).toBe(3.6);
  });
});
