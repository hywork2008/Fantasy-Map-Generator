import { expect, it } from "vitest";
import { inheritBuildingAppearance } from "../generators/buildingAppearance";
import { withCityBiome } from "../generators/cityBiome";
import { createGridDocument } from "../generators/document";
import { defaultGenerationSettings } from "../generators/generation/settings";
import { DocumentHistory } from "../generators/history";
import { resolveLandscapeTheme } from "../renderers/landscape";
import { landscapeTreeSpecies } from "../renderers/landscapeTreeSpecies";
import { EditorLifetime } from "../services/editorLifetime";
import { parseDocument, serializeDocument } from "../services/io/documentCodec";
import { buildBiomeControls } from "./biomeControls";
import { createEditorControls } from "./editorControls";

it("updates vegetation and housing, preserves geometry and round-trips history, files and regeneration inputs", () => {
  const root = document.createElement("div");
  const scope = new EditorLifetime(root);
  const controls = createEditorControls(scope);
  let city = createGridDocument({ size: "tiny", grid: "hex", seed: "biome-ui" });
  const original = city;
  const history = new DocumentHistory(city);
  const panel = buildBiomeControls({
    scope,
    getDocument: () => city,
    isImported: () => false,
    select: controls.select,
    label: controls.label,
    updateDocument(next) {
      city = history.commit(next, "Biome");
    }
  });
  root.append(panel.root);
  const select = root.querySelector<HTMLSelectElement>(".ce-biome")!;
  try {
    expect(Array.from(select.options).some(option => option.value === "marine")).toBe(false);
    select.value = "hotDesert";
    select.dispatchEvent(new Event("change"));
    expect(city.biome).toMatchObject({ key: "hotDesert", tags: expect.arrayContaining(["desert"]) });
    expect(city.buildingAppearanceContext).toMatchObject({ arid: true, forest: false });
    expect(landscapeTreeSpecies("garden_parkland", city, [0, 0])).toBe("date_palm");
    const desert = resolveLandscapeTheme(city.biome);
    select.value = "taiga";
    select.dispatchEvent(new Event("change"));
    expect(city.buildingAppearanceContext).toMatchObject({ arid: false, forest: true });
    expect(landscapeTreeSpecies("olive", city, [0, 0])).toBe("norway_spruce");
    expect(resolveLandscapeTheme(city.biome)).not.toEqual(desert);
    expect(city.mesh).toBe(original.mesh);
    expect(inheritBuildingAppearance(original, city).biome).toEqual(city.biome);
    city = parseDocument(serializeDocument(city))!;
    panel.sync();
    expect(select.value).toBe("taiga");
    city = history.undo(city)!;
    panel.sync();
    expect(select.value).toBe("hotDesert");
    city = history.redo(city)!;
    panel.sync();
    expect(select.value).toBe("taiga");
    select.value = "";
    select.dispatchEvent(new Event("change"));
    expect(city.biome).toBeUndefined();
    expect(inheritBuildingAppearance(original, city).biome).toBeUndefined();
  } finally {
    scope.dispose();
  }
});

it("displays imported custom biomes without allowing an FMG override", () => {
  const root = document.createElement("div");
  const scope = new EditorLifetime(root);
  const controls = createEditorControls(scope);
  const city = createGridDocument({ size: "tiny", grid: "hex", seed: "biome-import" });
  city.biome = { id: 40, key: "custom:woodland", name: "Custom woodland", color: "green" };
  const panel = buildBiomeControls({
    scope,
    getDocument: () => city,
    isImported: () => true,
    select: controls.select,
    label: controls.label,
    updateDocument() {
      throw new Error("Imported biomes must be retained");
    }
  });
  root.append(panel.root);
  try {
    const select = root.querySelector<HTMLSelectElement>(".ce-biome")!;
    expect(select.disabled).toBe(true);
    expect(select.selectedOptions[0].textContent).toBe("Custom woodland");
    panel.sync();
    expect(select.querySelectorAll("[data-custom-biome]")).toHaveLength(1);
  } finally {
    scope.dispose();
  }
});

it("updates the replay recipe without mutating its earlier biome", () => {
  const city = createGridDocument({ size: "tiny", grid: "hex", seed: "biome-recipe" });
  city.fabric = {
    version: 4,
    seed: "biome-recipe",
    districts: [],
    generation: {
      algorithm: "evolution-city-v3",
      seed: "biome-recipe",
      settings: defaultGenerationSettings(),
      input: { ...city }
    }
  };
  const biome = { id: 9, key: "taiga", name: "Taiga", color: "green", tags: ["forest", "cold"] };
  const next = withCityBiome(city, biome);
  expect(next.fabric!.generation!.input.biome).toEqual(biome);
  expect(next.fabric!.generation!.input.buildingAppearanceContext).toMatchObject({ forest: true });
  expect(city.fabric.generation!.input.biome).toBeUndefined();
  expect(withCityBiome(next, undefined).fabric!.generation!.input.biome).toBeUndefined();
});
