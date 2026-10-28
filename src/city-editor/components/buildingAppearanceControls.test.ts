import { afterEach, expect, it } from "vitest";
import { buildBlockFabric, documentFabricFingerprint } from "../generators/blockInfill";
import { createGridDocument } from "../generators/document";
import { ruralFieldOverlay, storeRuralFieldOverlay } from "../generators/ruralFieldOverlay";
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

it.each(["snapshot", "session"])("retains %s farmland through housing culture and climate changes", source => {
  const root = document.createElement("div");
  document.body.append(root);
  const scope = new EditorLifetime(root);
  mounts.push({ scope, root });
  const controls = createEditorControls(scope);
  let city = createGridDocument({ size: "tiny", grid: "hex", seed: "housing-fields" });
  city.ruralFieldVersion = 2;
  city.ruralFieldSettings = { mode: "manual" };
  const overlay: NonNullable<ReturnType<typeof ruralFieldOverlay>> = {
    farms: [
      {
        faceId: "field",
        polygon: [
          [0, 0],
          [10, 0],
          [10, 10]
        ],
        rows: [],
        cropState: "winter-crop"
      }
    ],
    lanes: [
      {
        faceId: "field",
        points: [
          [0, 0],
          [10, 0]
        ],
        widthMeters: 2,
        kind: "farm-track"
      }
    ]
  };
  const fingerprint = documentFabricFingerprint(city);
  if (source === "snapshot") city.ruralFieldSnapshot = { ...overlay, fingerprint };
  else storeRuralFieldOverlay(city, fingerprint, overlay);
  const panel = buildBuildingAppearanceControls({
    scope,
    getDocument: () => city,
    updateDocument(next) {
      city = next;
    },
    select: controls.select,
    label: controls.label,
    modelQualityChanged() {}
  });
  root.append(panel.root);
  for (const [selector, value] of [
    [".ce-housing-culture", "mediterranean"],
    [".ce-housing-culture", "northern-wooded"],
    [".ce-housing-climate", "arid"],
    [".ce-housing-culture", "auto"]
  ]) {
    const control = root.querySelector<HTMLSelectElement>(selector)!;
    control.value = value;
    control.dispatchEvent(new Event("change"));
    const fabric = buildBlockFabric(city);
    expect(fabric.farms).toEqual(overlay.farms);
    expect(fabric.lanes).toEqual(overlay.lanes);
    if (source === "snapshot") {
      const saved = parseDocument(serializeDocument(city))!;
      expect(ruralFieldOverlay(saved, documentFabricFingerprint(saved))?.farms).toEqual(overlay.farms);
    }
  }
});

it("defaults a new city to varied heights and switches to uniform while retaining city limits", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const scope = new EditorLifetime(root);
  mounts.push({ scope, root });
  const controls = createEditorControls(scope);
  let city = createGridDocument({ size: "tiny", grid: "hex", seed: "height-mode-ui" });
  let policy = { version: 1 as const, profile: "european-medieval-v1" as const } as typeof city.buildingHeightPolicy;
  const panel = buildBuildingAppearanceControls({
    scope,
    getDocument: () => city,
    getGenerationHeightPolicy: () => policy,
    updateDocument(next) {
      city = next;
      policy = next.buildingHeightPolicy;
      panel.sync();
    },
    select: controls.select,
    label: controls.label,
    modelQualityChanged() {}
  });
  root.append(panel.root);
  const mode = root.querySelector<HTMLSelectElement>(".ce-building-height-mode")!;
  expect(mode.value).toBe("varied");
  mode.value = "uniform";
  mode.dispatchEvent(new Event("change"));
  expect(city.buildingHeightPolicy).toBeUndefined();
  const cap = root.querySelector<HTMLInputElement>(".ce-city-height-storeys")!;
  cap.value = "2";
  cap.dispatchEvent(new Event("change"));
  expect(city.buildingHeightLimit).toEqual({ maxStoreys: 2 });
  expect(mode.value).toBe("uniform");
  mode.value = "varied";
  mode.dispatchEvent(new Event("change"));
  expect(city.buildingHeightPolicy?.version).toBe(1);
  expect(city.buildingHeightLimit).toEqual({ maxStoreys: 2 });
});

it("persists urban and outskirts simplification independently without editing the document", async () => {
  const { readSimplificationPreferences } = await import("../services/browserPreferences");
  localStorage.removeItem("fmg-city-editor:simplification");
  const root = document.createElement("div");
  document.body.append(root);
  const scope = new EditorLifetime(root);
  mounts.push({ scope, root });
  const controls = createEditorControls(scope);
  const city = createGridDocument({ size: "tiny", grid: "hex", seed: "simplification-ui" });
  const before = serializeDocument(city);
  let redraws = 0;
  const context = {
    scope,
    getDocument: () => city,
    updateDocument() {
      throw new Error("Viewer preferences must not edit the city");
    },
    select: controls.select,
    label: controls.label,
    modelQualityChanged() {
      redraws++;
    }
  };
  const panel = buildBuildingAppearanceControls(context);
  root.append(panel.viewControls);
  const urban = root.querySelector<HTMLSelectElement>(".ce-urban-simplification")!;
  const outskirts = root.querySelector<HTMLSelectElement>(".ce-outskirts-simplification")!;
  expect([urban.value, outskirts.value]).toEqual(["auto", "auto"]);
  urban.value = "off";
  urban.dispatchEvent(new Event("change"));
  expect(readSimplificationPreferences()).toEqual({ urban: "off", outskirts: "auto" });
  outskirts.value = "off";
  outskirts.dispatchEvent(new Event("change"));
  expect(readSimplificationPreferences()).toEqual({ urban: "off", outskirts: "off" });
  urban.value = "auto";
  urban.dispatchEvent(new Event("change"));
  expect(readSimplificationPreferences()).toEqual({ urban: "auto", outskirts: "off" });
  expect(redraws).toBe(3);
  const restored = buildBuildingAppearanceControls(context);
  expect(restored.viewControls.querySelector<HTMLSelectElement>(".ce-outskirts-simplification")!.value).toBe("off");
  expect(serializeDocument(city)).toBe(before);
  localStorage.setItem("fmg-city-editor:simplification", '{"urban":"invalid","outskirts":"off"}');
  expect(readSimplificationPreferences()).toEqual({ urban: "auto", outskirts: "off" });
  localStorage.setItem("fmg-city-editor:simplification", "invalid");
  expect(readSimplificationPreferences()).toEqual({ urban: "auto", outskirts: "auto" });
  localStorage.removeItem("fmg-city-editor:simplification");
});
