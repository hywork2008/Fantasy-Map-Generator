import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext, setRulerId } from "../../nobility/nobilityContext";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import {
  LEGIT_WAR_DISCONTENT_FLOOR,
  LEGIT_WAR_LEGITIMACY_CEILING,
  LEGIT_WAR_MIN_UNREST_CYCLES,
  LEGIT_WAR_RESOLVE_TICKS,
  tickLegitimacyWar
} from "./legitimacyWar";

function makePerson(overrides: Partial<Character> = {}): Character {
  return {
    i: 1,
    name: "Test",
    age: 40,
    gender: "male",
    culture: 0,
    titles: [],
    affinities: {},
    marriages: [],
    state: 1,
    skills: {} as Character["skills"],
    personality: {
      boldness: 50,
      compassion: 50,
      confidence: 50,
      energy: 50,
      greed: 50,
      guile: 50,
      honor: 50,
      piety: 50,
      rationality: 50,
      sociability: 50,
      vengefulness: 50,
      zeal: 50
    } as Character["personality"],
    family: {} as Character["family"],
    appearance: 0,
    prestige: 0,
    wealth: 10,
    pastTitles: [],
    dead: false,
    ...overrides
  } as Character;
}

describe("legitimacyWar (PR-15)", () => {
  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
    clearNobilityContext();
  });

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);
    initNobilityContext(api);
  });

  it("opens a legitimacy war when unrest, low legitimacy, and pretender align", () => {
    const handler = vi.fn();
    document.addEventListener("fmg:legitimacy-war", handler);

    const regime = makePerson({
      i: 2,
      name: "Usurper",
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1, startYear: 1000 }]
    });
    const pretender = makePerson({
      i: 1,
      name: "Old King",
      titles: [],
      pastTitles: [{ title: "King", landed: true, entityType: "state", entityId: 1, startYear: 990 }]
    });
    const state = {
      i: 1,
      form: "Monarchy",
      treasury: 30,
      civilUnrest: true,
      civilUnrestCycles: LEGIT_WAR_MIN_UNREST_CYCLES,
      coupLegitimacy: LEGIT_WAR_LEGITIMACY_CEILING - 5,
      militaryDiscontent: LEGIT_WAR_DISCONTENT_FLOOR,
      lastDebtCoup: { oldRulerId: 1, newRulerId: 2, oldRulerName: "Old King", newRulerName: "Usurper" }
    } as unknown as State;
    worldContext.pack = {
      characters: [pretender, regime],
      states: [undefined, state]
    } as unknown as PackedGraph;
    setRulerId(state, 2);

    const result = tickLegitimacyWar(state);
    expect(result.opened).toBe(true);
    expect(state.legitimacyWarActive).toBe(true);
    expect(state.legitimacyPretenderId).toBe(1);
    expect(handler).toHaveBeenCalled();
    document.removeEventListener("fmg:legitimacy-war", handler);
  });

  it("resolves for the regime when legitimacy recovers during the war", () => {
    const regime = makePerson({
      i: 2,
      name: "Usurper",
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
    });
    const pretender = makePerson({ i: 1, name: "Old King" });
    const state = {
      i: 1,
      form: "Monarchy",
      treasury: 40,
      legitimacyWarActive: true,
      legitimacyWarTicks: LEGIT_WAR_RESOLVE_TICKS - 1,
      legitimacyPretenderId: 1,
      legitimacyPretenderName: "Old King",
      coupLegitimacy: 60,
      militaryDiscontent: 70,
      civilUnrest: true
    } as unknown as State;
    worldContext.pack = {
      characters: [pretender, regime],
      states: [undefined, state]
    } as unknown as PackedGraph;
    setRulerId(state, 2);

    const result = tickLegitimacyWar(state);
    expect(result.resolved).toBe(true);
    expect(result.pretenderCrushed).toBe(true);
    expect(state.legitimacyWarActive).toBe(false);
  });
});
