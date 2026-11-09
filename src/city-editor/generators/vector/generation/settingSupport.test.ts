import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generation/settings";
import { defaultPopulationSettings } from "../../populationPlan";
import { vectorInputFromEditor } from "./editorInput";
import { MESHLESS_SETTING_SUPPORT, meshlessSettingGaps } from "./settingSupport";

describe("mesh-editor settings in meshless (feature parity P1)", () => {
  it("states every setting row of the parity table, and no other", () => {
    const table = JSON.parse(readFileSync("docs/plan/data/ce-meshless-parity.json", "utf8")) as {
      rows: { category: string; id: string; meshless: string; stage: string }[];
    };
    expect(MESHLESS_SETTING_SUPPORT).toEqual(
      Object.fromEntries(
        table.rows.filter(r => r.category === "setting").map(r => [r.id, { state: r.meshless, stage: r.stage }])
      )
    );
  });
  it("keeps the requested settings with the city and lists what meshless does not generate", () => {
    const settings = defaultGenerationSettings();
    settings.population = defaultPopulationSettings(3000);
    settings.config.features = { walls: true, citadel: true, plaza: true, temple: true, port: false, shanty: true };
    settings.townWallRings = "double";
    const input = vectorInputFromEditor({
      seed: "p1",
      settings,
      frame: { extentMeters: 1200, cityRadiusMeters: 300, blockSizeMeters: 50 },
      lotOccupancy: 1
    });
    expect(input.context.requestedSettings).toEqual(settings);
    const gaps = meshlessSettingGaps(input.context.requestedSettings!).map(g => g.id);
    expect(gaps).toEqual(
      expect.arrayContaining(["config.features.citadel", "config.features.shanty", "townWallRings"])
    );
    // Equivalent settings and features left off are not listed.
    expect(gaps).not.toContain("population.targetPopulation");
    expect(gaps).not.toContain("config.features.port");
    expect(meshlessSettingGaps(defaultGenerationSettings()).map(g => g.id)).not.toContain("townWallRings");
  });
});
