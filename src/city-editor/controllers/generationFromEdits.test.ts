import { expect, it, vi } from "vitest";
import { buildBlockFabric } from "../generators/blockInfill";
import { createGridDocument } from "../generators/document";
import { createFabricPlan } from "../generators/fabricDistricts";
import { defaultGenerationSettings } from "../generators/generation/settings";
import { DocumentHistory } from "../generators/history";
import { clone } from "../generators/mesh";
import { createGenerationController, type GenerationContext } from "./generation";
import { generationStages } from "./generationStages";

it("finishes the live edits without restoring the old source or reclassifying cells, and supports undo and stage playback", () => {
  const source = createGridDocument({ size: "small", grid: "square", seed: "edited-fabric" });
  const edited = clone(source);
  const faces = Object.values(edited.mesh.faces);
  for (const face of faces) Object.assign(face.properties, { ward: "craftsmen", settlement: "core" });
  Object.assign(faces[0].properties, { ward: "farm", settlement: "outskirts" });
  faces[1].properties.ward = "empty";
  faces[2].properties.ward = "park";
  faces[3].properties.locked = true;
  faces[4].properties.water = "sea";
  edited.featureGroups.push({
    id: "edited-road",
    kind: "road",
    name: "Street",
    locked: false,
    segments: [faces[5].boundary[0]],
    style: { widthMeters: 6, color: "black" }
  });
  edited.fabric = createFabricPlan(edited, "old");
  edited.fabric.districts[0].parameters.laneWidth = 5;
  const before = clone(edited);
  const settings = defaultGenerationSettings();
  const ctx = {
    root: document.createElement("div"),
    scope: { active: true },
    generation: {
      completeSource: source,
      completeResult: source,
      generationHistory: new Map(),
      generateSettings: settings,
      generateSeed: "edited-fabric"
    },
    documents: { documentState: edited, history: new DocumentHistory(edited) },
    display: {},
    interaction: {},
    rememberGenerationState: vi.fn(),
    clearFailurePreview: vi.fn(),
    generationLog: { reset: vi.fn() },
    syncStageUi: vi.fn(),
    stepStatus: document.createElement("output"),
    rebuildEditorIndexes: vi.fn(),
    refresh: vi.fn(),
    showNotice: vi.fn(),
    redrawMap: vi.fn(),
    appendGenerationException: vi.fn(),
    documentForOutput: (value: unknown) => value
  } as unknown as GenerationContext;
  const controller = createGenerationController(ctx);
  controller.generateFromEdits();
  expect(ctx.appendGenerationException).not.toHaveBeenCalled();
  const result = ctx.documents.documentState;
  expect(result).not.toBe(edited);
  expect(edited).toEqual(before);
  expect(result.mesh).toEqual(before.mesh);
  expect(result.featureGroups).toEqual(before.featureGroups);
  expect(result.elements).toEqual(before.elements);
  expect(result.fabric!.districts[0].parameters.laneWidth).toBe(5);
  expect(result.fabric!.generation).toBeUndefined();
  expect(buildBlockFabric(result).buildings.length).toBeGreaterThan(0);
  expect(result.ruralFieldSnapshot!.farms.length).toBeGreaterThan(0);
  expect(ctx.documents.history.undo(result)).toEqual(before);
  expect(ctx.documents.history.redo(before)).toEqual(result);
  const stages = generationStages(settings);
  controller.runGenerationStage(stages.find(stage => stage.id === "blocks")!);
  expect(ctx.display.hideBuildings).toBe(true);
  expect(ctx.documents.documentState.mesh).toEqual(before.mesh);
  controller.runGenerationStage(stages.find(stage => stage.id === "farmland")!);
  expect(ctx.documents.documentState.ruralFieldSnapshot).toEqual(result.ruralFieldSnapshot);
});
