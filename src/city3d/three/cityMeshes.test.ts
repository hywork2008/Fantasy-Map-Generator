import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildingAppearanceColors } from "../../buildings/appearance/colors";
import { meshProjection } from "../../buildings/meshProjection";
import { buildingAppearancePreview } from "../../city-editor/generators/buildingAppearancePreview";
import { createCityMassing } from "./cityMeshes";
import { ROOF_COLOR, tinted } from "./palette";

describe("regional city massing colors", () => {
  it("uses linearized common colors without adding meshes or vertices and recolors in place", () => {
    const lots = buildingAppearancePreview("mediterranean");
    const legacy = createCityMassing(lots.map(({ appearance, ...lot }) => lot));
    const colored = createCityMassing(lots);
    expect(colored.pickables).toHaveLength(2);
    for (let i = 0; i < 2; i++) {
      const geometry = colored.pickables[i].geometry;
      expect(geometry.getAttribute("position").array).toEqual(
        legacy.pickables[i].geometry.getAttribute("position").array
      );
      const expected = new THREE.Color(buildingAppearanceColors(lots[0].appearance)![i ? "roof" : "wall"]);
      const color = geometry.getAttribute("color");
      expect(color.getX(0)).toBeCloseTo(expected.r, 6);
      expect(color.getY(0)).toBeCloseTo(expected.g, 6);
      expect(color.getZ(0)).toBeCloseTo(expected.b, 6);
    }
    const positions = colored.pickables[0].geometry.getAttribute("position");
    const changed = lots.map(lot => ({ ...lot, appearance: { ...lot.appearance!, shadeBin: 2 as const } }));
    expect(colored.updateAppearance!(changed)).toBe(true);
    expect(colored.pickables[0].geometry.getAttribute("position")).toBe(positions);
    const displaced = lots.map(lot => ({
      ...lot,
      polygon: lot.polygon.map(([x, y]) => [x + 1, y] as [number, number])
    }));
    expect(colored.updateAppearance!(displaced)).toBe(false);
    legacy.dispose();
    colored.dispose();
  });

  it("keeps legacy linear colors and projects vertex-colored BV previews", () => {
    const lots = buildingAppearancePreview("legacy");
    const model = createCityMassing(lots);
    const color = model.pickables[1].geometry.getAttribute("color");
    const expected = tinted(ROOF_COLOR[lots[0].massing!.roof.material], lots[0].massing!.tint);
    expect(color.getX(0)).toBeCloseTo(expected[0], 6);
    model.dispose();
    const preview = createCityMassing(buildingAppearancePreview("mediterranean"));
    const svg = meshProjection(preview, "top");
    expect(svg).toContain('fill="#');
    expect(svg).not.toContain("#ffffff");
    expect(svg).not.toContain("#e7e7e7");
    preview.dispose();
  });
});
