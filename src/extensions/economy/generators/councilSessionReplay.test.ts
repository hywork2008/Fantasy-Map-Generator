import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import {
  COUNCIL_SESSION_SNAPSHOT_MAX,
  captureCouncilSessionSnapshot,
  getCouncilSessionSnapshots
} from "./councilSessionReplay";

describe("councilSessionReplay (PR-15)", () => {
  afterEach(() => clearEconomyContext());
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
  });

  it("captures and retains session snapshots", () => {
    const state = {
      i: 1,
      councilSessionNumber: 3,
      councilSupport: 55,
      councilLastDebtVoteYes: 0.62,
      councilLastLineVotes: {
        debtIssue: 0.62,
        warFooting: 0.5,
        extraordinaryTax: 0.4,
        militaryExpansion: 0.55
      },
      councilLastVoteFactionDetail: [
        { faction: "court", share: 0.3, lean: 0.6, contribution: 0.18 },
        { faction: "merchants", share: 0.3, lean: 0.5, contribution: 0.15 },
        { faction: "military", share: 0.2, lean: 0.55, contribution: 0.11 },
        { faction: "clergy", share: 0.2, lean: 0.4, contribution: 0.08 }
      ]
    } as unknown as State;

    const snap = captureCouncilSessionSnapshot(state, { councilFailed: false, notes: "test" });
    expect(snap?.sessionNumber).toBe(3);
    expect(snap?.factions).toHaveLength(4);
    expect(getCouncilSessionSnapshots(state)).toHaveLength(1);
  });

  it("trims snapshots to the max", () => {
    const state = {
      i: 1,
      councilSupport: 50,
      councilLastVoteFactionDetail: []
    } as unknown as State;

    for (let i = 1; i <= COUNCIL_SESSION_SNAPSHOT_MAX + 3; i++) {
      state.councilSessionNumber = i;
      captureCouncilSessionSnapshot(state);
    }
    expect(getCouncilSessionSnapshots(state).length).toBe(COUNCIL_SESSION_SNAPSHOT_MAX);
    expect(getCouncilSessionSnapshots(state)[0]?.sessionNumber).toBe(4);
  });
});
