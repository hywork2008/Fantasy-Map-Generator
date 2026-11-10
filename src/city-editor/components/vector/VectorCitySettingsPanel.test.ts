import { describe, expect, it } from "vitest";
import { defaultGenerationSettings } from "../../generators/generation/settings";
import { defaultPopulationSettings } from "../../generators/populationPlan";
import { createVectorDocument } from "../../generators/vector/document";
import type { VectorEditorGenerationInput } from "../../generators/vector/generation/editorInput";
import { vectorInputFromEditor } from "../../generators/vector/generation/editorInput";
import { vectorHousingCulture } from "../../generators/vector/generation/housingCulture";
import { DEFAULT_VECTOR_GENERATION, generateVectorSkeleton } from "../../generators/vector/generation/pipeline";
import { DEFAULT_VECTOR_URBAN, generateVectorUrban } from "../../generators/vector/generation/urban";
import { VectorDocumentHistory } from "../../generators/vector/history";
import { vectorRenderData } from "../../renderers/vector/renderData";
import { EditorLifetime } from "../../services/editorLifetime";
import { createVectorCitySettingsPanel } from "./VectorCitySettingsPanel";

const mount = () => {
  const root = document.createElement("div"),
    panel = document.createElement("div");
  root.append(panel);
  document.body.append(root);
  const input: VectorEditorGenerationInput = {
      seed: "settings",
      settings: { ...defaultGenerationSettings(), population: defaultPopulationSettings(3000) },
      frame: { extentMeters: 1200, cityRadiusMeters: 396, blockSizeMeters: 50 }
    },
    history = new VectorDocumentHistory(createVectorDocument()),
    scope = new EditorLifetime(root);
  let changes = 0;
  createVectorCitySettingsPanel(
    scope,
    panel,
    input,
    () => history.document,
    (doc, label) => history.commit(doc, label),
    () => changes++
  );
  const field = <T extends HTMLElement>(key: string) => panel.querySelector<T>(`[data-city-setting="${key}"]`)!;
  const pick = (key: string, value: string) => {
    const element = field<HTMLSelectElement | HTMLInputElement>(key);
    if (element instanceof HTMLInputElement && element.type === "checkbox") element.checked = value === "true";
    else element.value = value;
    element.dispatchEvent(new Event("change"));
  };
  return { input, history, field, pick, changes: () => changes, dispose: () => scope.dispose() };
};

describe("meshless city settings without the mesh editor", () => {
  it("sets the coast, port and walls on the generation input that Generate city reads", () => {
    const ui = mount();
    try {
      ui.pick("coast", "bay");
      ui.pick("port", "true");
      ui.pick("walls", "true");
      ui.pick("wallShape", "round");
      ui.pick("historicalPeriod", "lateMedieval");
      ui.pick("forestMode", "surroundings");
      expect(ui.input.settings.config.coast).toBe("bay");
      expect(ui.input.settings.config.features.port).toBe(true);
      expect(ui.input.settings.config.features.walls).toBe(true);
      expect(ui.input.settings.wallShape).toBe("round");
      expect(ui.input.settings.forestSettings).toEqual({ version: 1, mode: "surroundings", density: "standard" });
      expect(ui.changes()).toBe(6);
      const doc = vectorInputFromEditor(ui.input);
      expect(doc.context.historicalPeriod).toBe("lateMedieval");
      expect(doc.context.requestedSettings?.config.coast).toBe("bay");
      expect(doc.site?.water.length).toBeGreaterThan(0);
    } finally {
      ui.dispose();
    }
  });

  it("applies the housing culture to the open city and keeps it for the next one", () => {
    const ui = mount();
    try {
      ui.pick("housingCulture", "stone-upland");
      expect(vectorHousingCulture(ui.history.document)).toBe("stone-upland");
      expect(vectorHousingCulture(vectorInputFromEditor(ui.input))).toBe("stone-upland");
      ui.pick("housingCulture", "");
      expect(vectorHousingCulture(ui.history.document)).toBeUndefined();
    } finally {
      ui.dispose();
    }
  });

  it("draws the generated houses in the chosen culture", () => {
    const ui = mount();
    try {
      for (const culture of ["stone-upland", "mediterranean"]) {
        ui.pick("housingCulture", culture);
        const doc = generateVectorUrban(
            generateVectorSkeleton(vectorInputFromEditor(ui.input), { ...DEFAULT_VECTOR_GENERATION, seed: "settings" })
              .document,
            { ...DEFAULT_VECTOR_URBAN, population: 3000 }
          ),
          houses = vectorRenderData(doc, "housing").surfaces.find(s => s.houses?.appearance)!.houses!;
        expect(new Set(houses.appearance!.map(a => a?.profileId))).toEqual(new Set([culture]));
      }
    } finally {
      ui.dispose();
    }
  });

  it("restyles a generated city's houses in place, without regenerating it", () => {
    const ui = mount();
    try {
      const city = generateVectorUrban(
        generateVectorSkeleton(vectorInputFromEditor(ui.input), { ...DEFAULT_VECTOR_GENERATION, seed: "settings" })
          .document,
        { ...DEFAULT_VECTOR_URBAN, population: 3000 }
      );
      ui.history.commit(city, "generate");
      for (const culture of ["stone-upland", "mediterranean"]) {
        // Committing validates the city: the culture is not part of what the generation owns.
        ui.pick("housingCulture", culture);
        const doc = ui.history.document;
        expect(doc.fabric).toEqual(city.fabric);
        const houses = vectorRenderData(doc, "housing").surfaces.find(s => s.houses?.appearance)!.houses!;
        expect(new Set(houses.appearance!.map(a => a?.profileId))).toEqual(new Set([culture]));
      }
    } finally {
      ui.dispose();
    }
  });
});
