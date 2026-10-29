import { beforeAll, describe, expect, it } from "vitest";
import { buildingAppearanceColors } from "../../buildings/appearance/colors";
import { BUILDING_PALETTES, type BuildingPaletteId } from "../../buildings/appearance/palette";
import { buildBlockFabric } from "../generators/blockInfill";
import { withBuildingAppearance } from "../generators/buildingAppearance";
import { limitBuildingRoofColors } from "../generators/buildingAppearanceBuckets";
import { buildingAppearancePreview } from "../generators/buildingAppearancePreview";
import { createGridDocument } from "../generators/document";
import { generateCityOnDocument } from "../generators/generation/generateCity";
import { defaultGenerationSettings } from "../generators/generation/settings";
import type { CityDocument } from "../types/document";
import type { RenderSelection } from "../types/selection";
import { type RenderQuality, renderEditorSvg } from "./editorSvg";
import { parsePickInfo } from "./pickInfo";
import { type HousingViewOptions, standaloneHousingAppearance } from "./standaloneHousingAppearance";
import { renderStandaloneCitySvg, STANDALONE_SVG_STYLE } from "./standaloneSvg";
import { polygon } from "./svgPrimitives";

let city: CityDocument;
const selection: RenderSelection = { faceId: null, edgeId: null, vertexId: null, groupId: null };
const render = (doc: CityDocument, quality: RenderQuality, selected = selection, housingView?: HousingViewOptions) =>
  renderEditorSvg(
    doc,
    "select",
    selected,
    "-600 -600 1200 1200",
    1,
    false,
    null,
    null,
    null,
    null,
    false,
    false,
    undefined,
    false,
    false,
    quality,
    false,
    { core: true, regional: true },
    housingView
  );
beforeAll(() => {
  const seed = "regional-appearance";
  const settings = defaultGenerationSettings();
  settings.buildingPattern = "medieval";
  city = withBuildingAppearance(
    generateCityOnDocument(createGridDocument({ size: "small", grid: "evolution", seed }), settings, seed)!,
    "mediterranean"
  );
});

describe("shared regional SVG appearance", () => {
  it("retains roof colors through batching, selection, minimal display and standalone export", () => {
    const lots = buildBlockFabric(city).buildings;
    const detailed = render(city, "detailed");
    const light = render(city, "light");
    const paths = [...detailed.querySelectorAll<SVGElement>(".ce-building")];
    const byPolygon = new Map(paths.map(p => [p.getAttribute("d"), p]));
    for (const lot of lots.filter(l => l.appearance)) {
      const node = byPolygon.get(polygon(lot.polygon))!;
      expect(node.style.getPropertyValue("--ce-roof-color")).toBe(buildingAppearanceColors(lot.appearance)!.roof);
    }
    const counts = new Map<string, number>();
    for (const node of light.querySelectorAll<SVGElement>(".ce-building-batch")) {
      const id = node.dataset.buildingFace!;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(8);
    const footprints = (svg: SVGElement) =>
      [...svg.querySelectorAll(".ce-building")].reduce(
        (sum, p) => sum + (p.getAttribute("d")?.match(/Z/g)?.length ?? 0),
        0
      );
    expect(footprints(light)).toBe(footprints(detailed));
    const node = light.querySelector<SVGElement>(".ce-building-batch")!;
    const info = parsePickInfo(node.getAttribute("data-pick"))!;
    const selected = render(city, "minimal", { ...selection, faceId: info.faceId as string });
    expect(selected.querySelectorAll(`[data-building-face="${info.faceId}"].ce-building-batch`)).toHaveLength(0);
    const exported = renderStandaloneCitySvg(city);
    expect([...exported.querySelectorAll("style")].map(node => node.textContent).join("\n")).toContain(
      "var(--ce-roof-color"
    );
    expect(
      [...exported.querySelectorAll<SVGElement>(".ce-building")].map(p => p.style.getPropertyValue("--ce-roof-color"))
    ).toEqual(paths.map(p => p.style.getPropertyValue("--ce-roof-color")));
    expect(STANDALONE_SVG_STYLE).toContain("var(--ce-roof-color, #b2afa2)");
    const legacy = { ...city, buildingAppearanceVersion: undefined };
    expect(render(legacy, "light").querySelector(".ce-building")?.getAttribute("style")).not.toContain(
      "--ce-roof-color"
    );
  });

  it("uses the same seeded housing culture for 2D roofs and the high-quality 3D view", () => {
    const automatic = { ...city, buildingAppearanceProfile: undefined };
    const before = JSON.stringify(automatic);
    const fabric = buildBlockFabric(automatic);
    const high = standaloneHousingAppearance(automatic, fabric, "high", false);
    expect(high.buildings.some(lot => lot.appearance && lot.appearance.profileId !== "legacy")).toBe(true);
    const svg = render(automatic, "detailed", selection, { modelQuality: "high", fmgLinked: false });
    const paths = new Map([...svg.querySelectorAll<SVGElement>(".ce-building")].map(p => [p.getAttribute("d"), p]));
    for (const lot of high.buildings.filter(lot => !lot.landmark && lot.appearance)) {
      expect(paths.get(polygon(lot.polygon))?.style.getPropertyValue("--ce-roof-color")).toBe(
        buildingAppearanceColors(lot.appearance)!.roof
      );
    }
    const colors = (svg: SVGElement) =>
      [...svg.querySelectorAll<SVGElement>(".ce-building")].map(p => p.style.getPropertyValue("--ce-roof-color"));
    const baseline = colors(render(automatic, "detailed"));
    expect(colors(render(automatic, "detailed", selection, { modelQuality: "standard", fmgLinked: false }))).toEqual(
      baseline
    );
    const linked = standaloneHousingAppearance(automatic, fabric, "high", true);
    const linkedSvg = render(automatic, "detailed", selection, { modelQuality: "high", fmgLinked: true });
    const linkedPaths = new Map(
      [...linkedSvg.querySelectorAll<SVGElement>(".ce-building")].map(p => [p.getAttribute("d"), p])
    );
    for (const lot of linked.buildings.filter(lot => !lot.landmark && lot.appearance))
      expect(linkedPaths.get(polygon(lot.polygon))?.style.getPropertyValue("--ce-roof-color")).toBe(
        buildingAppearanceColors(lot.appearance)!.roof
      );
    expect(JSON.stringify(automatic)).toBe(before);
  });

  it("limits mixed-material blocks deterministically before 2D/3D consume them", () => {
    const base = buildingAppearancePreview("mediterranean")[0];
    const lots = (Object.keys(BUILDING_PALETTES) as BuildingPaletteId[])
      .filter(id => !id.startsWith("legacy-"))
      .map((id, i) => ({
        ...base,
        id: String(i),
        appearance: { ...base.appearance!, roofPaletteId: id, shadeBin: 1 as const }
      }));
    const before = JSON.stringify(lots);
    const limited = limitBuildingRoofColors(lots);
    expect(new Set(limited.map(l => buildingAppearanceColors(l.appearance)!.roof)).size).toBeLessThanOrEqual(8);
    expect(limitBuildingRoofColors([...lots].reverse()).reverse()).toEqual(limited);
    expect(JSON.stringify(lots)).toBe(before);
  });

  it("shows region-specific roofs on identical preview footprints", () => {
    const south = buildingAppearancePreview("mediterranean");
    const north = buildingAppearancePreview("northern-wooded");
    const urban = buildingAppearancePreview("northern-urban");
    expect(south.map(l => l.polygon)).toEqual(north.map(l => l.polygon));
    expect(south.every(l => l.massing!.roof.material === "tile")).toBe(true);
    expect(north.some(l => ["shingle", "thatch", "turf"].includes(l.massing!.roof.material))).toBe(true);
    expect(urban.some(l => l.massing!.roof.material === "tile")).toBe(true);
  });
});
