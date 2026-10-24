import { editorText } from "../../i18n/editorMessages";
import { describeImportedSite } from "../components/importedSite";
import { inheritBuildingAppearance, withBuildingAppearance } from "../generators/buildingAppearance";
import { DEFAULT_CASTLE_SETTINGS } from "../generators/castlePlacement";
import { sizePresetForExtent } from "../generators/document";
import { elevationReliefScale, presetAmplitude } from "../generators/elevationPreset";
import { createFabricPlan, resolveDistricts } from "../generators/fabricDistricts";
import { townCircuits } from "../generators/fortifications";
import { COMPLETE_CITY_ATTEMPTS, generateCityOnDocument } from "../generators/generation/generateCity";
import { clearGenerationPreviewCache, generateStageOnDocument } from "../generators/generation/previews";
import { randomSeed } from "../generators/generation/settings";
import { generateSkeletonPreview } from "../generators/generation/skeleton/previews";
import { generationPhaseLabel, logGenerationFailures } from "../generators/generationDiagnostics";
import { clone } from "../generators/mesh";
import { RIVER_DROP_MIN, riverDropMeters, riverDropUpperFor } from "../generators/riverSurface";
import { generateRuralFieldStage } from "../generators/ruralFieldStage";
import { WALL_COAST_CHOICES, WALL_MATERIAL_CHOICES } from "../generators/site/siteConfig";
import { DEFAULT_CASTLE_RISE_METERS } from "../generators/terrainEditing";
import { fieldModeAllowed } from "../generators/terrainField/constants";
import { startCityGeneration } from "../services/generationWorkerClient";
import type { DisplayState, DocumentsState, GenerationState, InteractionState } from "../state/editorSession";
import type { GenerationDebugPreview } from "../types/contracts/generationDebug";
import type { GenerationSample } from "../types/contracts/generationDiagnostics";
import type { WallMaterialChoice } from "../types/contracts/siteConfig";
import type { CastleSettings, CityDocument } from "../types/document";
import type { UiStepResult } from "../types/editor";
import type { GenerationStage } from "../types/generation";
import { generationStages } from "./generationStages";
import { buildableLandFaceIds, STEP_FNS } from "./generationSteps";
import { emptySelection } from "./tools/toolTypes";

export interface GenerationContext {
  root: HTMLElement;
  scope: import("../services/editorLifetime").EditorLifetime;
  rememberGenerationState: (seed?: string, stage?: number) => void;
  clearFailurePreview: () => void;
  generationLog: { reset: () => void; append: (sample: GenerationSample, seed: string) => void };
  generationProgress: HTMLOutputElement;
  failureDebugInput: HTMLInputElement;
  cancelGeneration: HTMLButtonElement;
  appendGenerationException: (error: unknown, seed: string) => void;
  size: HTMLSelectElement;
  showFailurePreview: (preview: GenerationDebugPreview, heading: string) => void;
  showNotice: (value: string, redraw?: boolean) => void;
  documentForOutput: (current: CityDocument) => CityDocument;
  stepStatus: HTMLOutputElement;
  syncStageUi: (step: number) => void;
  rebuildEditorIndexes: () => void;
  refresh: () => void;
  resetCity3dCamera?: () => void;
  wallFallbackNotice: (doc: CityDocument, checkpoint?: boolean) => string;
  redrawMap: () => void;
  seedInput: HTMLInputElement;
  syncSkeletonControls?: () => void;
  moatInputs: Map<"town" | "castle", HTMLInputElement>;
  castleInputs: Map<keyof CastleSettings, HTMLSelectElement | HTMLInputElement>;
  buildingPatternSelect: HTMLSelectElement;
  layoutSelect: HTMLSelectElement;
  coastSelect: HTMLSelectElement;
  seaWallSelect: HTMLSelectElement;
  wallMaterialSelect: HTMLSelectElement;
  riversSelect: HTMLSelectElement;
  riverPlacementSelect: HTMLSelectElement;
  reliefInput: HTMLInputElement;
  featureInputs: Map<"citadel" | "walls" | "port" | "plaza" | "temple" | "shanty", HTMLInputElement>;
  urbanCoreModeSelect: HTMLSelectElement;
  urbanNPatchesInput: HTMLInputElement;
  walledShareInput: HTMLInputElement;
  townWallRingsSelect: HTMLSelectElement;
  townWallRingsValue: () => "single" | "double" | "razed";
  townWallBuildOrderSelect: HTMLSelectElement;
  avoidSeaInput: HTMLInputElement;
  farNodeSelect: HTMLSelectElement;
  bearingsInput: HTMLInputElement;
  bearingsLabel: HTMLLabelElement;
  importedBox: HTMLDivElement;
  synthControls: HTMLDivElement;
  importedText: HTMLDivElement;
  documents: Pick<DocumentsState, "documentState" | "history" | "gridKind" | "referenceImage" | "importedOrigin">;
  interaction: Pick<InteractionState, "selection" | "activeGroupId" | "tool">;
  generation: Pick<
    GenerationState,
    | "completeSource"
    | "completeResult"
    | "lastGeneratedStep"
    | "generationHistory"
    | "generationJob"
    | "generateSeed"
    | "generationSamples"
    | "pendingFailurePreview"
    | "generateSettings"
    | "activeStepStage"
    | "stepIndex"
    | "urbanCoreHighlight"
    | "stepOverlayPaths"
    | "completeResultSettings"
    | "currentStageStep"
    | "acceptingResult"
  >;
  display: Pick<DisplayState, "showBlockMesh" | "hideBuildings" | "hideStreetLines" | "halfView" | "viewCenter">;
}

/** Live getters prevent snapshots of the current document or UI state. */
export function createGenerationController(ctx: GenerationContext) {
  function fitPopulationFrame(next: CityDocument) {
    if (
      (!next.populationPlan && ctx.generation.generateSettings.mode !== "fort") ||
      next.frame.extentMeters === ctx.documents.documentState.frame.extentMeters
    )
      return;
    ctx.display.halfView = next.frame.extentMeters / 2;
    ctx.display.viewCenter = [0, 0];
    ctx.size.value = sizePresetForExtent(next.frame.extentMeters);
  }
  function runCompleteGeneration(): void {
    if (!ctx.scope.active) return;
    const populationPanel = ctx.root.querySelector<HTMLElement>(".ce-population-controls");
    if (ctx.generation.generateSettings.mode !== "fort" && populationPanel?.dataset.valid === "false") {
      populationPanel.querySelector<HTMLInputElement>(".ce-population-input")?.reportValidity();
      return;
    }
    // Reuse the input grid for successive rolls, preventing accumulated shrink
    // from finishing an already finished town. A real edit becomes a new input.
    if (!ctx.generation.completeSource) {
      ctx.generation.completeSource = ctx.documents.documentState.fabric?.generation?.input
        ? clone(ctx.documents.documentState.fabric.generation.input)
        : clone(ctx.documents.documentState);
    } else if (
      ctx.documents.documentState !== ctx.generation.completeResult &&
      JSON.stringify(ctx.documents.documentState) !== JSON.stringify(ctx.generation.completeResult) &&
      ctx.generation.lastGeneratedStep === null &&
      !ctx.generation.generationHistory.has(ctx.documents.history.currentEntryKey)
    ) {
      ctx.generation.completeSource = clone(ctx.documents.documentState);
    }
    if (ctx.generation.generationJob) return;
    const source = {
      ...inheritBuildingAppearance(ctx.generation.completeSource, ctx.documents.documentState),
      ruralFieldSettings: ctx.documents.documentState.ruralFieldSettings
    };
    if (!ctx.generation.generationHistory.has(ctx.documents.history.currentEntryKey))
      ctx.rememberGenerationState(
        ctx.generation.generateSeed,
        ctx.generation.lastGeneratedStep ?? (ctx.documents.documentState.appearance === "town" ? 16 : 1)
      );
    ctx.clearFailurePreview();
    ctx.generation.generationSamples = [];
    ctx.generationLog.reset();
    ctx.generation.pendingFailurePreview = null;
    const onFailurePreview = (preview: GenerationDebugPreview) => {
      if (!ctx.scope.active) return;
      ctx.generation.pendingFailurePreview = preview;
    };
    const onProgress = (sample: GenerationSample) => {
      if (!ctx.scope.active) return;
      ctx.generation.generationSamples.push(sample);
      ctx.generationLog.append(
        sample,
        sample.failure?.details?.find(line => line.startsWith("seed="))?.slice(5) ??
          (sample.attempt === 1
            ? ctx.generation.generateSeed
            : `${ctx.generation.generateSeed}:junction-retry:${sample.attempt - 1}`)
      );
      if (sample.failure) {
        ctx.generationProgress.textContent = editorText("cityEditor.messages.candidateRejected", {
          value0: sample.attempt,
          value1: generationPhaseLabel(sample.phase),
          value2: sample.failure.message
        });
        return;
      }
      ctx.generationProgress.textContent = editorText("cityEditor.messages.generatingCandidate", {
        value0: sample.attempt,
        value1: ctx.failureDebugInput.checked ? 1 : COMPLETE_CITY_ATTEMPTS,
        value2: generationPhaseLabel(sample.phase)
      });
    };
    if (typeof Worker !== "undefined") {
      const input = ctx.documents.documentState;
      const before = JSON.stringify(input);
      ctx.generationProgress.textContent = editorText("cityEditor.messages.generatingCity");
      ctx.cancelGeneration.hidden = false;
      ctx.root.setAttribute("aria-busy", "true");
      try {
        const job = startCityGeneration(
          {
            document: source,
            settings: ctx.generation.generateSettings,
            seed: ctx.generation.generateSeed,
            debugFailure: ctx.failureDebugInput.checked
          },
          onProgress,
          undefined,
          onFailurePreview
        );
        ctx.generation.generationJob = job;
        void job.result
          .then(next => {
            if (
              !ctx.scope.active ||
              ctx.generation.generationJob !== job ||
              input !== ctx.documents.documentState ||
              before !== JSON.stringify(ctx.documents.documentState)
            )
              return;
            acceptCompleteGeneration(next);
          })
          .catch(error => {
            if (ctx.scope.active && ctx.generation.generationJob === job) {
              if (error instanceof Error && error.name === "AbortError")
                ctx.generationProgress.textContent = editorText("cityEditor.messages.generationCancelled");
              else {
                console.error(error);
                ctx.appendGenerationException(error, ctx.generation.generateSeed);
                ctx.generationProgress.textContent = editorText("cityEditor.messages.cityGenerationFailed");
              }
            }
          })
          .finally(() => {
            if (!ctx.scope.active || ctx.generation.generationJob !== job) return;
            ctx.generation.generationJob = null;
            ctx.cancelGeneration.hidden = true;
            ctx.root.removeAttribute("aria-busy");
          });
      } catch (error) {
        console.error(error);
        ctx.appendGenerationException(error, ctx.generation.generateSeed);
        ctx.cancelGeneration.hidden = true;
        ctx.root.removeAttribute("aria-busy");
        ctx.generationProgress.textContent = editorText("cityEditor.messages.couldNotStartCityGeneration");
      }
      return;
    }
    // Non-worker hosts (including jsdom) retain the synchronous API.
    try {
      acceptCompleteGeneration(
        generateCityOnDocument(
          clone(source),
          ctx.generation.generateSettings,
          ctx.generation.generateSeed,
          onProgress,
          ctx.failureDebugInput.checked ? onFailurePreview : undefined
        )
      );
    } catch (error) {
      console.error(error);
      ctx.appendGenerationException(error, ctx.generation.generateSeed);
      ctx.generationProgress.textContent = editorText("cityEditor.messages.cityGenerationFailed");
    }
  }

  function acceptCompleteGeneration(next: CityDocument | null): void {
    ctx.generation.acceptingResult = true;
    try {
      if (!ctx.scope.active) return;
      const roadIssues = next
        ? (ctx.generation.generationSamples.filter(sample => sample.phase === "road-connection-validation").at(-1)
            ?.roadConnectionIssues ?? [])
        : [];
      const roadWarning = roadIssues.length
        ? editorText("cityEditor.messages.fmgRoadConnectionsNeedAttention", {
            value0: roadIssues.map(issue => issue.routeId).join(", ")
          })
        : "";
      const fortressFailure = [...ctx.generation.generationSamples]
        .reverse()
        .find(sample => sample.failure?.reason?.startsWith("fortress-"))?.failure;
      ctx.generationProgress.textContent = next
        ? roadWarning || editorText("cityEditor.messages.generationComplete")
        : fortressFailure?.message || editorText("cityEditor.messages.cityGenerationFailed");
      ctx.root.dispatchEvent(
        new CustomEvent("city-generation-diagnostics", { detail: ctx.generation.generationSamples.slice() })
      );
      if (!next) {
        const source = ctx.generation.completeSource ?? ctx.documents.documentState;
        const context = {
          seed: ctx.generation.generateSeed,
          grid: source.gridKind ?? ctx.documents.gridKind,
          size: ctx.size.value,
          extentMeters: source.frame.extentMeters,
          cityRadiusMeters: source.frame.cityRadiusMeters,
          faces: Object.keys(source.mesh.faces).length
        };
        if (ctx.generation.generationSamples.some(sample => sample.failure))
          logGenerationFailures(ctx.generation.generationSamples, context);
        else {
          const message = editorText("cityEditor.messages.cityGenerationFailedNoRejectionReasonRecorded");
          console.error(`[City Editor] ${message}`, { ...context, samples: ctx.generation.generationSamples });
          ctx.appendGenerationException(message, ctx.generation.generateSeed);
        }
        if (ctx.failureDebugInput.checked && ctx.generation.pendingFailurePreview) {
          ctx.showFailurePreview(
            ctx.generation.pendingFailurePreview,
            editorText("cityEditor.messages.failedCandidateNoRetry", {
              value0: ctx.generation.pendingFailurePreview.sample.attempt
            })
          );
        }
        ctx.generation.pendingFailurePreview = null;
        ctx.showNotice(fortressFailure?.message || editorText("cityEditor.messages.cityGenerationFailed"));
        return;
      }
      ctx.generation.pendingFailurePreview = null;
      // Apply the latest housing choices if they changed while the worker was running.
      next = withBuildingAppearance(
        {
          ...next,
          buildingAppearanceProfile: ctx.documents.documentState.buildingAppearanceProfile,
          buildingAppearanceClimate: ctx.documents.documentState.buildingAppearanceClimate
        },
        ctx.documents.documentState.buildingAppearanceProfile,
        ctx.generation.generateSettings.descriptor
      );
      // Keep the requested seed. A town accepted on a retry keeps how it got there, so the
      // next roll of this seed and input (and a shared link) starts at that attempt instead
      // of re-running the rejected ones, and draws the same town.
      const retry = ctx.generation.generationSamples.find(sample => sample.phase === "accepted-attempt")?.retry;
      const { generationRetry: _previous, ...requested } = ctx.generation.generateSettings;
      ctx.generation.generateSettings = retry ? { ...requested, generationRetry: retry } : requested;
      if (next.fabric?.generation?.input) {
        ctx.generation.completeSource = clone(next.fabric.generation.input);
      }
      if (JSON.stringify(next) === JSON.stringify(ctx.documents.documentState)) {
        ctx.showNotice(editorText("cityEditor.messages.showingTheSameCity"));
        return;
      }
      fitPopulationFrame(next);
      ctx.documents.documentState = ctx.documents.history.commit(
        generateRuralFieldStage(ctx.documentForOutput(next)),
        editorText(
          ctx.generation.generateSettings.mode === "fort"
            ? "cityEditor.messages.generateFort"
            : "cityEditor.messages.generateCompleteCityCityEditorPage"
        )
      );
      if (next.gridKind) ctx.documents.gridKind = next.gridKind;
      ctx.generation.completeResult = ctx.documents.documentState;
      ctx.generation.lastGeneratedStep = null;
      ctx.generation.activeStepStage = null;
      ctx.generation.stepIndex = -1;
      ctx.stepStatus.textContent = "";
      ctx.generation.urbanCoreHighlight = null;
      ctx.generation.stepOverlayPaths = null;
      ctx.documents.referenceImage = null;
      ctx.interaction.selection = emptySelection();
      ctx.interaction.activeGroupId = null;
      ctx.interaction.tool = "select";
      ctx.display.showBlockMesh = false;
      ctx.display.hideBuildings = false;
      ctx.display.hideStreetLines = false;
      ctx.syncStageUi(generationStages(ctx.generation.generateSettings).find(s => s.id === "farmland")?.step ?? 17);
      ctx.generation.completeResultSettings = JSON.stringify(ctx.generation.generateSettings);
      ctx.rememberGenerationState();
      ctx.rebuildEditorIndexes();
      ctx.resetCity3dCamera?.();
      ctx.refresh();
      ctx.syncSkeletonControls?.();
      // Double walls fall back to one curtain when the mesh has no room for an old
      // town (docs/plan/ce-multi-ring-walls.md §5); say why instead of staying silent.
      const doubleFallback =
        ctx.generation.generateSettings.mode !== "fort" &&
        ctx.generation.generateSettings.townWallRings === "double" &&
        townCircuits(ctx.documents.documentState).length < 2
          ? ctx.wallFallbackNotice(ctx.documents.documentState)
          : "";
      ctx.showNotice(
        [
          roadWarning ||
            editorText(
              ctx.generation.generateSettings.mode === "fort"
                ? "cityEditor.messages.fortGenerated"
                : "cityEditor.messages.cityGeneratedWallsStreetsAndBuildings"
            ),
          doubleFallback
        ]
          .filter(Boolean)
          .join(" "),
        false
      );
    } finally {
      ctx.generation.acceptingResult = false;
    }
  }

  /** Finish the live edited mesh without rerunning any planning stages. */
  function generateFromEdits(): void {
    if (!ctx.scope.active || ctx.generation.generationJob) return;
    const source = clone(ctx.documents.documentState);
    const seed = source.generationSeed ?? ctx.generation.generateSeed;
    let next: CityDocument;
    try {
      source.appearance = "town";
      source.generationSeed = seed;
      source.buildingPattern ??= ctx.generation.generateSettings.buildingPattern;
      source.fabric = { ...createFabricPlan(source, seed), districts: resolveDistricts(source, source.fabric) };
      delete source.ruralFieldSnapshot;
      next = generateRuralFieldStage(ctx.documentForOutput(source), { preserveLandUse: true });
    } catch (error) {
      console.error(error);
      ctx.appendGenerationException(error, seed);
      ctx.showNotice(editorText("cityEditor.messages.cityGenerationFailed"));
      return;
    }
    if (!ctx.generation.generationHistory.has(ctx.documents.history.currentEntryKey)) ctx.rememberGenerationState();
    ctx.clearFailurePreview();
    ctx.generation.pendingFailurePreview = null;
    ctx.documents.documentState = ctx.documents.history.commit(
      next,
      editorText("cityEditor.messages.generateFromEdits")
    );
    ctx.generation.completeSource = clone(source);
    ctx.generation.completeResult = next;
    ctx.generation.completeResultSettings = JSON.stringify(ctx.generation.generateSettings);
    clearGenerationPreviewCache();
    const stage = generationStages(ctx.generation.generateSettings).find(s => s.id === "conceal")!;
    ctx.generation.lastGeneratedStep = stage.step;
    ctx.generation.currentStageStep = stage.step;
    ctx.generation.activeStepStage = null;
    ctx.generation.stepIndex = -1;
    ctx.generation.urbanCoreHighlight = null;
    ctx.generation.stepOverlayPaths = null;
    ctx.stepStatus.textContent = "";
    ctx.display.showBlockMesh = false;
    ctx.display.hideBuildings = false;
    ctx.display.hideStreetLines = true;
    ctx.interaction.selection = emptySelection();
    ctx.interaction.activeGroupId = null;
    ctx.interaction.tool = "select";
    ctx.syncStageUi(stage.step);
    ctx.rememberGenerationState(seed);
    ctx.rebuildEditorIndexes();
    ctx.refresh();
    ctx.showNotice(editorText("cityEditor.messages.generatedFromEdits"), false);
  }

  function runGenerationStage(stage: GenerationStage): void {
    const populationPanel = ctx.root.querySelector<HTMLElement>(".ce-population-controls");
    if (ctx.generation.generateSettings.mode !== "fort" && populationPanel?.dataset.valid === "false") {
      populationPanel.querySelector<HTMLInputElement>(".ce-population-input")?.reportValidity();
      return;
    }
    if (!ctx.generation.completeSource) {
      ctx.generation.completeSource = ctx.documents.documentState.fabric?.generation?.input
        ? clone(ctx.documents.documentState.fabric.generation.input)
        : clone(ctx.documents.documentState);
    }
    if (
      ctx.generation.completeResult &&
      ctx.generation.completeResultSettings !== JSON.stringify(ctx.generation.generateSettings)
    ) {
      ctx.generation.completeResult = null;
      clearGenerationPreviewCache();
    }
    if (!ctx.generation.generationHistory.has(ctx.documents.history.currentEntryKey))
      ctx.rememberGenerationState(
        undefined,
        ctx.generation.lastGeneratedStep ?? (ctx.documents.documentState.appearance === "town" ? 16 : 1)
      );
    const source = clone({
      ...inheritBuildingAppearance(ctx.generation.completeSource, ctx.documents.documentState),
      ruralFieldSettings: ctx.documents.documentState.ruralFieldSettings
    });
    const effectiveSeed =
      ctx.generation.completeResult?.generationSeed ??
      ctx.documents.documentState.generationSeed ??
      ctx.generation.generateSeed;

    ctx.clearFailurePreview();
    ctx.generation.pendingFailurePreview = null;
    ctx.generationLog.reset();
    let next: CityDocument | null = null;
    let skeletonOverlay: import("../types/document").Point[][] | null = null;
    try {
      const finished =
        ctx.generation.completeResult &&
        (!ctx.generation.completeResult.generationSeed ||
          ctx.generation.completeResult.generationSeed === effectiveSeed)
          ? ctx.generation.completeResult
          : null;
      if (stage.processStep < 0 && ctx.generation.generateSettings.generationMethod === "skeleton-first") {
        const preview = generateSkeletonPreview(
          source,
          ctx.generation.generateSettings,
          effectiveSeed,
          -stage.processStep,
          sample => ctx.generationLog.append(sample, effectiveSeed)
        );
        next = preview.document;
        skeletonOverlay = preview.overlayPaths;
      } else if (finished && ["blocks", "buildings", "farmland", "conceal"].includes(stage.id)) {
        next = clone(finished);
      } else if (finished && stage.id === "geometry") {
        const s7 = clone(finished);
        delete s7.appearance;
        delete s7.fabric;
        next = s7;
      } else {
        next = generateStageOnDocument(
          source,
          ctx.generation.generateSettings,
          effectiveSeed,
          stage.processStep,
          ctx.failureDebugInput.checked
            ? preview => {
                ctx.generation.pendingFailurePreview = preview;
              }
            : undefined,
          stage.wallCheckpoint,
          sample => {
            ctx.generationLog.append(
              sample,
              sample.failure?.details?.find(line => line.startsWith("seed="))?.slice(5) ??
                (sample.attempt === 1 ? effectiveSeed : `${effectiveSeed}:junction-retry:${sample.attempt - 1}`)
            );
            if (sample.failure) logGenerationFailures([sample], { seed: effectiveSeed });
          }
        );
      }
      if (next && ["farmland", "conceal"].includes(stage.id))
        next = generateRuralFieldStage(
          ctx.documentForOutput({ ...next, ruralFieldSettings: ctx.documents.documentState.ruralFieldSettings })
        );
    } catch (error) {
      console.error(error);
      ctx.appendGenerationException(error, effectiveSeed);
      next = null;
    }
    if (!next) {
      if (stage.id !== "urban") {
        ctx.generation.urbanCoreHighlight = null;
        ctx.generation.stepOverlayPaths = null;
        ctx.redrawMap();
      }
      if (ctx.failureDebugInput.checked && ctx.generation.pendingFailurePreview)
        ctx.showFailurePreview(
          ctx.generation.pendingFailurePreview,
          editorText("cityEditor.messages.failedStage", { value0: stage.label })
        );
      ctx.generation.pendingFailurePreview = null;
      ctx.showNotice(editorText("cityEditor.messages.generationFailedAt", { value0: stage.label }));
      return;
    }
    ctx.generation.pendingFailurePreview = null;
    // Double walls fall back to one curtain when the town has no room for an
    // old town (docs/plan/ce-multi-ring-walls.md §5); say so rather than silently.
    const innerCheckpoint = stage.wallCheckpoint === "innerWall" || stage.wallCheckpoint === "firstInnerGates";
    const wallFallback =
      innerCheckpoint && next.townWallGeneration?.fallbackReason
        ? ctx.wallFallbackNotice(next, true)
        : ctx.generation.generateSettings.townWallRings === "double" &&
            next.appearance === "town" &&
            townCircuits(next).length < 2
          ? ctx.wallFallbackNotice(next)
          : "";
    if (["farmland", "conceal"].includes(stage.id)) {
      ctx.generation.completeResult = next;
      ctx.generation.completeResultSettings = JSON.stringify(ctx.generation.generateSettings);
    } else {
      delete next.ruralFieldSnapshot;
    }
    if (["buildings", "conceal"].includes(stage.id) && !ctx.generation.completeResult) {
      ctx.generation.completeResult = next;
      ctx.generation.completeResultSettings = JSON.stringify(ctx.generation.generateSettings);
    }
    ctx.generation.lastGeneratedStep = stage.step;
    ctx.generation.currentStageStep = stage.step;
    // This stage becomes the ◀/▶ scrub's target, reset to "not stepped yet".
    ctx.generation.activeStepStage = stage.id;
    ctx.syncStageUi(stage.step);
    ctx.generation.stepIndex = -1;
    ctx.stepStatus.textContent = "";
    // ③ itself keeps showing the debug tint on its finished core (nothing else
    // marks `buildable` on the document); every other stage already has its
    // own visual cue (river / walls+gates / roads / ward colours) and needs none.
    ctx.generation.urbanCoreHighlight =
      stage.id === "urban" ? buildableLandFaceIds(next, ctx.generation.generateSettings.urbanCoreMode) : null;
    ctx.generation.stepOverlayPaths = skeletonOverlay;
    ctx.display.hideBuildings = stage.id === "blocks";
    ctx.display.hideStreetLines = stage.id === "conceal";
    // Re-pressing the same stage on the same town is a no-op: keep the history
    // (and the undo timeline) clean.
    if (JSON.stringify(next) === JSON.stringify(ctx.documents.documentState)) {
      ctx.rememberGenerationState(next.generationSeed ?? effectiveSeed);
      ctx.showNotice(wallFallback || editorText("cityEditor.messages.alreadyAt", { value0: stage.label }));
      ctx.redrawMap();
      return;
    }
    fitPopulationFrame(next);
    ctx.documents.documentState = ctx.documents.history.commit(
      next,
      editorText("cityEditor.messages.generateCityEditorPage", { value0: stage.label })
    );
    if (ctx.generation.completeResult === next)
      ctx.generation.completeResultSettings = JSON.stringify(ctx.generation.generateSettings);
    ctx.rememberGenerationState(next.generationSeed ?? effectiveSeed);
    ctx.documents.referenceImage = null;
    ctx.interaction.selection = emptySelection();
    ctx.interaction.activeGroupId = null;
    ctx.rebuildEditorIndexes();
    ctx.showNotice(wallFallback || editorText("cityEditor.messages.generatedUpTo", { value0: stage.label }));
  }

  function runStep(delta: number): void {
    if (!ctx.generation.activeStepStage) {
      ctx.showNotice(editorText("cityEditor.messages.pressAStageButtonFirst"));
      return;
    }
    const stage = ctx.generation.activeStepStage;
    const label = generationStages(ctx.generation.generateSettings).find(s => s.id === stage)?.label ?? "";
    const effectiveSeed =
      ctx.generation.completeResult?.generationSeed ??
      ctx.documents.documentState.generationSeed ??
      ctx.generation.generateSeed;
    // Ward scrubbing is read-only and clones its output. Keep its weak cache
    // owned by the page's stable generation source rather than a temporary copy.
    const source =
      stage === "wards"
        ? (ctx.generation.completeSource ?? ctx.documents.documentState)
        : clone(ctx.generation.completeSource ?? ctx.documents.documentState);
    if (["farmland", "conceal"].includes(stage))
      source.ruralFieldSettings = ctx.documents.documentState.ruralFieldSettings;
    let result: UiStepResult;
    try {
      result = STEP_FNS[stage](
        source,
        ctx.generation.generateSettings,
        effectiveSeed,
        ctx.generation.stepIndex + delta
      );
    } catch (error) {
      console.error(error);
      ctx.showNotice(editorText("cityEditor.messages.stepFailed"));
      return;
    }
    if (!result.document || result.total === 0) {
      ctx.showNotice(editorText("cityEditor.messages.nothingToStepThroughFor", { value0: label }));
      return;
    }
    result.document = inheritBuildingAppearance(result.document, ctx.documents.documentState);
    ctx.generation.stepIndex = result.index;
    ctx.generation.lastGeneratedStep =
      generationStages(ctx.generation.generateSettings).find(s => s.id === stage)?.step ??
      ctx.generation.lastGeneratedStep;
    ctx.generation.urbanCoreHighlight = result.highlightFaces ?? null;
    ctx.generation.stepOverlayPaths = result.overlayPaths ?? null;
    ctx.stepStatus.textContent = `${label}: ${result.detail ?? ""}`;
    // Stepping past either end re-shows the same document: keep the history clean.
    if (JSON.stringify(result.document) === JSON.stringify(ctx.documents.documentState)) {
      ctx.showNotice(
        editorText("cityEditor.messages.alreadyAtStep", { value0: result.index + 1, value1: result.total })
      );
      return;
    }
    ctx.documents.documentState = ctx.documents.history.commit(
      result.document,
      editorText("cityEditor.messages.processIterationProgress", {
        value0: label,
        value1: result.index + 1,
        value2: result.total
      })
    );
    ctx.rememberGenerationState(effectiveSeed);
    ctx.documents.referenceImage = null;
    ctx.interaction.selection = emptySelection();
    ctx.interaction.activeGroupId = null;
    ctx.rebuildEditorIndexes();
    ctx.refresh(); // rebuildEditorIndexes() only rebuilds lookup tables — this repaints the SVG.
  }

  function rollNewTown(): void {
    ctx.generation.generateSeed = randomSeed();
    syncGenerateControls();
    ctx.generation.stepIndex = -1;
    ctx.generation.stepOverlayPaths = null;
    ctx.stepStatus.textContent = "";
    ctx.generation.lastGeneratedStep = null;
    ctx.generation.currentStageStep =
      generationStages(ctx.generation.generateSettings).find(s => s.id === "farmland")?.step ?? 17;
    ctx.syncStageUi(ctx.generation.currentStageStep);
    runCompleteGeneration();
  }

  function rerunLastStage(): void {
    if (ctx.documents.documentState.appearance === "town") {
      runCompleteGeneration();
      return;
    }
    if (ctx.generation.lastGeneratedStep === null) return;
    const stage = generationStages(ctx.generation.generateSettings).find(
      s => s.step === ctx.generation.lastGeneratedStep
    );
    if (stage) runGenerationStage(stage);
  }

  function syncGenerateControls(): void {
    const fort = ctx.generation.generateSettings.mode === "fort";
    const modeSelect = ctx.root.querySelector<HTMLSelectElement>(".ce-generation-mode");
    if (modeSelect) modeSelect.value = fort ? "fort" : "city";
    for (const selector of [".ce-city-generation-controls", ".ce-city-decoration"])
      ctx.root.querySelector<HTMLElement>(selector)?.toggleAttribute("hidden", fort);
    const complete = ctx.root.querySelector<HTMLElement>(".ce-complete-generation");
    if (complete)
      complete.textContent = editorText(
        fort ? "cityEditor.messages.generateFort" : "cityEditor.messages.generateCompleteCity"
      );
    const roll = ctx.root.querySelector<HTMLElement>(".ce-new-generation");
    if (roll) roll.textContent = editorText(fort ? "cityEditor.messages.newFort" : "cityEditor.messages.newCity");
    ctx.seedInput.value = ctx.generation.generateSeed;
    for (const [scope, input] of ctx.moatInputs) input.checked = !!ctx.generation.generateSettings.moats?.[scope];
    for (const [key, input] of ctx.castleInputs)
      input.value = String(
        ctx.generation.generateSettings.castle?.[key] ??
          DEFAULT_CASTLE_SETTINGS[key] ??
          (key === "groundRiseMeters" ? DEFAULT_CASTLE_RISE_METERS : "auto")
      );
    ctx.buildingPatternSelect.value = ctx.generation.generateSettings.buildingPattern ?? "legacy";
    ctx.layoutSelect.value =
      ctx.generation.generateSettings.layout ?? ctx.generation.generateSettings.config.layout ?? "auto";
    ctx.coastSelect.value = ctx.generation.generateSettings.config.coast;
    if (!ctx.generation.generateSettings.config.wall) {
      ctx.generation.generateSettings.config.wall = { envelope: "auto", coast: "auto", line: "auto", material: "auto" };
    }
    ctx.seaWallSelect.value = WALL_COAST_CHOICES.includes(ctx.generation.generateSettings.config.wall.coast)
      ? ctx.generation.generateSettings.config.wall.coast
      : "auto";
    ctx.wallMaterialSelect.value = WALL_MATERIAL_CHOICES.includes(
      ctx.generation.generateSettings.config.wall.material as WallMaterialChoice
    )
      ? (ctx.generation.generateSettings.config.wall.material as WallMaterialChoice)
      : "auto";
    ctx.riversSelect.value = String(Math.min(2, ctx.generation.generateSettings.config.rivers.length));
    ctx.riverPlacementSelect.value = ctx.generation.generateSettings.riverPlacement ?? "through";
    ctx.reliefInput.checked = ctx.generation.generateSettings.config.relief;
    const elevationPreset = ctx.root.querySelector<HTMLSelectElement>(".ce-elevation-preset");
    if (elevationPreset) elevationPreset.value = ctx.generation.generateSettings.elevationPreset ?? "flat";
    const elevationRelief = ctx.root.querySelector<HTMLInputElement>(".ce-elevation-relief");
    const elevationReliefValue = ctx.root.querySelector<HTMLElement>(".ce-elevation-relief-value");
    const updateElevationRelief = ctx.root.querySelector<HTMLButtonElement>(".ce-update-elevation-relief");
    const reliefScale = elevationReliefScale(ctx.generation.generateSettings.elevationRelief);
    if (elevationRelief) elevationRelief.value = String(reliefScale);
    if (elevationReliefValue) {
      elevationReliefValue.textContent = editorText("cityEditor.messages.elevationReliefValue", {
        value0: reliefScale.toFixed(1),
        value1: String(presetAmplitude(ctx.documents.documentState.frame.extentMeters, reliefScale))
      });
    }
    if (updateElevationRelief)
      updateElevationRelief.disabled = (ctx.generation.generateSettings.elevationPreset ?? "flat") === "flat";
    const riverDrop = ctx.root.querySelector<HTMLInputElement>(".ce-river-drop");
    const riverDropValue = ctx.root.querySelector<HTMLElement>(".ce-river-drop-value");
    if (riverDrop) {
      const planned =
        (ctx.generation.generateSettings.elevationPreset ?? "flat") === "flat"
          ? 0
          : 2 +
            presetAmplitude(
              ctx.documents.documentState.frame.extentMeters,
              ctx.generation.generateSettings.elevationRelief
            );
      const max = riverDropUpperFor(ctx.documents.documentState, planned);
      const drop = Math.min(max, riverDropMeters(ctx.generation.generateSettings.riverDropMeters));
      riverDrop.max = String(max);
      riverDrop.value = String(drop);
      if (drop === RIVER_DROP_MIN) delete ctx.generation.generateSettings.riverDropMeters;
      else ctx.generation.generateSettings.riverDropMeters = drop;
      if (riverDropValue)
        riverDropValue.textContent = editorText("cityEditor.messages.riverDropValue", { value0: String(drop) });
    }
    const terrainField = ctx.root.querySelector<HTMLSelectElement>(".ce-terrain-field");
    if (terrainField) {
      const allowed = fieldModeAllowed(ctx.documents.documentState.frame.extentMeters);
      terrainField.disabled = !allowed;
      const template = ctx.generation.generateSettings.terrainField?.template ?? "off";
      terrainField.value = allowed ? template : "off";
      if (!allowed) delete ctx.generation.generateSettings.terrainField;
    }
    for (const [key, input] of ctx.featureInputs) input.checked = ctx.generation.generateSettings.config.features[key];
    ctx.urbanCoreModeSelect.value = ctx.generation.generateSettings.urbanCoreMode ?? "legacy";
    ctx.urbanNPatchesInput.value =
      ctx.generation.generateSettings.urbanNPatches != null
        ? String(ctx.generation.generateSettings.urbanNPatches)
        : "";
    ctx.walledShareInput.value =
      ctx.generation.generateSettings.walledAreaShare === undefined
        ? ""
        : String(ctx.generation.generateSettings.walledAreaShare * 100);
    ctx.townWallRingsSelect.value = ctx.townWallRingsValue();
    ctx.townWallBuildOrderSelect.value = ctx.generation.generateSettings.townWallBuildOrder ?? "outer-first";
    ctx.townWallBuildOrderSelect.disabled = ctx.townWallRingsValue() === "single";
    if (!ctx.generation.generateSettings.streets) {
      ctx.generation.generateSettings.streets = { farNode: "descriptorEnd", avoidSea: true, foldSmoothing: true };
    }
    ctx.avoidSeaInput.checked = ctx.generation.generateSettings.streets.avoidSea !== false;
    ctx.farNodeSelect.value = ctx.generation.generateSettings.streets.farNode ?? "descriptorEnd";
    ctx.bearingsInput.value =
      ctx.generation.generateSettings.streets.manualBearings?.map(n => String(n)).join(", ") ?? "";
    ctx.bearingsLabel.style.display = ctx.farNodeSelect.value === "manualBearings" ? "" : "none";
    ctx.syncSkeletonControls?.();
    const imported = ctx.generation.generateSettings.descriptor != null;
    ctx.importedBox.hidden = !imported;
    ctx.synthControls.hidden = imported;
    if (imported && ctx.generation.generateSettings.descriptor) {
      ctx.scope.replaceChildren(
        ctx.importedText,
        ...describeImportedSite(ctx.generation.generateSettings.descriptor, ctx.documents.importedOrigin)
      );
    }
  }

  return {
    runCompleteGeneration,
    generateFromEdits,
    acceptCompleteGeneration,
    runGenerationStage,
    runStep,
    rollNewTown,
    rerunLastStage,
    syncGenerateControls
  };
}
