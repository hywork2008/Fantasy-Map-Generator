import { expect, it, vi } from "vitest";
import { createGridDocument } from "../generators/document";
import { generateCityAttempt, generateCityOnDocument } from "../generators/generation/generateCity";
import { generateStageOnDocument } from "../generators/generation/previews";
import { defaultGenerationSettings } from "../generators/generation/settings";
import { DocumentHistory } from "../generators/history";
import { renderEditorSvg } from "../renderers/editorSvg";
import type { CityDocument, LandmarkInstance } from "../types/document";
import { createGenerationController, type GenerationContext } from "./generation";
import { generationStages } from "./generationStages";

vi.mock("../generators/generation/generateCity", () => ({
  generateCityAttempt: vi.fn(),
  generateCityOnDocument: vi.fn(),
  COMPLETE_CITY_ATTEMPTS: 1
}));

it.each([false, true])("shows facilities before housing during stage playback (cached: %s)", cached => {
  const settings = { ...defaultGenerationSettings(), facilityLayout: "population" as const };
  const source = createGridDocument({ size: "small", grid: "square", seed: "facility-playback" });
  for (const face of Object.values(source.mesh.faces))
    Object.assign(face.properties, { ward: "craftsmen", settlement: "core" });
  const facility: LandmarkInstance = {
    id: "population-facility:workshop:baking:0",
    assetId: "bakehouse",
    assetRevision: "1",
    position: [0, 0],
    rotation: 0,
    scale: 1,
    site: [],
    accesses: [],
    locked: false
  };
  const manual = { ...facility, id: "manual-landmark" };
  const complete: CityDocument = {
    ...source,
    appearance: "town",
    landmarks: [manual, facility],
    landmarkAssets: [
      {
        id: "bakehouse",
        revision: "1",
        name: "Bakehouse",
        historicalPhase: "medieval",
        referenceSizeMeters: [10, 10],
        dimensionSource: "test",
        provenanceId: "test",
        footprint: [
          {
            outer: [
              [-5, -5],
              [5, -5],
              [5, 5],
              [-5, 5]
            ],
            holes: []
          }
        ],
        minimumSite: [],
        entrances: [],
        renderSvg: '<svg xmlns="http://www.w3.org/2000/svg"><path d="M-5-5H5V5H-5Z"/></svg>'
      }
    ],
    facilityReport: { population: 100, required: 1, placed: 1, provisional: 0, sites: [], unplaced: [] }
  };
  vi.mocked(generateCityAttempt).mockImplementation(() => structuredClone(complete));
  vi.mocked(generateCityOnDocument).mockImplementation(() => structuredClone(complete));
  const stages = generationStages(settings);
  for (const id of ["geometry", "blocks", "facilities", "buildings"] as const) {
    const stage = stages.find(s => s.id === id)!;
    const preview = generateStageOnDocument(
      source,
      settings,
      "facility-playback",
      stage.processStep,
      undefined,
      stage.wallCheckpoint
    )!;
    const hasFacilities = id === "facilities" || id === "buildings";
    expect(preview.landmarks).toEqual(hasFacilities ? complete.landmarks : [manual]);
    expect(preview.facilityReport).toEqual(hasFacilities ? complete.facilityReport : undefined);
  }

  const ctx = {
    root: document.createElement("div"),
    generation: {
      completeSource: source,
      completeResult: cached ? complete : null,
      completeResultSettings: JSON.stringify(settings),
      generationHistory: new Map(),
      generateSettings: settings,
      generateSeed: "facility-playback"
    },
    documents: { documentState: complete, history: new DocumentHistory(complete) },
    display: {},
    interaction: {},
    rememberGenerationState: vi.fn(),
    clearFailurePreview: vi.fn(),
    generationLog: { reset: vi.fn() },
    failureDebugInput: document.createElement("input"),
    appendGenerationException: vi.fn(),
    syncStageUi: vi.fn(),
    stepStatus: document.createElement("output"),
    rebuildEditorIndexes: vi.fn(),
    showNotice: vi.fn(),
    redrawMap: vi.fn()
  } as unknown as GenerationContext;
  const controller = createGenerationController(ctx);
  for (const id of ["geometry", "blocks", "facilities", "buildings", "geometry", "facilities", "buildings"] as const) {
    controller.runGenerationStage(stages.find(s => s.id === id)!);
    const hasFacilities = id === "facilities" || id === "buildings";
    expect(ctx.documents.documentState.landmarks).toEqual(hasFacilities ? complete.landmarks : [manual]);
    expect(ctx.documents.documentState.facilityReport).toEqual(hasFacilities ? complete.facilityReport : undefined);
    if (ctx.generation.completeResult) {
      expect(ctx.generation.completeResult.landmarks).toEqual([manual, facility]);
      expect(ctx.generation.completeResult.facilityReport).toEqual(complete.facilityReport);
    }
    const svg = renderEditorSvg(
      ctx.documents.documentState,
      "select",
      { faceId: null, edgeId: null, vertexId: null },
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
      ctx.display.hideBuildings
    );
    expect(svg.querySelector(`[data-landmark="${facility.id}"]`) !== null).toBe(hasFacilities);
    expect(svg.querySelector(".ce-building") !== null).toBe(id === "buildings");
  }
});
