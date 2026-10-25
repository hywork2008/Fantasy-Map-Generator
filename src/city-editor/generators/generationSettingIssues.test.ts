import { describe, expect, it } from "vitest";
import { createGridDocument } from "./document";
import { defaultGenerationSettings } from "./generation/settings";
import { generationSettingIssues } from "./generationSettingIssues";
import { defaultPopulationSettings } from "./populationPlan";

const document = () => createGridDocument({ size: "small", grid: "hex", seed: "setting-issues" });
describe("generation setting issues", () => {
  it("identifies the fields for a manual frame shortfall without changing the input", () => {
    const input = document();
    const settings = defaultGenerationSettings();
    settings.population = { ...defaultPopulationSettings(220000), frameMode: "manual" };
    const before = JSON.stringify([input, settings]);
    const issues = generationSettingIssues(input, settings);
    expect(issues).toEqual([
      expect.objectContaining({
        code: "population-settings",
        fields: ["populationEnabled", "population", "frameMode", "frame"]
      })
    ]);
    expect(JSON.stringify([input, settings])).toBe(before);
  });
  it("keeps a generation-method conflict separate from an invalid population", () => {
    const settings = defaultGenerationSettings();
    settings.population = defaultPopulationSettings();
    settings.generationMethod = "skeleton-first";
    const issues = generationSettingIssues(document(), settings);
    expect(issues.find(issue => issue.code === "population-settings")?.fields).toEqual([
      "populationEnabled",
      "generationMethod"
    ]);
  });
});
