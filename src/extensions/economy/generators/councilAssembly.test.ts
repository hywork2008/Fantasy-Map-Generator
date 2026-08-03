import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import type { Character } from "../../characters/characterTypes";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearNobilityContext, initNobilityContext, setRulerId } from "../../nobility/nobilityContext";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import {
  COUNCIL_BASE_SUPPORT_BY_FORM,
  COUNCIL_DEBT_ISSUE_SUPPORT_FLOOR,
  canCouncilApproveDebtIssue,
  getCouncilSupport,
  scaleFailureChanceBySupport
} from "./councilAssembly";

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
    wealth: 0,
    pastTitles: [],
    ...overrides
  };
}

describe("councilAssembly (PR-8)", () => {
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

  it("uses form base support when no officers are present", () => {
    const state = { i: 1, form: "Republic" } as unknown as State;
    worldContext.pack = { characters: [], states: [undefined, state] } as unknown as PackedGraph;
    const result = getCouncilSupport(state);
    expect(result.support).toBe(COUNCIL_BASE_SUPPORT_BY_FORM.Republic);
    expect(result.officerCount).toBe(0);
  });

  it("raises support when officers have high honor/rationality", () => {
    const chancellor = makePerson({
      i: 2,
      personality: {
        ...makePerson().personality,
        honor: 90,
        rationality: 90
      } as Character["personality"],
      titles: [{ title: "Chancellor", landed: false, entityType: "state", entityId: 1 }]
    });
    const state = { i: 1, form: "Republic" } as unknown as State;
    worldContext.pack = { characters: [chancellor], states: [undefined, state] } as unknown as PackedGraph;

    const result = getCouncilSupport(state);
    expect(result.support).toBeGreaterThan(COUNCIL_BASE_SUPPORT_BY_FORM.Republic!);
    expect(result.officerCount).toBeGreaterThan(0);
  });

  it("scales failure chance down when support is high", () => {
    expect(scaleFailureChanceBySupport(20, 80)).toBeLessThan(20);
    expect(scaleFailureChanceBySupport(20, 20)).toBeGreaterThan(20);
  });

  it("gates debt issue on support floor", () => {
    const low = { i: 1, form: "Republic", councilSupport: 10 } as unknown as State;
    // getCouncilSupport recomputes from form+officers; empty officers → Republic base 48 >= 45
    worldContext.pack = { characters: [], states: [undefined, low] } as unknown as PackedGraph;
    expect(canCouncilApproveDebtIssue(low)).toBe(
      COUNCIL_BASE_SUPPORT_BY_FORM.Republic! >= COUNCIL_DEBT_ISSUE_SUPPORT_FLOOR
    );

    const anarchy = { i: 2, form: "Anarchy" } as unknown as State;
    expect(getCouncilSupport(anarchy).support).toBeLessThan(COUNCIL_DEBT_ISSUE_SUPPORT_FLOOR);
    expect(canCouncilApproveDebtIssue(anarchy)).toBe(false);
  });

  it("includes the living ruler at half weight", () => {
    const ruler = makePerson({
      i: 1,
      personality: {
        ...makePerson().personality,
        honor: 100,
        rationality: 100
      } as Character["personality"]
    });
    const state = { i: 1, form: "Monarchy" } as unknown as State;
    worldContext.pack = { characters: [ruler], states: [undefined, state] } as unknown as PackedGraph;
    setRulerId(state, 1);

    const result = getCouncilSupport(state);
    expect(result.support).toBeGreaterThan(COUNCIL_BASE_SUPPORT_BY_FORM.Monarchy!);
  });
});
