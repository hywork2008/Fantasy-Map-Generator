import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { debitTreasury } from "./chemMedCommon";
import { isFastForwardTickActive, setFastForwardTickActive } from "./fastAdvanceEconomyGuard";

describe("fastAdvanceEconomyGuard", () => {
  beforeEach(() => {
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Volta", removed: false, treasury: 500 }]
    } as unknown as PackedGraph;
    setFastForwardTickActive(false);
  });

  afterEach(() => {
    setFastForwardTickActive(false);
    clearEconomyContext();
  });

  it("defaults to inactive and round-trips the flag", () => {
    expect(isFastForwardTickActive()).toBe(false);
    setFastForwardTickActive(true);
    expect(isFastForwardTickActive()).toBe(true);
    setFastForwardTickActive(false);
    expect(isFastForwardTickActive()).toBe(false);
  });

  it("debitTreasury spends normally when the flag is off", () => {
    const spent = debitTreasury(1, 30);
    expect(spent).toBe(true);
    expect(worldContext.pack.states?.[1]?.treasury).toBe(470);
  });

  it("debitTreasury reports success WITHOUT touching treasury while a Fast-Forward tick is active", () => {
    setFastForwardTickActive(true);
    const spent = debitTreasury(1, 30);
    // Returns true so callers keep the facility founded/active — but the preset-driven treasury
    // trajectory (applyFastForwardEconomySettlement) is left untouched (§9.4 / Phase 3).
    expect(spent).toBe(true);
    expect(worldContext.pack.states?.[1]?.treasury).toBe(500);
  });

  it("debitTreasury still rejects a nonexistent/removed state or non-positive amount under Fast-Forward", () => {
    setFastForwardTickActive(true);
    expect(debitTreasury(1, 0)).toBe(false);
    expect(debitTreasury(99, 10)).toBe(false);
    expect(worldContext.pack.states?.[1]?.treasury).toBe(500);
  });
});
