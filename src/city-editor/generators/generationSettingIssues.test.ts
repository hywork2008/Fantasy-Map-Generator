import { describe, expect, it } from "vitest";
import { createGridDocument } from "./document";
import { generateStageOnDocument } from "./generation/previews";
import { defaultGenerationSettings } from "./generation/settings";
import { generationSettingIssues } from "./generationSettingIssues";
import { defaultPopulationSettings } from "./populationPlan";

const document = () => createGridDocument({ size: "small", grid: "hex", seed: "setting-issues" });
describe("generation setting issues", () => {
  it.each([0, 1, 2])("warns about a standalone port without a coast with %i rivers", count => {
    const settings = defaultGenerationSettings();
    settings.config.features.port = true;
    settings.config.coast = "none";
    settings.config.rivers = Array.from({ length: count }, () => "through" as const);
    expect(generationSettingIssues(document(), settings)).toContainEqual(
      expect.objectContaining({
        code: "port-without-coast",
        severity: "warning",
        fields: ["port", "coast"]
      })
    );
    settings.config.coast = "straight";
    expect(generationSettingIssues(document(), settings).some(issue => issue.code === "port-without-coast")).toBe(
      false
    );
    settings.config.coast = "none";
    settings.config.features.port = false;
    expect(generationSettingIssues(document(), settings).some(issue => issue.code === "port-without-coast")).toBe(
      false
    );
  });
  it("continues stage generation with a port warning", () => {
    const settings = defaultGenerationSettings();
    settings.config.features.port = true;
    settings.config.coast = "none";
    expect(generateStageOnDocument(document(), settings, "port-warning", 1)).not.toBeNull();
  });
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
