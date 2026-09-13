import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FAST_ADVANCE_PRESETS } from "../../../generators/fastAdvance/fastAdvancePresets";
import {
  beginFastAdvanceRun,
  isFastAdvanceRunActive,
  resetFastAdvanceRunForTests
} from "../../../generators/fastAdvance/fastAdvanceRun";
import { worldContext } from "../../hostCore";
import type { ExtensionAPI, PackedGraph } from "../../hostTypes";
import { clearEconomyContext, initEconomyContext } from "../economyContext";
import { debitTreasury } from "./chemMedCommon";

describe("debitTreasury under Fast-Forward", () => {
  beforeEach(() => {
    resetFastAdvanceRunForTests();
    initEconomyContext({ worldContext } as unknown as ExtensionAPI);
    worldContext.pack = {
      states: [{ i: 0 }, { i: 1, name: "Volta", removed: false, treasury: 500 }]
    } as unknown as PackedGraph;
  });

  afterEach(() => {
    resetFastAdvanceRunForTests();
    clearEconomyContext();
  });

  it("defaults to inactive outside a Fast-Forward run", () => {
    expect(isFastAdvanceRunActive()).toBe(false);
  });

  it("debitTreasury spends normally when no Fast-Forward run is active", () => {
    const spent = debitTreasury(1, 30);
    expect(spent).toBe(true);
    expect(worldContext.pack.states?.[1]?.treasury).toBe(470);
  });

  it("debitTreasury reports success WITHOUT touching treasury while a Fast-Forward run is active", () => {
    beginFastAdvanceRun(FAST_ADVANCE_PRESETS.steady);
    const spent = debitTreasury(1, 30);
    // Returns true so callers keep the facility founded/active — but the preset-driven treasury
    // trajectory (applyFastForwardEconomySettlement) is left untouched (§9.4 / Phase 3).
    expect(spent).toBe(true);
    expect(worldContext.pack.states?.[1]?.treasury).toBe(500);
  });

  it("debitTreasury still rejects a nonexistent/removed state or non-positive amount under Fast-Forward", () => {
    beginFastAdvanceRun(FAST_ADVANCE_PRESETS.steady);
    expect(debitTreasury(1, 0)).toBe(false);
    expect(debitTreasury(99, 10)).toBe(false);
    expect(worldContext.pack.states?.[1]?.treasury).toBe(500);
  });
});
