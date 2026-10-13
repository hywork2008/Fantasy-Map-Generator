import { editorText } from "../../i18n/editorMessages";
import {
  generateCoastWalkStep,
  generateGateStep,
  generateRiverWalkStep,
  generateRoadStep,
  generateStageOnDocument,
  generateUrbanPatchStep,
  generateWardStep
} from "../generators/generation/previews";
import type { CityDocument, Id } from "../types/document";
import type { StepFn, UiStepResult } from "../types/editor";
import type { GenerationStage, GenerationStepResult } from "../types/generation";
export function asUiStep(result: GenerationStepResult): UiStepResult {
  return {
    document: result.document,
    total: result.total,
    index: result.index,
    detail: result.detail,
    overlayPaths: result.overlayPaths ?? null
  };
}

export function buildableLandFaceIds(document: CityDocument, coreMode?: "legacy" | "compact"): Set<Id> {
  const ids = new Set<Id>();
  for (const face of Object.values(document.mesh.faces)) {
    if (
      face.properties.water === "land" &&
      face.properties.buildable &&
      (coreMode !== "compact" || face.properties.settlement === "core")
    )
      ids.add(face.id);
  }
  return ids;
}
export const STEP_FNS: Record<GenerationStage["id"], StepFn> = {
  coast: (doc, settings, seed, idx) => asUiStep(generateCoastWalkStep(doc, settings, seed, idx)),
  river: (doc, settings, seed, idx) => asUiStep(generateRiverWalkStep(doc, settings, seed, idx)),
  urban: (doc, settings, seed, idx) => {
    const r = generateUrbanPatchStep(doc, settings, seed, idx);
    return {
      document: r.document,
      total: r.total,
      index: r.index,
      detail: r.total > 0 ? `cell #${r.cellId} — ${r.index + 1}/${r.total}` : null,
      highlightFaces: r.document ? buildableLandFaceIds(r.document, settings.urbanCoreMode) : null
    };
  },
  walls: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 4, undefined, "walls"),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.wallPlacementComplete");
    }
  }),
  riverPassages: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 4, undefined, "riverPassages"),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.riverCrossingCellSplitsAndWallRoutesComplete");
    }
  }),
  passages: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 4, undefined, "passages"),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.gatePassagesPrepared");
    }
  }),
  gates: (doc, settings, seed, idx) => asUiStep(generateGateStep(doc, settings, seed, idx)),
  streets: (doc, settings, seed, idx) => asUiStep(generateRoadStep(doc, settings, seed, idx)),
  wards: (doc, settings, seed, idx) => asUiStep(generateWardStep(doc, settings, seed, idx)),
  centerRoads: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 6),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.gateToCenterRoadsComplete");
    }
  }),
  townStreets: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 7, undefined, "streets"),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.townStreetsComplete");
    }
  }),
  innerWall: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 7, undefined, "innerWall"),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.innerWallComplete");
    }
  }),
  innerGates: (doc, settings, seed) => ({
    document: generateStageOnDocument(doc, settings, seed, 7, undefined, "innerGates"),
    total: 1,
    index: 0,
    get detail() {
      return editorText("cityEditor.messages.innerGatesAndRoadsComplete");
    }
  }),
  geometry: (doc, settings, seed) => {
    const d = generateStageOnDocument(doc, settings, seed, 7);
    return { document: d, total: 1, index: 0, detail: editorText("cityEditor.messages.geometrySmoothingComplete") };
  },
  blocks: (doc, settings, seed) => {
    const d = generateStageOnDocument(doc, settings, seed, 8);
    return { document: d, total: 1, index: 0, detail: editorText("cityEditor.messages.blocksAndLanesComplete") };
  },
  buildings: (doc, settings, seed) => {
    const d = generateStageOnDocument(doc, settings, seed, 9);
    return { document: d, total: 1, index: 0, detail: editorText("cityEditor.messages.housingPlacementComplete") };
  },
  conceal: (doc, settings, seed) => {
    const d = generateStageOnDocument(doc, settings, seed, 10);
    return { document: d, total: 1, index: 0, detail: editorText("cityEditor.messages.roadsAndLanesHidden") };
  }
};
