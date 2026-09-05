import { beforeEach, describe, expect, it } from "vitest";
import { FAST_ADVANCE_PRESETS } from "../generators/fastAdvance/fastAdvancePresets";
import { isFastAdvanceActive, resolveFastAdvanceRates, useFastAdvanceState } from "./fastAdvanceState";

describe("fastAdvanceState", () => {
  beforeEach(() => {
    useFastAdvanceState.setState({
      enabled: false,
      preset: "steady",
      customRates: { ...FAST_ADVANCE_PRESETS.steady }
    });
  });

  it("defaults to disabled with the steady preset", () => {
    const state = useFastAdvanceState.getState();
    expect(state.enabled).toBe(false);
    expect(state.preset).toBe("steady");
    expect(resolveFastAdvanceRates()).toEqual(FAST_ADVANCE_PRESETS.steady);
  });

  it("resolves a named preset's rates", () => {
    useFastAdvanceState.getState().setPreset("boom");
    expect(resolveFastAdvanceRates()).toEqual(FAST_ADVANCE_PRESETS.boom);
  });

  it("resolves customRates only when preset is custom", () => {
    useFastAdvanceState.getState().setPreset("custom");
    useFastAdvanceState.getState().setCustomRate("populationGrowthPctPerYear", 42);
    const rates = resolveFastAdvanceRates();
    expect(rates.populationGrowthPctPerYear).toBe(42);
    // Untouched fields keep whatever customRates started with (seeded from "steady").
    expect(rates.priceInflationPctPerYear).toBe(FAST_ADVANCE_PRESETS.steady.priceInflationPctPerYear);
  });

  it("resetCustomRates restores the custom vector to the steady defaults", () => {
    useFastAdvanceState.getState().setPreset("custom");
    useFastAdvanceState.getState().setCustomRate("populationGrowthPctPerYear", 42);
    useFastAdvanceState.getState().setCustomRate("variancePct", 50);

    useFastAdvanceState.getState().resetCustomRates();

    expect(useFastAdvanceState.getState().customRates).toEqual(FAST_ADVANCE_PRESETS.steady);
    // preset is untouched — Reset only rewinds the editable vector.
    expect(useFastAdvanceState.getState().preset).toBe("custom");
  });

  it("is active only when enabled AND the batch is a multi-day (isBulkAdvance) advance", () => {
    expect(isFastAdvanceActive(true)).toBe(false); // disabled
    expect(isFastAdvanceActive(false)).toBe(false); // disabled

    useFastAdvanceState.getState().setEnabled(true);
    expect(isFastAdvanceActive(true)).toBe(true);
    // Enabling Fast-Forward never changes a lone Advance Day step's behavior.
    expect(isFastAdvanceActive(false)).toBe(false);
  });
});
