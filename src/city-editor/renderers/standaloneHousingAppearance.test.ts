import { expect, it } from "vitest";
import { buildBlockFabric } from "../generators/blockInfill";
import { buildingAppearancePreview } from "../generators/buildingAppearancePreview";
import { createDocument } from "../generators/document";
import { standaloneHousingAppearance } from "./standaloneHousingAppearance";

it("chooses a stable non-legacy style only for standalone high-quality automatic housing", () => {
  const document = createDocument("standalone-housing", 400);
  const fabric = { ...buildBlockFabric(document), buildings: buildingAppearancePreview("legacy") };
  const original = JSON.stringify({ document, fabric });
  const result = standaloneHousingAppearance(document, fabric, "high", false);
  expect(result.buildings.every(lot => lot.appearance && lot.appearance.profileId !== "legacy")).toBe(true);
  expect(new Set(result.buildings.map(lot => lot.appearance?.profileId)).size).toBe(1);
  expect(standaloneHousingAppearance(document, fabric, "high", false)).toBe(result);
  expect(standaloneHousingAppearance(structuredClone(document), fabric, "high", false).buildings).toEqual(
    result.buildings
  );
  expect(result.farms).toBe(fabric.farms);
  expect(result.lanes).toBe(fabric.lanes);
  expect(JSON.stringify({ document, fabric })).toBe(original);
  expect(standaloneHousingAppearance(document, fabric, "standard", false)).toBe(fabric);
  expect(standaloneHousingAppearance(document, fabric, "low", false)).toBe(fabric);
  expect(standaloneHousingAppearance(document, fabric, "high", true)).toBe(fabric);
  for (const profile of ["legacy", "atlantic"] as const) {
    expect(
      standaloneHousingAppearance({ ...document, buildingAppearanceProfile: profile }, fabric, "high", false)
    ).toBe(fabric);
  }
});

it("keeps the climate context independent from the randomly selected culture", () => {
  const document = createDocument("standalone-climate", 400);
  document.buildingAppearanceClimate = "wet-forest";
  document.biome = { id: 1, key: "desert", name: "Desert", color: "tan" };
  const fabric = { ...buildBlockFabric(document), buildings: buildingAppearancePreview("legacy") };
  const before = structuredClone(document);
  const result = standaloneHousingAppearance(document, fabric, "high", false);
  const manual = standaloneHousingAppearance({ ...document, buildingAppearanceClimate: "arid" }, fabric, "high", false);
  expect(result.buildings.map(lot => lot.appearance?.profileId)).toEqual(
    manual.buildings.map(lot => lot.appearance?.profileId)
  );
  expect(document).toEqual(before);
});
