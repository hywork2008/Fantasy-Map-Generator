import { expect, it } from "vitest";
import { regionalHouseSite } from "../../city3d/three/regionalHouseMeshes";
import amerford from "../data/fixtures/amerford-20261027.json";
import { buildBlockFabric } from "../generators/blockInfill";
import { buildingAppearancePreview } from "../generators/buildingAppearancePreview";
import { createDocument } from "../generators/document";
import { generateCityOnDocument } from "../generators/generation/generateCity";
import { parseIncomingPayload } from "../services/io/incomingCity";
import { cityEditorDocument, cityEditorSettings } from "../services/io/shareRequest";
import { standaloneHousingAppearance } from "./standaloneHousingAppearance";

it("chooses a stable non-legacy style for standalone high-quality automatic housing", () => {
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

it("uses a detailed family for linked high-quality housing without a supported tradition", () => {
  const document = createDocument("linked-housing", 400);
  const fabric = { ...buildBlockFabric(document), buildings: buildingAppearancePreview("legacy") };
  for (const tradition of [undefined, "sylvanElven"]) {
    const linked = {
      ...document,
      buildingAppearanceContext: {
        period: "ageOfExploration",
        tradition,
        temperatureC: 1,
        forest: true,
        arid: false,
        wetland: false
      }
    };
    const before = JSON.stringify(linked);
    const result = standaloneHousingAppearance(linked, fabric, "high", true);
    expect(result.buildings.every(lot => lot.appearance?.profileId === "northern-wooded")).toBe(true);
    expect(result.buildings.map(lot => lot.polygon)).toEqual(fabric.buildings.map(lot => lot.polygon));
    expect(result.lanes).toBe(fabric.lanes);
    expect(JSON.stringify(linked)).toBe(before);
    expect(standaloneHousingAppearance(linked, fabric, "standard", true)).toBe(fabric);
    expect(standaloneHousingAppearance({ ...linked, buildingAppearanceProfile: "legacy" }, fabric, "high", true)).toBe(
      fabric
    );
  }
});

it("retains a supported FMG culture instead of replacing it with a climate fallback", () => {
  const document = createDocument("linked-supported", 400);
  document.buildingAppearanceVersion = 1;
  document.buildingAppearanceContext = {
    period: "ageOfExploration",
    tradition: "hellenic",
    forest: true,
    arid: false,
    wetland: false
  };
  const fabric = { ...buildBlockFabric(document), buildings: buildingAppearancePreview("mediterranean") };
  expect(standaloneHousingAppearance(document, fabric, "high", true)).toBe(fabric);
});

it("replaces Amerford's automatic legacy housing with detailed high-quality models", () => {
  const request = parseIncomingPayload(JSON.stringify(amerford))!;
  const document = generateCityOnDocument(cityEditorDocument(request), cityEditorSettings(request), request.seed)!;
  const fabric = buildBlockFabric(document);
  expect(fabric.buildings.length).toBeGreaterThan(0);
  expect(fabric.buildings.every(lot => lot.appearance?.profileId === "legacy")).toBe(true);
  const view = standaloneHousingAppearance(document, fabric, "high", true);
  const sites = view.buildings.flatMap((lot, i) => {
    const site = regionalHouseSite(lot, i, 0, "high");
    return site ? [site] : [];
  });
  expect(sites).toHaveLength(fabric.buildings.length);
  expect(sites.every(site => site.definition.id.endsWith("|high"))).toBe(true);
  expect(view.buildings.map(lot => lot.polygon)).toEqual(fabric.buildings.map(lot => lot.polygon));
  expect(document.buildingAppearanceProfile).toBeUndefined();
});
