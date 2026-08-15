import { afterEach, describe, expect, it } from "vitest";
import { generationProgressStore } from "../store/generationProgressState";
import { GENERATION_OPTION_KEYS, useOptionsState } from "../store/optionsState";
import { VERSION } from "../versioning";
import {
  applyGenerationOptions,
  buildGenerationOptionsExport,
  GENERATION_OPTIONS_KIND,
  importGenerationOptionsFromText,
  parseGenerationOptionsExport
} from "./exportGenerationOptions";

const originalOptions = useOptionsState.getState();
const importedLockKeys = [
  "seed",
  "template",
  "cultures",
  "culturesSet",
  "initialSettlementPattern",
  "oikoumeneLandShare",
  "racePersonNameSpheres"
] as const;

afterEach(() => {
  useOptionsState.setState(originalOptions, true);
  generationProgressStore.setState({ isGenerating: false });
  for (const key of importedLockKeys) localStorage.removeItem(key);
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

describe("importGenerationOptionsFromText", () => {
  it("rejects JSON that is not a generation-options export", () => {
    expect(parseGenerationOptionsExport("{")).toEqual({ ok: false, error: "invalidJson" });
    expect(parseGenerationOptionsExport(JSON.stringify({ info: {}, settings: {} }))).toEqual({
      ok: false,
      error: "invalidFormat"
    });
  });

  it("applies sanitized options to Zustand and locks them for the next generation", () => {
    const result = importGenerationOptionsFromText(
      JSON.stringify({
        kind: GENERATION_OPTIONS_KIND,
        version: VERSION,
        exportedAt: "2026-08-16T12:00:00.000Z",
        options: {
          seed: "987654",
          template: "atoll",
          cultures: 21,
          culturesSet: "darkFantasy",
          initialSettlementPattern: "frontier",
          oikoumeneLandShare: 45,
          historicalPeriod: "not-a-period",
          themeColor: "rgb(1, 2, 3)",
          hideLabels: true
        }
      })
    );

    expect(result.ok).toBe(true);
    const options = useOptionsState.getState();
    expect(options.seed).toBe("987654");
    expect(options.template).toBe("atoll");
    expect(options.cultures).toBe(21);
    expect(options.culturesSet).toBe("darkFantasy");
    expect(options.initialSettlementPattern).toBe("frontier");
    expect(options.oikoumeneLandShare).toBe(0.45);
    expect(options.historicalPeriod).toBe(originalOptions.historicalPeriod);
    expect(options.themeColor).toBe(originalOptions.themeColor);
    expect(options.hideLabels).toBe(originalOptions.hideLabels);
    expect(localStorage.getItem("seed")).toBe("987654");
    expect(localStorage.getItem("template")).toBe("atoll");
    expect(localStorage.getItem("oikoumeneLandShare")).toBe("0.45");
    expect(localStorage.getItem("themeColor")).toBeNull();
  });

  it("does not apply options while a map is generating", () => {
    generationProgressStore.setState({ isGenerating: true });
    const before = useOptionsState.getState().seed;

    expect(
      importGenerationOptionsFromText(
        JSON.stringify({
          kind: GENERATION_OPTIONS_KIND,
          options: { seed: "should-not-apply" }
        })
      )
    ).toEqual({ ok: false, error: "busy" });
    expect(useOptionsState.getState().seed).toBe(before);
  });
});

describe("applyGenerationOptions", () => {
  it("leaves unspecified generation keys unchanged", () => {
    useOptionsState.getState().setOptions({ cultures: 9, template: "continent" });
    applyGenerationOptions({ seed: "111" });
    expect(useOptionsState.getState().cultures).toBe(9);
    expect(useOptionsState.getState().template).toBe("continent");
    expect(useOptionsState.getState().seed).toBe("111");
  });
});
