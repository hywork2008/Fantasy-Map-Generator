import { expect, it } from "vitest";
import i18n from "../../i18n";
import { editorText } from "../../i18n/editorMessages";
import { defaultGenerationSettings } from "../generators/generation/settings";
import { GENERATION_STAGE_DEFINITIONS, generationStageDefinitions } from "../generators/generation/stages";
import { GENERATION_STAGES, generationStages } from "./generationStages";

it("keeps stage selection language-independent and preserves lazy labels versus inner-first snapshots", async () => {
  const originalLanguage = i18n.language;
  try {
    await i18n.changeLanguage("en");
    const settings = defaultGenerationSettings();
    expect(generationStages(settings)).toBe(GENERATION_STAGES);
    const definitionsBefore = JSON.stringify(GENERATION_STAGE_DEFINITIONS);
    const coastLabel = GENERATION_STAGES[0].label;
    const innerSettings = { ...settings, townWallRings: "double" as const, townWallBuildOrder: "inner-first" as const };
    const definitions = generationStageDefinitions(innerSettings);
    const localized = generationStages(innerSettings);
    expect(definitions.slice(3, 5).map(stage => [stage.id, stage.wallCheckpoint])).toEqual([
      ["innerWall", "innerWall"],
      ["innerGates", "firstInnerGates"]
    ]);
    const snapshotLabel = localized[0].label;
    expect(localized[4].label).toBe(editorText("cityEditor.generationStages.firstInnerGates.label"));

    await i18n.changeLanguage("ja");
    expect(GENERATION_STAGES[0].label).not.toBe(coastLabel);
    expect(localized[0].label).toBe(snapshotLabel);
    expect(JSON.stringify(GENERATION_STAGE_DEFINITIONS)).toBe(definitionsBefore);
    expect(generationStageDefinitions(innerSettings)).toEqual(definitions);
    expect(definitions.every(stage => !("label" in stage) && !("hint" in stage))).toBe(true);
  } finally {
    await i18n.changeLanguage(originalLanguage);
  }
});

it("places farmland immediately before concealment for every generation order", () => {
  const settings = defaultGenerationSettings();
  for (const value of [
    settings,
    { ...settings, townWallRings: "double" as const, townWallBuildOrder: "inner-first" as const },
    { ...settings, generationMethod: "skeleton-first" as const }
  ]) {
    const stages = generationStages(value);
    expect(stages.slice(-3).map(stage => stage.id)).toEqual(["buildings", "farmland", "conceal"]);
    expect(stages.map(stage => stage.step)).toEqual(stages.map((_, i) => i + 1));
    expect(stages.at(-2)!.processStep).toBe(10);
    expect(stages.at(-1)!.processStep).toBe(11);
  }
});
