import { afterEach, expect, it } from "vitest";
import { createGridDocument } from "../generators/document";
import { EditorLifetime } from "../services/editorLifetime";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import { buildBuildingAppearanceControls } from "./buildingAppearanceControls";
import { createEditorControls } from "./editorControls";

const mounts: Array<{ scope: EditorLifetime; root: HTMLElement }> = [];
afterEach(() => {
  for (const { scope, root } of mounts.splice(0)) {
    scope.dispose();
    root.remove();
  }
});

it("applies culture and vegetation immediately, restores saved selections and returns to site defaults", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const scope = new EditorLifetime(root);
  mounts.push({ scope, root });
  const controls = createEditorControls(scope);
  let city = createGridDocument({ size: "tiny", grid: "hex", seed: "housing-ui" });
  city.biome = { id: 1, key: "taiga", name: "Forest", color: "green" };
  const original = structuredClone(city);
  const originalMesh = city.mesh;
  const panel = buildBuildingAppearanceControls({
    scope,
    getDocument: () => city,
    updateDocument(next) {
      city = next;
    },
    select: controls.select,
    label: controls.label
  });
  root.append(panel.root);
  const culture = root.querySelector<HTMLSelectElement>(".ce-housing-culture")!;
  const climate = root.querySelector<HTMLSelectElement>(".ce-housing-climate")!;
  culture.value = "northern-wooded";
  culture.dispatchEvent(new Event("change"));
  climate.value = "arid";
  climate.dispatchEvent(new Event("change"));
  expect(city.buildingAppearanceProfile).toBe("northern-wooded");
  expect(city.buildingAppearanceContext).toMatchObject({ forest: false, wetland: false, arid: true });
  expect(city.mesh).toBe(originalMesh);
  expect(city.mesh).toEqual(original.mesh);
  expect(city.featureGroups).toEqual(original.featureGroups);
  const saved = parseDocument(serializeDocument(city))!;
  city = { ...city, buildingAppearanceProfile: "mediterranean", buildingAppearanceClimate: "wet-forest" };
  panel.sync();
  expect(culture.value).toBe("mediterranean");
  expect(climate.value).toBe("wet-forest");
  city = saved;
  panel.sync();
  expect(culture.value).toBe("northern-wooded");
  expect(climate.value).toBe("arid");
  culture.value = "auto";
  climate.value = "auto";
  climate.dispatchEvent(new Event("change"));
  expect(city.buildingAppearanceProfile).toBeUndefined();
  expect(city.buildingAppearanceClimate).toBeUndefined();
  expect(city.buildingAppearanceContext).toMatchObject({ forest: true, wetland: false, arid: false });
});
