import { expect, it, vi } from "vitest";
import { createGridDocument } from "../generators/document";
import { defaultGenerationSettings } from "../generators/generation/settings";
import { DocumentHistory } from "../generators/history";
import { generateRuralFieldStage } from "../generators/ruralFieldStage";
import { createGenerationController, type GenerationContext } from "./generation";
import { generationStages } from "./generationStages";

it("keeps the farmland snapshot in the completed result while earlier stages hide it and concealment retains it", () => {
  const settings = defaultGenerationSettings();
  const source = createGridDocument({ size: "small", grid: "square", seed: "farmland-playback" });
  const complete = generateRuralFieldStage({ ...source, appearance: "town" });
  const ctx = {
    root: document.createElement("div"),
    generation: {
      completeSource: source,
      completeResult: complete,
      completeResultSettings: JSON.stringify(settings),
      generationHistory: new Map(),
      generateSettings: settings,
      generateSeed: "farmland-playback"
    },
    documents: { documentState: complete, history: new DocumentHistory(complete) },
    display: {},
    interaction: {},
    rememberGenerationState: vi.fn(),
    clearFailurePreview: vi.fn(),
    generationLog: { reset: vi.fn() },
    syncStageUi: vi.fn(),
    stepStatus: document.createElement("output"),
    rebuildEditorIndexes: vi.fn(),
    showNotice: vi.fn(),
    redrawMap: vi.fn(),
    documentForOutput: (value: unknown) => value
  } as unknown as GenerationContext;
  const controller = createGenerationController(ctx);
  const stages = generationStages(settings);
  controller.runGenerationStage(stages.find(s => s.id === "buildings")!);
  expect(ctx.documents.documentState.ruralFieldSnapshot).toBeUndefined();
  expect(ctx.generation.completeResult!.ruralFieldSnapshot).toEqual(complete.ruralFieldSnapshot);
  controller.runGenerationStage(stages.find(s => s.id === "farmland")!);
  const snapshot = ctx.documents.documentState.ruralFieldSnapshot;
  expect(snapshot).toBeDefined();
  expect(ctx.display.hideStreetLines).toBe(false);
  controller.runGenerationStage(stages.find(s => s.id === "conceal")!);
  expect(ctx.documents.documentState.ruralFieldSnapshot).toEqual(snapshot);
  expect(ctx.display.hideStreetLines).toBe(true);
});
