import { describe, expect, it } from "vitest";
import { parseIncomingPayload } from "../io/incomingCity";
import { measureCityPerformance } from "./cityGenerationPerformance";
import { DEFAULT_SITE_CONFIG } from "./gen/site/siteConfig";
import { synthSite } from "./gen/site/synthSite";

function input() {
  const descriptor = synthSite(
    "smallTown",
    {
      ...structuredClone(DEFAULT_SITE_CONFIG),
      coast: "none",
      rivers: [],
      relief: false,
      features: { walls: false, citadel: false, plaza: false, temple: false, port: false, shanty: false }
    },
    "ce-perf-test",
    { extentMeters: 300, cityRadiusMeters: 72 }
  );
  descriptor.burg.id = 17;
  const share = parseIncomingPayload(JSON.stringify(descriptor))!;
  return { schema_version: "1", burg_id: "17", name: "test city", share_json: JSON.stringify(share) };
}
describe("city performance measurement", () => {
  it("times the actual incoming grid, full generator and optional SVG construction", async () => {
    const samples: string[] = [];
    const result = await measureCityPerformance(input(), true, sample => samples.push(sample.phase));
    expect(result.status).toBe("generated");
    expect(result.generated).toBe(true);
    for (const phase of ["incomingParseMs", "gridMs", "settingsMs", "generationMs", "svgBuildMs"])
      expect(result.timings[phase]).toBeGreaterThanOrEqual(0);
    expect(result.totalMs).toBeGreaterThanOrEqual(result.timings.generationMs);
    expect(result.phases.some(sample => sample.phase.startsWith("render."))).toBe(true);
    expect(samples.length).toBeGreaterThan(0);
    expect(result.svgNodes).toBeGreaterThan(0);
  });
  it("refuses mismatched IDs before grid generation and preserves export failures", async () => {
    const result = await measureCityPerformance({ ...input(), burg_id: "18" });
    expect(result).toMatchObject({ status: "error", generated: false });
    expect(result.timings.gridMs).toBeUndefined();
    expect(result.error).toContain("mismatched burg_id");
    const exported = await measureCityPerformance({ ...input(), export_error: "failed export" });
    expect(exported.error).toContain("Descriptor export: failed export");
  });
});
