import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, State } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { appendCouncilLog, COUNCIL_LOG_MAX, recordCouncilSession } from "./councilSession";

describe("councilSession (PR-13)", () => {
  afterEach(() => clearEconomyContext());
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
  });

  it("appends log entries and trims to max", () => {
    const state = { i: 1 } as unknown as State;
    for (let i = 0; i < COUNCIL_LOG_MAX + 5; i++) {
      appendCouncilLog(state, "note", `line ${i}`);
    }
    expect(state.councilSessionLog?.length).toBe(COUNCIL_LOG_MAX);
    expect(state.councilSessionLog?.[0]?.summary).toBe("line 5");
  });

  it("records a full session from fiscal outcomes", () => {
    const state = { i: 1, councilSupport: 55 } as unknown as State;
    recordCouncilSession(state, {
      councilFailed: true,
      councilSupport: 55,
      debtVoteYes: 0.62,
      debtIssued: 10,
      taxFarmLeak: 2
    });
    expect(state.councilSessionNumber).toBe(1);
    expect(state.councilSessionLog?.some(e => e.kind === "session")).toBe(true);
    expect(state.councilSessionLog?.some(e => e.kind === "veto")).toBe(true);
    expect(state.councilSessionLog?.some(e => e.kind === "vote")).toBe(true);
    expect(state.councilSessionLog?.some(e => e.kind === "debt_issue")).toBe(true);
  });
});
