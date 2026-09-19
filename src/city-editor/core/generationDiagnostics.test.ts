import { describe, expect, it, vi } from "vitest";
import { createGridDocument, createSizedDocument } from "./document";
import { defaultGenerationSettings, generateCityOnDocument } from "./generate";
import {
  formatGenerationFailureLog,
  type GenerationSample,
  generationPhaseLabel,
  logGenerationFailures
} from "./generationDiagnostics";

describe("generation failure diagnostics", () => {
  it("labels stages in Japanese", () => {
    expect(generationPhaseLabel("urban")).toBe("市街地");
    expect(generationPhaseLabel("apply-validation")).toBe("メッシュ検証");
    expect(generationPhaseLabel("crossing-validation")).toBe("交差の検証");
    expect(generationPhaseLabel("street-plan")).toBe("街道・橋");
  });

  it("formats which stage, why, and how each attempt failed", () => {
    const samples: GenerationSample[] = [
      {
        phase: "urban",
        elapsedMs: 0,
        attempt: 1,
        counts: { urbanArea: 100, minimumUrbanArea: 200 },
        failure: {
          reason: "urban-area-too-small",
          message: "市街地面積 100 m² が最低 200 m²（目標πR²の45%）に届かない",
          details: ["城壁内シェア 20%"]
        }
      }
    ];
    const log = formatGenerationFailureLog(samples, { grid: "hex", extentMeters: 2400 });
    expect(log).toContain("都市の生成に失敗しました");
    expect(log).toContain("grid=hex");
    expect(log).toContain("案1 · 市街地（urban）· urban-area-too-small");
    expect(log).toContain("urbanArea=100");
    expect(log).toContain("城壁内シェア 20%");
  });

  it("reports too-few-faces with stage, reason, and counts", () => {
    const document = createSizedDocument("small", "diag-faces");
    for (const id of Object.keys(document.mesh.faces).slice(2)) delete document.mesh.faces[id];
    const samples: GenerationSample[] = [];
    const city = generateCityOnDocument(document, defaultGenerationSettings(), "diag-faces", sample =>
      samples.push(sample)
    );
    expect(city).toBeNull();
    const failures = samples.filter(sample => sample.failure?.reason === "too-few-faces");
    expect(failures.length).toBeGreaterThan(0);
    expect(failures[0].phase).toBe("prepare");
    expect(failures[0].failure?.message).toContain("格子の面が3未満");
    expect(failures[0].counts?.faces).toBe(2);
    expect(samples.some(sample => sample.failure?.reason === "all-attempts-rejected")).toBe(true);
  });

  it("keeps Large wall share at 20% and does not treat it as the 45% settlement floor", () => {
    const document = createGridDocument({ size: "large", grid: "evolution", seed: "diag-share" });
    const settings = defaultGenerationSettings();
    settings.urbanNPatches = 1;
    const samples: GenerationSample[] = [];
    const city = generateCityOnDocument(document, settings, "diag-share", sample => samples.push(sample));
    expect(city).toBeNull();
    const failure = samples.find(sample => sample.failure?.reason === "urban-area-too-small");
    expect(failure).toBeTruthy();
    expect(failure!.counts?.walledSharePercent).toBe(20);
    expect(failure!.counts?.settlementFloorPercent).toBe(45);
    expect(failure!.failure?.message).toContain("市街地面積");
    expect(failure!.failure?.message).toContain("目標πR²の45%");
    expect(failure!.failure?.message).not.toContain("城壁内の市街地面積");
    expect(failure!.failure?.details?.some(line => line.includes("城壁内シェア 20%"))).toBe(true);
  });

  it("logs a grouped console error with expandable per-attempt objects", () => {
    const group = vi.spyOn(console, "group").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const groupEnd = vi.spyOn(console, "groupEnd").mockImplementation(() => {});
    logGenerationFailures(
      [
        {
          phase: "crossing-validation",
          elapsedMs: 0,
          attempt: 2,
          failure: { reason: "invalid-crossings", message: "門・橋の交差が不正（1件）", details: ["門 gc:gate-0"] }
        }
      ],
      { seed: "x" }
    );
    expect(group).toHaveBeenCalledOnce();
    expect(error.mock.calls.some(call => String(call[0]).includes("交差の検証"))).toBe(true);
    expect(
      error.mock.calls.some(call => call[1] && (call[1] as { reason: string }).reason === "invalid-crossings")
    ).toBe(true);
    expect(groupEnd).toHaveBeenCalledOnce();
    group.mockRestore();
    error.mockRestore();
    groupEnd.mockRestore();
  });
});
