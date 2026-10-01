import { expect, it } from "vitest";
import { createGridDocument } from "./document";
import { defaultGenerationSettings, generateStageOnDocument } from "./generate";

it("does not fold a generated river back through v105 and v106", () => {
  const input = createGridDocument({
    size: "small",
    grid: "evolution",
    seed: "962ux8",
    patchParams: { nPatches: 15, relaxCount: 4, relaxPasses: 3 }
  });
  const settings = defaultGenerationSettings();
  settings.config = {
    ...settings.config,
    coast: "none",
    rivers: ["beside", "greatBend"],
    relief: true,
    features: { walls: false, citadel: true, plaza: true, temple: true, port: false, shanty: false },
    wall: { envelope: "auto", coast: "auto", line: "auto" },
    layout: "auto"
  };
  settings.layout = "organic";
  settings.walledAreaShare = 1;
  settings.historicalPeriod = "ageOfExploration";

  const city = generateStageOnDocument(input, settings, "11ak2my", 2)!;
  const river = city.featureGroups.find(group => group.id === "gc:river-1");
  expect(river?.kind).toBe("river");
  if (river?.kind !== "river") return;
  expect(new Set(river.vertices).size).toBe(river.vertices.length);
  expect(river.vertices).toContain("v105");
  expect(river.vertices).not.toContain("v106");
});
