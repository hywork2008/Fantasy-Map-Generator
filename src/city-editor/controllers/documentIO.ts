import { editorText } from "../../i18n/editorMessages";
import { buildBlockFabric } from "../generators/blockInfill";
import {
  type CitySizePreset,
  createGridDocument,
  descriptorFrameGridOptions,
  resolveMaxPatches,
  seaPortShoreDistanceMeters
} from "../generators/document";
import { clearGenerationPreviewCache } from "../generators/generation/previews";
import { defaultGenerationSettings } from "../generators/generation/settings";
import { DEFAULT_HEX_SIZE_METERS } from "../generators/hexGrid";
import { DocumentHistory } from "../generators/history";
import { buildLandmarkLaneNetwork, repairLandmarkLaneTargets } from "../generators/landmarkLaneNetwork";
import { clone } from "../generators/mesh";
import { readMaxPatchesPreference } from "../services/browserPreferences";
import { type ImportedCityMap, readCityMap } from "../services/io/cityEditorFile";
import {
  buildShare,
  type CityEditorShare,
  cityLinkFor,
  encodeShare,
  forgetIncomingCity
} from "../services/io/incomingCity";
import { cityEditorDocument } from "../services/io/shareRequest";
import type { DisplayState, DocumentsState, GenerationState, InteractionState } from "../state/editorSession";
import type { FixedApproachProvider } from "../types/contracts/fixedApproachAdoption";
import type { GenerationSample } from "../types/contracts/generationDiagnostics";
import type { IncomingOrigin } from "../types/contracts/incomingCity";
import type { Id } from "../types/document";
import type { GenerationStage } from "../types/generation";
import { formatDistance } from "../utils/editorUnits";
import { generationStages } from "./generationStages";
import { emptySelection } from "./tools/toolTypes";

export interface DocumentIOContext {
  fixedApproachProvider: FixedApproachProvider;
  scope: import("../services/editorLifetime").EditorLifetime;
  showNotice: (value: string, redraw?: boolean) => void;
  generationLog: { reset: () => void; append: (sample: GenerationSample, seed: string) => void };
  rebuildEditorIndexes: () => void;
  stepStatus: HTMLOutputElement;
  syncGenerateControls: () => void;
  clearGridEvo: () => void;
  size: HTMLSelectElement;
  syncGridParamControls: () => void;
  gridKindSelect: HTMLSelectElement;
  hexSizeInput: HTMLInputElement;
  hexSizeValue: HTMLSpanElement;
  syncGridKindUi: () => void;
  failureDebugInput: HTMLInputElement;
  runCompleteGeneration: () => void;
  runGenerationStage: (stage: GenerationStage) => void;
  syncStageUi: (step: number) => void;
  documents: Pick<
    DocumentsState,
    | "referenceImage"
    | "documentState"
    | "history"
    | "importedOrigin"
    | "gridKind"
    | "hexSizeMeters"
    | "gridSeed"
    | "measureTownCells"
  >;
  interaction: Pick<InteractionState, "selection" | "activeGroupId">;
  generation: Pick<
    GenerationState,
    | "currentStageStep"
    | "generateSettings"
    | "activeStepStage"
    | "stepIndex"
    | "urbanCoreHighlight"
    | "stepOverlayPaths"
    | "lastGeneratedStep"
    | "completeSource"
    | "completeResult"
    | "generateSeed"
    | "completeResultSettings"
    | "gridEvoParams"
  >;
  display: Pick<DisplayState, "showBlockMesh" | "halfView" | "viewCenter">;
}

/** Live getters prevent snapshots of the current document or UI state. */
export function createDocumentIOController(ctx: DocumentIOContext) {
  async function importMapFile(file: File | undefined): Promise<void> {
    const current = ctx.scope.ticket("import");
    const parsed = await readCityMap(file, ctx.fixedApproachProvider);
    if (current()) applyImportedMap(parsed);
  }

  function applyImportedMap(parsed: ImportedCityMap | null): void {
    if (!ctx.scope.active) return;
    if (!parsed) {
      ctx.showNotice(editorText("cityEditor.messages.importFailedSelectACityEditorMFCGJSONOrSVG"));
      return;
    }
    // Lift the (possibly multi-MB) backdrop out of the edited document before it
    // seeds the history, then keep it only in the closure for render + export.
    ctx.documents.referenceImage = parsed.document.referenceImage ?? null;
    delete parsed.document.referenceImage;
    let unresolvedLandmarks: Id[] = [];
    if (parsed.document.landmarks?.some(instance => instance.accesses.some(access => access.target.kind === "lane"))) {
      const fabric = buildBlockFabric(parsed.document);
      const repaired = repairLandmarkLaneTargets(
        parsed.document,
        buildLandmarkLaneNetwork(parsed.document, fabric.lanes)
      );
      parsed.document = repaired.document;
      unresolvedLandmarks = repaired.unresolved;
    }
    clearGenerationPreviewCache();
    ctx.documents.documentState = parsed.document;
    ctx.generation.generateSettings.buildingHeightPolicy = parsed.document.buildingHeightPolicy;
    ctx.generation.generateSettings.buildingHeightLimit = parsed.document.buildingHeightLimit;
    ctx.generation.generateSettings.forestSettings = parsed.document.forestSettings;
    ctx.generation.generateSettings.housingAreaScale =
      parsed.document.fabric?.generation?.settings.housingAreaScale ?? parsed.document.housingAreaScale;
    ctx.generation.generateSettings.housingAreaPasses =
      parsed.document.fabric?.generation?.settings.housingAreaPasses ?? parsed.document.housingAreaPasses;
    ctx.generation.generateSettings.buildingPattern =
      ctx.documents.documentState.buildingPattern ??
      (ctx.documents.documentState.fabric?.version === 5 ? "medieval" : "legacy");
    ctx.documents.history = new DocumentHistory(
      parsed.document,
      editorText("cityEditor.messages.importedMap"),
      undefined,
      ctx.fixedApproachProvider
    );
    ctx.generationLog.reset();
    if (unresolvedLandmarks.length)
      ctx.showNotice(
        editorText("cityEditor.messages.landmarkLaneAccessEsNeedReview", { value0: unresolvedLandmarks.length })
      );
    ctx.rebuildEditorIndexes();
    ctx.interaction.selection = emptySelection();
    ctx.interaction.activeGroupId = null;
    ctx.generation.activeStepStage = null;
    ctx.generation.stepIndex = -1;
    ctx.generation.urbanCoreHighlight = null;
    ctx.generation.stepOverlayPaths = null;
    ctx.stepStatus.textContent = "";
    ctx.generation.lastGeneratedStep = null;
    const recipe = ctx.documents.documentState.fabric?.generation;
    ctx.generation.completeSource = recipe ? clone(recipe.input) : null;
    ctx.generation.completeResult = recipe ? ctx.documents.documentState : null;
    if (recipe) {
      ctx.generation.generateSeed = recipe.seed;
      Object.assign(
        ctx.generation.generateSettings,
        {
          mode: undefined,
          population: undefined,
          housingAreaScale: undefined,
          housingAreaPasses: undefined,
          generationMethod: undefined,
          wallShape: undefined,
          wallSides: undefined,
          walledAreaShare: undefined,
          townWallRings: undefined,
          innerWallState: undefined,
          townWallBuildOrder: undefined,
          urbanCoreMode: undefined,
          descriptor: undefined,
          castle: undefined,
          moats: undefined,
          buildingPattern: "legacy",
          buildingHeightPolicy: undefined,
          buildingHeightLimit: undefined,
          forestSettings: undefined
        },
        clone(recipe.settings)
      );
      ctx.generation.generateSettings.legacyCastles = recipe.algorithm === "evolution-city-v3";
      ctx.generation.completeResultSettings = JSON.stringify(ctx.generation.generateSettings);
      ctx.documents.importedOrigin = ctx.generation.generateSettings.descriptor
        ? (ctx.documents.importedOrigin ?? "link")
        : null;
      ctx.syncGenerateControls();
    } else {
      delete ctx.generation.generateSettings.mode;
      delete ctx.generation.generateSettings.population;
      delete ctx.generation.generateSettings.descriptor;
      ctx.generation.generateSettings.castle = {
        ...ctx.generation.generateSettings.castle,
        style: parsed.document.castleStyle ?? "auto"
      };
      ctx.documents.importedOrigin = null;
      ctx.syncGenerateControls();
    }
    ctx.display.showBlockMesh = false;
    ctx.clearGridEvo();
    ctx.generation.generateSettings.moats = {
      town: ctx.documents.documentState.defenseCircuits?.some(c => c.scope === "town" && c.moat?.enabled) ?? false,
      castle: ctx.documents.documentState.defenseCircuits?.some(c => c.scope === "castle" && c.moat?.enabled) ?? false
    };
    ctx.syncGenerateControls();
    ctx.display.halfView = parsed.document.frame.extentMeters / 2;
    ctx.display.viewCenter = [0, 0];
    ctx.showNotice(
      parsed.source === "mfcg-svg"
        ? editorText("cityEditor.messages.sVGImportedAsAReferenceImage")
        : parsed.source === "mfcg-json"
          ? editorText("cityEditor.messages.mFCGMapImported")
          : editorText("cityEditor.messages.mapImported")
    );
  }

  function currentShare(): CityEditorShare {
    const source =
      ctx.generation.completeSource ??
      ctx.documents.documentState.fabric?.generation?.input ??
      ctx.documents.documentState;
    const { fabric: _fabric, ...input } = source as import("../types/document").CityDocument;
    const stage = generationStages(ctx.generation.generateSettings).find(
      s => s.step === ctx.generation.currentStageStep
    );
    return buildShare({
      input,
      debugFailure: ctx.failureDebugInput.checked,
      stage: stage && !["buildings"].includes(stage.id) ? stage.id : undefined,
      seed: ctx.generation.generateSeed,
      grid: ctx.documents.gridKind,
      size: ctx.size.value as CitySizePreset,
      hexSizeMeters: ctx.documents.gridKind === "hex" ? ctx.documents.hexSizeMeters : undefined,
      gridSeed: ctx.documents.gridSeed,
      patchParams: ctx.documents.gridKind === "evolution" ? { ...ctx.generation.gridEvoParams } : undefined,
      measureBlockSize: ctx.documents.measureTownCells,
      settings: {
        ...ctx.generation.generateSettings,
        historicalPeriod:
          ctx.generation.generateSettings.historicalPeriod ?? ctx.documents.documentState.historicalPeriod
      },
      descriptor: ctx.generation.generateSettings.descriptor
    });
  }

  async function copyShareLink(button: HTMLButtonElement): Promise<void> {
    const share = currentShare();
    const url = cityLinkFor(share);
    const current = ctx.scope.ticket("clipboard");
    try {
      await navigator.clipboard.writeText(url);
      if (!current()) return;
      window.history.replaceState(null, "", `${location.pathname}${location.search}#${encodeShare(share)}`);
      const label = button.textContent;
      button.textContent = editorText("cityEditor.messages.linkCopied");
      ctx.scope.timeout(() => {
        if (button.textContent === editorText("cityEditor.messages.linkCopied")) button.textContent = label;
      }, 1400);
      // Copying is a UI-only operation; preserve the current SVG and selection.
      ctx.showNotice(editorText("cityEditor.messages.shareableLinkCopied"), false);
    } catch {
      if (!current()) return;
      ctx.showNotice(editorText("cityEditor.messages.copyFailed"), false);
    }
  }

  // biome-ignore lint/correctness/noComponentHookFactories: This is a document action, not a React hook.
  function useStandaloneSite(): void {
    delete ctx.generation.generateSettings.descriptor;
    ctx.documents.importedOrigin = null;
    ctx.documents.measureTownCells = false;
    forgetIncomingCity();
    ctx.syncGenerateControls();
    ctx.showNotice(editorText("cityEditor.messages.standaloneSiteGeographyControlsUnlocked"));
  }

  function applyShare(share: CityEditorShare, origin: IncomingOrigin): void {
    ctx.generation.generateSeed = share.seed;
    ctx.failureDebugInput.checked = share.debugFailure === true;
    ctx.documents.gridSeed = share.gridSeed ?? share.seed;
    ctx.documents.gridKind = share.grid;
    ctx.documents.hexSizeMeters = share.hexSizeMeters ?? DEFAULT_HEX_SIZE_METERS;
    if (share.patchParams) Object.assign(ctx.generation.gridEvoParams, share.patchParams);
    // The ceiling is a viewer preference, but never below the shared count.
    ctx.generation.gridEvoParams.maxPatches = Math.max(
      readMaxPatchesPreference(),
      resolveMaxPatches(ctx.generation.gridEvoParams.nPatches)
    );
    ctx.syncGridParamControls();
    ctx.documents.measureTownCells = share.measureBlockSize === true;
    ctx.size.value = share.size;
    ctx.gridKindSelect.value = ctx.documents.gridKind;
    ctx.hexSizeInput.value = String(ctx.documents.hexSizeMeters);
    ctx.hexSizeValue.textContent = formatDistance(ctx.documents.hexSizeMeters);
    ctx.syncGridKindUi();
    Object.assign(
      ctx.generation.generateSettings,
      defaultGenerationSettings(),
      {
        buildingPattern: "legacy",
        buildingHeightPolicy: undefined,
        buildingHeightLimit: undefined,
        forestSettings: undefined,
        mode: undefined,
        population: undefined,
        housingAreaScale: undefined,
        housingAreaPasses: undefined,
        generationMethod: undefined,
        wallShape: undefined,
        wallSides: undefined,
        townWallRings: undefined,
        innerWallState: undefined,
        townWallBuildOrder: undefined
      },
      structuredClone(share.settings)
    );
    ctx.generation.generateSettings.descriptor = share.descriptor;
    ctx.documents.importedOrigin = share.descriptor ? origin : null;
    ctx.documents.documentState =
      share.input || (share.settings.population && !share.descriptor)
        ? cityEditorDocument(share)
        : createGridDocument({
            size: share.size,
            grid: share.grid,
            seed: ctx.documents.gridSeed,
            hexSizeMeters: ctx.documents.hexSizeMeters,
            patchParams: { ...ctx.generation.gridEvoParams },
            ...(share.descriptor
              ? descriptorFrameGridOptions(
                  share.descriptor.frame,
                  share.descriptor.burg.waterAccess?.port.river === true,
                  share.descriptor.burg.riverPlacement?.bankDistanceMeters,
                  seaPortShoreDistanceMeters(share.descriptor)
                )
              : {}),
            measureBlockSize: ctx.documents.measureTownCells,
            biome: share.descriptor?.biome
          });
    if (share.descriptor && !share.input) ctx.documents.documentState.showElevationTint = false;
    ctx.documents.history = new DocumentHistory(
      ctx.documents.documentState,
      share.descriptor ? editorText("cityEditor.messages.importedSite") : editorText("cityEditor.messages.sharedCity"),
      undefined,
      ctx.fixedApproachProvider
    );
    ctx.generationLog.reset();
    ctx.documents.referenceImage = null;
    ctx.interaction.selection = emptySelection();
    ctx.interaction.activeGroupId = null;
    ctx.generation.completeSource = clone(ctx.documents.documentState);
    ctx.generation.completeResult = null;
    clearGenerationPreviewCache();
    ctx.display.halfView = ctx.documents.documentState.frame.extentMeters / 2;
    ctx.display.viewCenter = [0, 0];
    ctx.generation.activeStepStage = null;
    ctx.generation.stepIndex = -1;
    ctx.generation.urbanCoreHighlight = null;
    ctx.generation.stepOverlayPaths = null;
    ctx.stepStatus.textContent = "";
    ctx.generation.lastGeneratedStep = null;
    ctx.display.showBlockMesh = false;
    ctx.clearGridEvo();
    ctx.syncGenerateControls();
    ctx.rebuildEditorIndexes();
    const stage = share.stage && generationStages(ctx.generation.generateSettings).find(s => s.id === share.stage);
    if (stage) {
      ctx.syncStageUi(stage.step);
      ctx.runGenerationStage(stage);
    } else ctx.runCompleteGeneration();
  }

  function importedFrame() {
    const descriptor = ctx.generation.generateSettings.descriptor;
    return descriptor
      ? descriptorFrameGridOptions(
          descriptor.frame,
          descriptor.burg.waterAccess?.port.river === true,
          descriptor.burg.riverPlacement?.bankDistanceMeters,
          seaPortShoreDistanceMeters(descriptor)
        )
      : {};
  }

  return { importMapFile, applyImportedMap, currentShare, copyShareLink, useStandaloneSite, applyShare, importedFrame };
}
