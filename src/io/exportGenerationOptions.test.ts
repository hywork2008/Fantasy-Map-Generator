import { afterEach, describe, expect, it } from "vitest";
import { GENERATION_OPTION_KEYS, useOptionsState } from "../store/optionsState";
import { VERSION } from "../versioning";
import { buildGenerationOptionsExport, GENERATION_OPTIONS_KIND } from "./exportGenerationOptions";

const originalOptions = useOptionsState.getState();

afterEach(() => {
  useOptionsState.setState(originalOptions, true);
});

describe("buildGenerationOptionsExport", () => {
  it("exports the Zustand generation options without UI or render preferences", () => {
    useOptionsState.getState().setOptions({
      seed: "424242",
      template: "archipelago",
      cultures: 18,
      culturesSet: "highFantasy",
      initialSettlementPattern: "frontier",
      themeColor: "rgb(1, 2, 3)",
      hideLabels: true
    });

    const exportedAt = new Date("2026-08-16T12:00:00.000Z");
    const payload = buildGenerationOptionsExport(exportedAt);

    expect(payload).toMatchObject({
      kind: GENERATION_OPTIONS_KIND,
      version: VERSION,
      exportedAt: "2026-08-16T12:00:00.000Z"
    });
    expect(payload.options.seed).toBe("424242");
    expect(payload.options.template).toBe("archipelago");
    expect(payload.options.cultures).toBe(18);
    expect(payload.options.culturesSet).toBe("highFantasy");
    expect(payload.options.initialSettlementPattern).toBe("frontier");
    expect(payload.options.racePersonNameSpheres).toEqual(originalOptions.racePersonNameSpheres);
    expect(Object.keys(payload.options).sort()).toEqual([...GENERATION_OPTION_KEYS].sort());
    expect(payload.options).not.toHaveProperty("themeColor");
    expect(payload.options).not.toHaveProperty("hideLabels");
    expect(payload.options).not.toHaveProperty("setOption");
  });
});
