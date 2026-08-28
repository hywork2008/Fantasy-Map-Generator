import { describe, expect, it } from "vitest";
import { generateCity } from "../core/pipeline";
import { DEFAULT_WALL_PLAN } from "../core/types";
import { buildCityExport } from "./cityExport";
import { parseCityExport } from "./cityImport";
import { DEFAULT_SITE_CONFIG } from "./siteConfig";
import { resolveWallPlan, siteToGeography, siteToParams, siteToProgram } from "./siteInput";
import { synthSite } from "./synthSite";

function exportedJson(): string {
  const config = { ...DEFAULT_SITE_CONFIG, coast: "bay" as const, rivers: ["through" as const] };
  const descriptor = synthSite("smallCity", config, "import-round-trip");
  const geography = siteToGeography(descriptor);
  const base = siteToProgram(descriptor);
  const program = { ...base, wallPlan: resolveWallPlan(base.wallPlan ?? DEFAULT_WALL_PLAN, config.wall) };
  const params = siteToParams(descriptor);
  return JSON.stringify(
    buildCityExport({
      mode: { kind: "standalone", preset: "smallCity", config },
      seed: params.seed,
      descriptor,
      params,
      geography,
      program,
      result: generateCity(params, geography, program),
      now: new Date("2026-08-28T12:00:00.000Z")
    })
  );
}

describe("parseCityExport", () => {
  it("restores the exact resolved pipeline inputs", () => {
    const original = JSON.parse(exportedJson());
    const imported = parseCityExport(JSON.stringify(original));

    expect(imported).not.toBeNull();
    const rerun = generateCity(
      imported!.settings.resolved.params,
      imported!.settings.resolved.geography,
      imported!.settings.resolved.program
    );
    expect(JSON.stringify(rerun)).toBe(
      JSON.stringify(
        generateCity(
          original.settings.resolved.params,
          original.settings.resolved.geography,
          original.settings.resolved.program
        )
      )
    );
  });

  it("rejects malformed, incompatible, and unsafe pipeline data", () => {
    expect(parseCityExport("not json")).toBeNull();

    const wrongVersion = JSON.parse(exportedJson());
    wrongVersion.exportVersion = 99;
    expect(parseCityExport(JSON.stringify(wrongVersion))).toBeNull();

    const unsafeExtent = JSON.parse(exportedJson());
    unsafeExtent.settings.resolved.params.extentMeters = -1;
    expect(parseCityExport(JSON.stringify(unsafeExtent))).toBeNull();
  });
});
