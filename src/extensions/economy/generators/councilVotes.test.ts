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

  it("exposes per-faction vote detail (PR-14)", () => {
    const state = { i: 1, form: "Republic", councilSupport: 50, diplomacy: [] } as unknown as State;
    const vote = simulateCouncilVote(state, "debtIssue");
    expect(vote.factionDetails.length).toBe(4);
    expect(vote.factionDetails.map(d => d.faction).sort()).toEqual(["clergy", "court", "merchants", "military"].sort());
    expect(vote.factionDetails.every(d => d.share > 0 && d.lean >= 0 && d.lean <= 1)).toBe(true);
  });

  describe("department-budget-cut lines (PR-17f)", () => {
    it("clergy resists cutting Ecclesiastica far harder than any other faction resists its own cut line", () => {
      const state = { i: 1, form: "Monarchy", councilSupport: 50, diplomacy: [] } as unknown as State;
      const vote = simulateCouncilVote(state, "cutEcclesiastica");
      const clergyLean = vote.factionDetails.find(d => d.faction === "clergy")?.lean;
      expect(clergyLean).toBe(0.05);
    });

    it("gives cutting Ecclesiastica a lower yes-share for a Theocracy than for a Monarchy (legitimacy stakes)", () => {
      const theocracy = { i: 1, form: "Theocracy", councilSupport: 50, diplomacy: [] } as unknown as State;
      const monarchy = { i: 1, form: "Monarchy", councilSupport: 50, diplomacy: [] } as unknown as State;
      const theocracyYes = simulateCouncilVote(theocracy, "cutEcclesiastica").yesShare;
      const monarchyYes = simulateCouncilVote(monarchy, "cutEcclesiastica").yesShare;
      expect(theocracyYes).toBeLessThan(monarchyYes);
    });

    it("makes cutting Spymastery the most politically palatable department cut", () => {
      const state = { i: 1, form: "Monarchy", councilSupport: 50, diplomacy: [] } as unknown as State;
      const spymasteryYes = simulateCouncilVote(state, "cutSpymastery").yesShare;
      const stewardshipYes = simulateCouncilVote(state, "cutStewardship").yesShare;
      const chanceryYes = simulateCouncilVote(state, "cutChancery").yesShare;
      expect(spymasteryYes).toBeGreaterThan(stewardshipYes);
      expect(spymasteryYes).toBeGreaterThan(chanceryYes);
    });
  });
});
