import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext, setRulerId } from "../../nobility/nobilityContext";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { DEBT_COUP_SUCCESS_DISCONTENT, DEBT_COUP_SUCCESS_STREAK, pickDebtCoupLeader, tryDebtCoup } from "./debtCoup";

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
    skills: { martial: 50 } as Character["skills"],
    personality: {
      boldness: 70,
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
    wealth: 20,
    pastTitles: [],
    dead: false,
    ...overrides
  } as Character;
}

describe("debtCoup (PR-13)", () => {
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

  it("picks the Marshal as coup leader", () => {
    const ruler = makePerson({
      i: 1,
      name: "King",
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1 }]
    });
    const marshal = makePerson({
      i: 2,
      name: "Marshal Max",
      titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1 }],
      skills: { martial: 80 } as Character["skills"]
    });
    const state = { i: 1, form: "Monarchy" } as unknown as State;
    worldContext.pack = {
      characters: [ruler, marshal],
      states: [undefined, state]
    } as unknown as PackedGraph;
    setRulerId(state, 1);

    const leader = pickDebtCoupLeader(state);
    expect(leader?.i).toBe(2);
  });

  it("transfers the crown after enough risk streak cycles", () => {
    const handler = vi.fn();
    document.addEventListener("fmg:debt-coup-success", handler);

    const ruler = makePerson({
      i: 1,
      name: "King Old",
      wealth: 40,
      titles: [{ title: "King", landed: true, entityType: "state", entityId: 1, startYear: 1000 }]
    });
    const marshal = makePerson({
      i: 2,
      name: "Marshal New",
      titles: [{ title: "Marshal", landed: false, entityType: "state", entityId: 1, startYear: 1000 }],
      skills: { martial: 80 } as Character["skills"]
    });
    const state = {
      i: 1,
      form: "Monarchy",
      treasury: 5,
      debtCoupRisk: true,
      debtCoupRiskStreak: DEBT_COUP_SUCCESS_STREAK - 1,
      militaryDiscontent: DEBT_COUP_SUCCESS_DISCONTENT
    } as unknown as State;
    worldContext.pack = {
      characters: [ruler, marshal],
      states: [undefined, state]
    } as unknown as PackedGraph;
    setRulerId(state, 1);

    const result = tryDebtCoup(state);
    expect(result.succeeded).toBe(true);
    expect(result.newRulerId).toBe(2);
    expect(result.oldRulerId).toBe(1);
    expect(marshal.titles.some(t => t.landed)).toBe(true);
    expect(ruler.titles.some(t => t.landed)).toBe(false);
    expect(state.debtCoupRisk).toBe(false);
    expect(handler).toHaveBeenCalled();
    expect(state.treasury).toBeGreaterThan(5);

    document.removeEventListener("fmg:debt-coup-success", handler);
  });

  it("does not coup without acute discontent", () => {
    const state = {
      i: 1,
      debtCoupRisk: true,
      debtCoupRiskStreak: 5,
      militaryDiscontent: 10
    } as unknown as State;
    const result = tryDebtCoup(state);
    expect(result.succeeded).toBe(false);
    expect(result.attempted).toBe(false);
  });
});
