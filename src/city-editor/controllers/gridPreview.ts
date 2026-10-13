import { editorText } from "../../i18n/editorMessages";
import { clamp } from "../components/editorControls";
import { buildGridEvolution } from "../core/gen/gridEvolution";
import { makeRng } from "../core/gen/prng";
import { clearGenerationPreviewCache } from "../core/generate";
import { meshFromCells, validate } from "../core/mesh";
import type { CityDocument } from "../core/types";
import type { GridOverlay } from "../render/svg";
import type { DisplayState, DocumentsState, GenerationState, InteractionState } from "../state/editorSession";
import { emptySelection } from "./tools/toolTypes";

export interface GridPreviewContext {
  showNotice: (value: string, redraw?: boolean) => void;
  redrawMap: () => void;
  gridEvoSlider: HTMLInputElement;
  gridEvoFirstButton: HTMLButtonElement;
  gridEvoPrevButton: HTMLButtonElement;
  gridEvoNextButton: HTMLButtonElement;
  gridEvoLastButton: HTMLButtonElement;
  gridEvoAdoptButton: HTMLButtonElement;
  gridEvoLabel: HTMLOutputElement;
  stepStatus: HTMLOutputElement;
  rebuildEditorIndexes: () => void;
  refresh: () => void;
  documents: Pick<DocumentsState, "documentState" | "history" | "referenceImage">;
  interaction: Pick<InteractionState, "selection" | "activeGroupId">;
  generation: Pick<
    GenerationState,
    | "gridEvoStages"
    | "gridEvoParams"
    | "gridEvoSeed"
    | "gridEvoIndex"
    | "activeStepStage"
    | "stepIndex"
    | "urbanCoreHighlight"
    | "stepOverlayPaths"
    | "lastGeneratedStep"
    | "completeSource"
    | "completeResult"
  >;
  display: Pick<DisplayState, "gridEvoLayers" | "showBlockMesh">;
}

/** Live getters prevent snapshots of the current document or UI state. */
export function createGridPreviewController(ctx: GridPreviewContext) {
  function runGridEvo(): void {
    try {
      ctx.generation.gridEvoStages = buildGridEvolution(
        { extentMeters: ctx.documents.documentState.frame.extentMeters, ...ctx.generation.gridEvoParams },
        makeRng(ctx.generation.gridEvoSeed)
      );
    } catch (error) {
      console.error(error);
      ctx.generation.gridEvoStages = null;
      ctx.showNotice(editorText("cityEditor.messages.gridEvolutionFailed"));
    }
    ctx.generation.gridEvoIndex = ctx.generation.gridEvoStages ? ctx.generation.gridEvoStages.length - 1 : 0;
    syncGridEvoUi();
    ctx.redrawMap();
  }

  function stepGridEvo(delta: number): void {
    if (!ctx.generation.gridEvoStages?.length) return;
    const last = ctx.generation.gridEvoStages.length - 1;
    ctx.generation.gridEvoIndex =
      delta === -Infinity ? 0 : delta === Infinity ? last : clamp(ctx.generation.gridEvoIndex + delta, 0, last);
    syncGridEvoUi();
    ctx.redrawMap();
  }

  function clearGridEvo(): void {
    if (!ctx.generation.gridEvoStages) return;
    ctx.generation.gridEvoStages = null;
    ctx.generation.gridEvoIndex = 0;
    syncGridEvoUi();
    ctx.redrawMap();
  }

  function syncGridEvoUi(): void {
    const stages = ctx.generation.gridEvoStages;
    const has = !!stages && stages.length > 0;
    for (const button of [
      ctx.gridEvoSlider,
      ctx.gridEvoFirstButton,
      ctx.gridEvoPrevButton,
      ctx.gridEvoNextButton,
      ctx.gridEvoLastButton,
      ctx.gridEvoAdoptButton
    ]) {
      button.disabled = !has;
    }
    if (!has || !stages) {
      ctx.gridEvoLabel.textContent = "";
      return;
    }
    ctx.generation.gridEvoIndex = clamp(ctx.generation.gridEvoIndex, 0, stages.length - 1);
    ctx.gridEvoSlider.max = String(stages.length - 1);
    ctx.gridEvoSlider.value = String(ctx.generation.gridEvoIndex);
    ctx.gridEvoLabel.textContent = `${ctx.generation.gridEvoIndex + 1} / ${stages.length} · ${stages[ctx.generation.gridEvoIndex].label}`;
  }

  function gridOverlayForRender(): GridOverlay | null {
    if (!ctx.generation.gridEvoStages?.length) return null;
    const stage =
      ctx.generation.gridEvoStages[clamp(ctx.generation.gridEvoIndex, 0, ctx.generation.gridEvoStages.length - 1)];
    return { stage, ...ctx.display.gridEvoLayers };
  }

  function adoptGridEvo(): void {
    const stages = ctx.generation.gridEvoStages;
    if (!stages?.length) return;
    const stage = stages[clamp(ctx.generation.gridEvoIndex, 0, stages.length - 1)];
    const mesh = meshFromCells(stage.cells);
    if (Object.keys(mesh.faces).length < 3) {
      ctx.showNotice(editorText("cityEditor.messages.thisStageHasTooFewCellsToUseAsA"));
      return;
    }
    const next: CityDocument = {
      ...ctx.documents.documentState,
      gridKind: "evolution",
      mesh,
      featureGroups: [],
      gates: [],
      elements: []
    };
    delete next.appearance;
    if (validate(next).length) {
      ctx.showNotice(editorText("cityEditor.messages.theRebuiltGridFailedValidation"));
      return;
    }
    clearGridEvo();
    ctx.documents.documentState = ctx.documents.history.commit(
      next,
      editorText("cityEditor.messages.rebuildGrid", { value0: stage.label })
    );
    ctx.documents.referenceImage = null;
    ctx.interaction.selection = emptySelection();
    ctx.interaction.activeGroupId = null;
    ctx.generation.activeStepStage = null;
    ctx.generation.stepIndex = -1;
    ctx.generation.urbanCoreHighlight = null;
    ctx.generation.stepOverlayPaths = null;
    ctx.stepStatus.textContent = "";
    ctx.generation.lastGeneratedStep = null;
    ctx.generation.completeSource = null;
    ctx.generation.completeResult = null;
    clearGenerationPreviewCache();
    ctx.display.showBlockMesh = false;
    ctx.rebuildEditorIndexes();
    ctx.refresh();
    ctx.showNotice(editorText("cityEditor.messages.gridRebuiltCells", { value0: Object.keys(mesh.faces).length }));
  }

  return { runGridEvo, stepGridEvo, clearGridEvo, syncGridEvoUi, gridOverlayForRender, adoptGridEvo };
}
