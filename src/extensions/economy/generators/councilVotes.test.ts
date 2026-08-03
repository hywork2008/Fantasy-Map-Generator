import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCharactersContext, initCharactersContext } from "../../characters/charactersContext";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { FACTION_BASE_BY_FORM, getCouncilFactionShares, simulateCouncilVote } from "./councilVotes";

describe("councilVotes (PR-12)", () => {
  afterEach(() => {
    clearEconomyContext();
    clearCharactersContext();
  });

  beforeEach(() => {
    const api = { worldContext } as unknown as ExtensionAPI;
    initEconomyContext(api);
    initCharactersContext(api);
    worldContext.pack = { characters: [], states: [], burgs: [] } as unknown as PackedGraph;
  });

  it("uses form baseline faction shares when no officers exist", () => {
    const state = { i: 1, form: "Republic" } as unknown as State;
    const shares = getCouncilFactionShares(state);
    expect(shares.merchants).toBeGreaterThanOrEqual(FACTION_BASE_BY_FORM.Republic!.merchants - 0.01);
    const sum = shares.court + shares.merchants + shares.military + shares.clergy;
    expect(sum).toBeCloseTo(1, 2);
  });

  it("passes debt-issue vote for a healthy Monarchy", () => {
    const state = {
      i: 1,
      form: "Monarchy",
      councilSupport: 62,
      diplomacy: []
    } as unknown as State;
    const vote = simulateCouncilVote(state, "debtIssue");
    expect(vote.passed).toBe(true);
    expect(vote.yesShare).toBeGreaterThanOrEqual(0.5);
  });

  it("blocks debt-issue vote harder while in default", () => {
    const healthy = {
      i: 1,
      form: "Republic",
      councilSupport: 50,
      diplomacy: []
    } as unknown as State;
    const defaulted = { ...healthy, debtInDefault: true } as unknown as State;
    const yesHealthy = simulateCouncilVote(healthy, "debtIssue").yesShare;
    const yesDefault = simulateCouncilVote(defaulted, "debtIssue").yesShare;
    expect(yesDefault).toBeLessThan(yesHealthy);
  });

  it("gives military a strong yes lean on war footing", () => {
    const state = { i: 1, form: "Monarchy", councilSupport: 50, diplomacy: [] } as unknown as State;
    const vote = simulateCouncilVote(state, "warFooting");
    expect(vote.yesShare).toBeGreaterThan(0.3);
  });
});
