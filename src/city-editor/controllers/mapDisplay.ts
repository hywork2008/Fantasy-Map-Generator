import { editorText } from "../../i18n/editorMessages";
import { historicLandmarkPrototypes } from "../assets/catalog";
import { buildBlockFabric, documentFabricFingerprint } from "../generators/blockInfill";
import { buildLandmarkLaneNetwork } from "../generators/landmarkLaneNetwork";
import { placeLandmark, transformLandmarkPolygons } from "../generators/landmarks";
import { facePoints, validate } from "../generators/mesh";
import { ruralFieldOverlay, storeRuralFieldOverlay } from "../generators/ruralFieldOverlay";
import { defaultWalledAreaShare } from "../generators/settlementExtent";
import { renderApproachLabels } from "../renderers/approachLabelSvg";
import { syncCellReliefFace } from "../renderers/cellElevationSvg";
import { type RenderQuality, renderEditorSvg } from "../renderers/editorSvg";
import { renderGenerationDebugSvg } from "../renderers/generationDebugSvg";
import { faceClassName, renderFaceWardLandmark } from "../renderers/landmarkSvg";
import { renderObjectRotationHandle, renderObjectSvg } from "../renderers/objectSvg";
import {
  appendFaceSelectionLabels,
  type GridOverlay,
  renderHoverOverlay,
  renderRoutePreview
} from "../renderers/overlays/editorOverlays";
import { featureGroupPickInfo, parsePickInfo } from "../renderers/pickInfo";
import { renderShipRotationHandle, renderShipSvg } from "../renderers/shipSvg";
import { readModelQualityPreference } from "../services/browserPreferences";
import { startRuralFields } from "../services/ruralFieldWorkerClient";
import type { DisplayState, DocumentsState, GenerationState, InteractionState } from "../state/editorSession";
import type { InfillLane } from "../types/contracts/localInfill";
import type { CityDocument, Id, LandmarkAsset, Tool, WardKind } from "../types/document";
import { formatDistance, niceScale } from "../utils/editorUnits";
import { isBrushTool } from "./tools/toolTypes";
export interface MapDisplayContext {
  scope: import("../services/editorLifetime").EditorLifetime;
  documents: DocumentsState;
  landmarkSelect: HTMLSelectElement;
  interaction: InteractionState;
  landmarkControls: HTMLDivElement;
  shipControls: HTMLDivElement;
  objectControls: HTMLDivElement;
  elevationControls: HTMLDivElement;
  currentBuildingPatternSelect: HTMLSelectElement;
  historicalPeriodSelect: HTMLSelectElement;
  walledShareInput: HTMLInputElement;
  inferredHistoryWalls: () => { townWallRings: "single" | "double"; walledAreaShare: number } | null;
  map: HTMLDivElement;
  toolButtons: Map<Tool, HTMLButtonElement>;
  undoButton: HTMLButtonElement;
  redoButton: HTMLButtonElement;
  blockMeshInput: HTMLInputElement;
  display: DisplayState;
  gridLinesInput: HTMLInputElement;
  paintButtons: Map<"sea" | WardKind | "erase", HTMLButtonElement>;
  brushSizeInput: HTMLInputElement;
  brushSizeLabel: HTMLLabelElement;
  brushSizeValue: HTMLSpanElement;
  brushSizeText: () => string;
  junctionMaxGapInput: HTMLInputElement;
  junctionMaxGapLabel: HTMLLabelElement;
  junctionMaxGapValue: HTMLSpanElement;
  hideWardBrushPreview: () => void;
  updateWardBrushPreview: (event?: PointerEvent) => void;
  hideCircularWallPreview: () => void;
  updateCircularWallPreview: (event?: PointerEvent) => void;
  renderInspector: () => void;
  renderGroups: () => void;
  renderHistory: () => void;
  status: HTMLOutputElement;
  redrawHandle: number;
  updateMeasureOverlay: () => void;
  generation: GenerationState;
  failureDebugSummary: HTMLDivElement;
  closeFailurePreview: HTMLButtonElement;
  housingSummary: HTMLOutputElement;
  faceElementsById: Map<string, SVGPathElement>;
  wardLandmarksGroup: SVGGElement | null;
  wardLandmarkElementsById: Map<string, SVGGElement>;
  documentForOutput: (current: CityDocument) => CityDocument;
  syncCity3d: () => void;
  gridOverlayForRender: () => GridOverlay | null;
  root: HTMLElement;
  renderQualitySelect: HTMLSelectElement;
  coreLayerInput: HTMLInputElement;
  elevationTintInput: HTMLInputElement;
  vacantTreesInput: HTMLInputElement;
  generateVacantTreesButton: HTMLButtonElement;
  regenerateFarmlandButton: HTMLButtonElement;
  farmlandSystemSelect: HTMLSelectElement;
  farmlandYearInput: HTMLInputElement;
  farmlandSummary: HTMLOutputElement;
  farmlandModeSelect: HTMLSelectElement;
  farmlandRangeSelect: HTMLSelectElement;
  farmlandDirectionSelect: HTMLSelectElement;
  farmlandCoverageInput: HTMLInputElement;
  regionalLayerInput: HTMLInputElement;
  scaleLine: HTMLDivElement;
  scaleLabel: HTMLOutputElement;
  junctionGapLine: HTMLDivElement;
  junctionGapLength: HTMLSpanElement;
}
export function createMapDisplayController(ctx: MapDisplayContext) {
  let ruralRun: ReturnType<typeof startRuralFields> | undefined;
  let ruralDocument: CityDocument | undefined;
  let ruralFingerprint = "";
  let ruralRequest = 0;
  const ruralStatus = new WeakMap<CityDocument, "running" | "stopped">();
  ctx.scope.own(() => ruralRun?.cancel());
  function cancelFarmland() {
    ruralRequest++;
    ruralRun?.cancel();
    ruralRun = undefined;
    if (ruralDocument) ruralStatus.delete(ruralDocument);
    ruralDocument = undefined;
  }
  function generateFarmland() {
    const document = ctx.documents.documentState;
    if (
      document.ruralFieldVersion !== 2 ||
      document.appearance !== "town" ||
      document.ruralFieldSettings?.mode === "off" ||
      (ctx.generation.generationJob && !ctx.generation.acceptingResult)
    )
      return;
    cancelFarmland();
    const request = ruralRequest;
    ruralDocument = document;
    ruralFingerprint = documentFabricFingerprint(document);
    const fingerprint = ruralFingerprint;
    ruralStatus.set(document, "running");
    ctx.farmlandSummary.hidden = false;
    ctx.farmlandSummary.textContent = editorText("cityEditor.messages.farmlandRunning");
    // Two frames let the completed town paint before cloning input for the worker.
    ctx.scope.frame(() =>
      ctx.scope.frame(() => {
        if (
          request !== ruralRequest ||
          ctx.generation.generationJob ||
          ctx.documents.documentState !== document ||
          !ctx.scope.active ||
          ruralStatus.get(document) !== "running"
        )
          return;
        const outputDocument = ctx.documentForOutput(document);
        const outputFingerprint = documentFabricFingerprint(outputDocument);
        const run = startRuralFields(outputDocument, buildBlockFabric(outputDocument));
        ruralRun = run;
        void run.result.then(overlay => {
          if (
            ruralRun !== run ||
            ctx.documents.documentState !== document ||
            !ctx.scope.active ||
            fingerprint !== documentFabricFingerprint(document)
          )
            return;
          ruralRun = undefined;
          if (overlay) {
            storeRuralFieldOverlay(document, fingerprint, overlay);
            storeRuralFieldOverlay(outputDocument, outputFingerprint, overlay);
            ruralStatus.delete(document);
          } else ruralStatus.set(document, "stopped");
          redrawMap();
          ctx.syncCity3d();
        });
      })
    );
  }

  function refresh(): void {
    if (!ctx.scope.active) return;
    redrawMap();
    refreshUiOnly();
  }
  function refreshUiOnly(): void {
    if (!ctx.scope.active) return;
    const assets = [
      ...(ctx.documents.documentState.landmarkAssets ?? []),
      ...historicLandmarkPrototypes.filter(
        prototype =>
          !(ctx.documents.documentState.landmarkAssets ?? []).some(
            asset => asset.id === prototype.id && asset.revision === prototype.revision
          )
      )
    ];
    ctx.scope.replaceChildren(
      ctx.landmarkSelect,
      ...assets.map(asset => {
        const option = document.createElement("option");
        option.value = `${asset.id}@${asset.revision}`;
        option.textContent = `${asset.name} (${asset.historicalPhase})`;
        return option;
      })
    );
    if (!assets.length) {
      const option = document.createElement("option");
      option.textContent = editorText("cityEditor.messages.importReviewedAsset");
      option.value = "";
      ctx.landmarkSelect.appendChild(option);
    }
    if (!assets.some(asset => `${asset.id}@${asset.revision}` === ctx.interaction.landmarkAssetId))
      ctx.interaction.landmarkAssetId = assets.length ? `${assets[0].id}@${assets[0].revision}` : "";
    ctx.landmarkSelect.value = ctx.interaction.landmarkAssetId;
    ctx.landmarkControls.hidden = ctx.interaction.tool !== "landmark";
    ctx.objectControls.hidden = ctx.interaction.tool !== "object";
    ctx.shipControls.hidden = ctx.interaction.tool !== "ship";
    ctx.elevationControls.hidden = ctx.interaction.tool !== "elevation";
    ctx.currentBuildingPatternSelect.value =
      ctx.documents.documentState.buildingPattern ??
      (ctx.documents.documentState.fabric?.version === 5 ? "medieval" : "legacy");
    ctx.historicalPeriodSelect.value =
      (ctx.generation.generateSettings.population ? ctx.generation.generateSettings.historicalPeriod : undefined) ??
      ctx.documents.documentState.historicalPeriod ??
      "ageOfExploration";
    ctx.walledShareInput.placeholder = editorText("cityEditor.messages.autoCityEditorPage", {
      value0: Math.round(
        (ctx.inferredHistoryWalls()?.walledAreaShare ??
          defaultWalledAreaShare(ctx.documents.documentState.frame.extentMeters)) * 100
      )
    });
    ctx.elevationTintInput.checked = ctx.documents.documentState.showElevationTint !== false;
    ctx.vacantTreesInput.checked = !!ctx.documents.documentState.vacantLotTrees?.visible;
    ctx.vacantTreesInput.disabled = !ctx.documents.documentState.vacantLotTrees;
    ctx.regenerateFarmlandButton.disabled =
      ctx.documents.documentState.appearance !== "town" || ctx.display.hideBuildings;
    ctx.farmlandModeSelect.value = ctx.documents.documentState.ruralFieldSettings?.mode ?? "manual";
    ctx.farmlandRangeSelect.value = ctx.documents.documentState.ruralFieldSettings?.range ?? "whole-frame";
    ctx.farmlandDirectionSelect.value = ctx.documents.documentState.ruralFieldSettings?.direction ?? "all";
    ctx.farmlandCoverageInput.value = String(ctx.documents.documentState.ruralFieldSettings?.coveragePercent ?? 70);
    for (const input of [
      ctx.farmlandModeSelect,
      ctx.farmlandRangeSelect,
      ctx.farmlandDirectionSelect,
      ctx.farmlandCoverageInput
    ])
      input.disabled = ctx.regenerateFarmlandButton.disabled;
    ctx.farmlandSystemSelect.value = ctx.documents.documentState.ruralFieldSettings?.system ?? "auto";
    ctx.farmlandYearInput.value = String(ctx.documents.documentState.ruralFieldSettings?.rotationYear ?? 0);
    ctx.farmlandSystemSelect.disabled = ctx.regenerateFarmlandButton.disabled;
    ctx.farmlandYearInput.disabled = ctx.regenerateFarmlandButton.disabled;
    ctx.generateVacantTreesButton.disabled =
      ctx.documents.documentState.appearance !== "town" || ctx.display.hideBuildings;
    ctx.map.classList.toggle("ce-map--select", ctx.interaction.tool === "select");
    ctx.map.classList.toggle("ce-map--brush", isBrushTool(ctx.interaction.tool) || ctx.interaction.tool === "wardWall");
    for (const [id, button] of ctx.toolButtons) button.classList.toggle("is-active", id === ctx.interaction.tool);
    ctx.undoButton.disabled = !ctx.documents.history.canUndo;
    ctx.redoButton.disabled = !ctx.documents.history.canRedo;
    ctx.blockMeshInput.checked = ctx.display.showBlockMesh || ctx.interaction.tool !== "select";
    ctx.gridLinesInput.checked = ctx.display.showGridLines;
    for (const [kind, button] of ctx.paintButtons) {
      if (kind === "farm") button.hidden = ctx.documents.documentState.gridKind !== "evolution";
      button.classList.toggle(
        "is-active",
        kind === "sea"
          ? ctx.interaction.tool === "sea"
          : ctx.interaction.tool === "ward" &&
              (kind === "erase" ? ctx.interaction.wardBrush === null : ctx.interaction.wardBrush === kind)
      );
    }
    ctx.brushSizeInput.disabled = !isBrushTool(ctx.interaction.tool);
    ctx.brushSizeLabel.classList.toggle("is-disabled", !isBrushTool(ctx.interaction.tool));
    ctx.brushSizeValue.textContent = ctx.brushSizeText();
    ctx.junctionMaxGapInput.disabled = ctx.interaction.tool !== "junction";
    ctx.junctionMaxGapLabel.classList.toggle("is-disabled", ctx.interaction.tool !== "junction");
    ctx.junctionMaxGapValue.textContent = formatDistance(ctx.interaction.junctionMaxGapMeters);
    if (!isBrushTool(ctx.interaction.tool)) ctx.hideWardBrushPreview();
    else ctx.updateWardBrushPreview();
    if (ctx.interaction.tool !== "wardWall") ctx.hideCircularWallPreview();
    else ctx.updateCircularWallPreview();
    ctx.renderInspector();
    ctx.renderGroups();
    ctx.renderHistory();
    const errors = validate(ctx.documents.documentState);
    ctx.status.textContent = editorText("cityEditor.messages.blocksGroups", {
      value0: Object.keys(ctx.documents.documentState.mesh.faces).length,
      value1: ctx.documents.documentState.featureGroups.length,
      value2: errors.length ? ` · ${errors.join(", ")}` : editorText("cityEditor.messages.valid"),
      value3: ctx.display.notice ? ` · ${ctx.display.notice}` : ""
    });
    refreshScaleBar();
  }
  function scheduleRedraw(): void {
    if (ctx.redrawHandle) return;
    ctx.redrawHandle = ctx.scope.frame(() => {
      ctx.redrawHandle = 0;
      redrawMap();
    });
  }
  function flushRedraw(): void {
    if (ctx.redrawHandle) redrawMap();
  }
  function updateViewport(zoomChanged = false): void {
    const svg = ctx.map.querySelector("svg");
    if (!svg) return;
    svg.setAttribute(
      "viewBox",
      `${ctx.display.viewCenter[0] - ctx.display.halfView} ${-ctx.display.viewCenter[1] - ctx.display.halfView} ${ctx.display.halfView * 2} ${ctx.display.halfView * 2}`
    );
    if (zoomChanged)
      svg
        .querySelector(".ce-approach-labels")
        ?.replaceWith(renderApproachLabels(ctx.documents.documentState, zoomFactor()));
    updateHoverOverlay();
    ctx.updateMeasureOverlay();
  }
  function redrawMap(): void {
    if (!ctx.scope.active) return;
    if (ctx.redrawHandle) {
      ctx.scope.cancelFrame(ctx.redrawHandle);
      ctx.redrawHandle = 0;
    }
    const box = `${ctx.display.viewCenter[0] - ctx.display.halfView} ${-ctx.display.viewCenter[1] - ctx.display.halfView} ${ctx.display.halfView * 2} ${ctx.display.halfView * 2}`;
    if (
      ctx.generation.failurePreview &&
      ctx.generation.failurePreviewHistoryIndex !== null &&
      ctx.documents.history.index < ctx.generation.failurePreviewHistoryIndex
    ) {
      ctx.generation.failurePreview = null;
      ctx.failureDebugSummary.hidden = true;
      ctx.closeFailurePreview.hidden = true;
    }
    if (ctx.generation.failurePreview)
      ctx.generation.failurePreview = { ...ctx.generation.failurePreview, document: ctx.documents.documentState };
    if (ctx.generation.failureRenderContext && validate(ctx.documents.documentState).length) {
      const editablePreview = ctx.generation.failurePreview ?? {
        ...ctx.generation.failureRenderContext,
        document: ctx.documents.documentState,
        highlights: { vertices: [], edges: [], faces: [], contextual: false }
      };
      ctx.scope.replaceChildren(
        ctx.map,
        renderGenerationDebugSvg(editablePreview, box, {
          showVertices: ctx.interaction.tool === "vertex" || ctx.interaction.tool === "river",
          selectedVertexId: ctx.interaction.selection.vertexId,
          selectedEdgeId: ctx.interaction.selection.edgeId
        })
      );
      ctx.housingSummary.hidden = true;
      ctx.farmlandSummary.hidden = true;
      ctx.faceElementsById.clear();
      ctx.wardLandmarksGroup = null;
      ctx.wardLandmarkElementsById.clear();
      updateGenerationLogHover();
      return;
    }
    const renderStart = performance.now();
    const svg = renderEditorSvg(
      ctx.documentForOutput(ctx.documents.documentState),
      ctx.interaction.tool,
      ctx.interaction.selection,
      box,
      zoomFactor(),
      ctx.display.showSelectionLabels,
      ctx.documents.referenceImage,
      ctx.generation.urbanCoreHighlight,
      ctx.generation.stepOverlayPaths,
      ctx.gridOverlayForRender(),
      ctx.display.showBlockMesh,
      ctx.display.showGridLines,
      sample => ctx.root.dispatchEvent(new CustomEvent("city-render-diagnostics", { detail: sample })),
      ctx.display.hideBuildings,
      ctx.display.hideStreetLines,
      ctx.renderQualitySelect.value as RenderQuality,
      false,
      { core: ctx.coreLayerInput.checked, regional: ctx.regionalLayerInput.checked },
      { modelQuality: readModelQualityPreference(), fmgLinked: Boolean(ctx.generation.generateSettings.descriptor) }
    );
    if (ctx.generation.failurePreview) {
      svg.classList.add("ce-generation-debug");
      svg.setAttribute("data-attempt", String(ctx.generation.failurePreview.sample.attempt));
      svg.setAttribute("data-seed", ctx.generation.failurePreview.seed);
      const highlights = document.createElementNS("http://www.w3.org/2000/svg", "g");
      highlights.setAttribute("pointer-events", "none");
      highlights.append(
        ...renderGenerationDebugSvg(ctx.generation.failurePreview, box).querySelectorAll(
          ".ce-generation-debug-highlight, [data-debug-restriction]"
        )
      );
      svg.querySelector(".ce-map-scene")!.append(highlights);
    }
    ctx.scope.replaceChildren(ctx.map, svg);
    const rural = svg.getAttribute("data-rural-fields");
    ctx.farmlandSummary.hidden = !rural;
    if (rural) {
      const diagnostic = JSON.parse(rural) as {
        cultivatedAreaM2: number;
        shortfallAreaM2: number;
        shortfallReason?: "terrain" | "access" | "space" | "minimum-plot";
        suitabilitySource?: "survey" | "biome-estimate" | "unknown";
      };
      ctx.farmlandSummary.textContent = editorText("cityEditor.messages.farmlandSummary", {
        area: (diagnostic.cultivatedAreaM2 / 10_000).toFixed(1),
        shortfall: (diagnostic.shortfallAreaM2 / 10_000).toFixed(1)
      });
      if (diagnostic.shortfallAreaM2 > 1 && diagnostic.shortfallReason)
        ctx.farmlandSummary.textContent += ` · ${editorText(`cityEditor.messages.farmlandReason_${diagnostic.shortfallReason}`)}`;
      if (diagnostic.suitabilitySource)
        ctx.farmlandSummary.textContent += ` · ${editorText(`cityEditor.messages.farmlandSource_${diagnostic.suitabilitySource}`)}`;
    }
    const current = ctx.documents.documentState;
    if (ruralDocument && (ruralDocument !== current || ruralFingerprint !== documentFabricFingerprint(current))) {
      ruralRun?.cancel();
      ruralRun = undefined;
      ruralStatus.delete(ruralDocument);
      ruralDocument = undefined;
    }
    if (current.ruralFieldVersion === 2 && !rural) {
      ctx.farmlandSummary.hidden = false;
      const status = ruralStatus.get(current);
      ctx.farmlandSummary.textContent = editorText(
        status === "running"
          ? "cityEditor.messages.farmlandRunning"
          : status === "stopped"
            ? "cityEditor.messages.farmlandStopped"
            : "cityEditor.messages.farmlandOptional"
      );
      if (
        current.ruralFieldSettings?.mode === "background" &&
        !status &&
        !ctx.display.hideBuildings &&
        !ruralFieldOverlay(current, documentFabricFingerprint(current))
      )
        generateFarmland();
    }
    const coreBuildings = Number(svg.getAttribute("data-core-buildings") ?? 0);
    const outerBuildings = Number(svg.getAttribute("data-outskirts-buildings") ?? 0);
    const oldTownBuildings = Number(svg.getAttribute("data-old-town-buildings") ?? 0);
    const buildingCount = coreBuildings + outerBuildings;
    ctx.housingSummary.hidden = buildingCount === 0;
    ctx.housingSummary.textContent = !buildingCount
      ? ""
      : oldTownBuildings
        ? editorText("cityEditor.messages.buildingsOldTownBetweenWallsOutside", {
            value0: oldTownBuildings.toLocaleString(),
            value1: (coreBuildings - oldTownBuildings).toLocaleString(),
            value2: outerBuildings.toLocaleString(),
            value3: Math.round((outerBuildings / buildingCount) * 100)
          })
        : editorText("cityEditor.messages.buildingsCoreOuterBelt", {
            value0: coreBuildings.toLocaleString(),
            value1: outerBuildings.toLocaleString(),
            value2: Math.round((outerBuildings / buildingCount) * 100)
          });
    if (ctx.documents.documentState.urbanMorphology && svg.hasAttribute("data-residential-capacity")) {
      ctx.housingSummary.textContent += ` · ${editorText("cityEditor.messages.residentialCapacitySummary", {
        value0: Number(svg.getAttribute("data-residential-capacity")).toLocaleString(),
        value1: Number(svg.getAttribute("data-assigned-outside-dwellings")).toLocaleString(),
        value2: Number(svg.getAttribute("data-unplaced-dwellings")).toLocaleString()
      })}`;
    }
    const population = svg.hasAttribute("data-population-report")
      ? (JSON.parse(
          svg.getAttribute("data-population-report")!
        ) as import("../types/contracts/population").PopulationReport)
      : ctx.documents.documentState.populationReport;
    if (population) {
      ctx.housingSummary.hidden = false;
      ctx.housingSummary.textContent = editorText("cityEditor.messages.populationSummary", {
        population: population.targetPopulation.toLocaleString(),
        dwellings: ctx.documents.documentState.populationPlan?.requiredDwellings.toLocaleString(),
        buildings: population.estimatedBuildings.toLocaleString(),
        groups: population.displayGroups.toLocaleString(),
        unplaced: population.unplacedPopulation.toLocaleString()
      });
    }
    // Index the per-face nodes this pass just built so a later ward/sea paint
    // can patch just the touched faces (patchFaceRender) instead of forcing
    // another full pass over the whole mesh.
    ctx.faceElementsById = new Map(
      Array.from(svg.querySelectorAll<SVGPathElement>(".ce-face"), el => [el.getAttribute("data-face") as Id, el])
    );
    ctx.wardLandmarksGroup = svg.querySelector<SVGGElement>(".ce-ward-landmarks");
    ctx.wardLandmarkElementsById = new Map(
      Array.from(ctx.wardLandmarksGroup?.children ?? [], el => [
        (el.getAttribute("data-element") as string).slice("ward-".length),
        el as SVGGElement
      ])
    );
    updateRoutePreview();
    updateHoverOverlay();
    ctx.updateMeasureOverlay();
    updateLandmarkPreview();
    svg.setAttribute("data-redraw-cpu-ms", String(performance.now() - renderStart));
  }
  function selectedLandmarkAsset(): LandmarkAsset | null {
    return (
      [...(ctx.documents.documentState.landmarkAssets ?? []), ...historicLandmarkPrototypes].find(
        asset => `${asset.id}@${asset.revision}` === ctx.interaction.landmarkAssetId
      ) ?? null
    );
  }
  function preservedLandmarkLanes(): InfillLane[] {
    if (ctx.interaction.landmarkLaneSource === ctx.documents.documentState) return ctx.interaction.landmarkLanes;
    ctx.interaction.landmarkLaneSource = ctx.documents.documentState;
    if (
      ctx.documents.documentState.appearance === "town" &&
      (ctx.documents.documentState.buildingPattern === "medieval" ||
        ctx.documents.documentState.fabric?.version === 5 ||
        ctx.documents.documentState.gridKind === "evolution" ||
        ["circulade", "bram", "classic"].includes(ctx.documents.documentState.layout ?? ""))
    ) {
      const fabric = buildBlockFabric(ctx.documents.documentState);
      ctx.interaction.landmarkLanes = [
        ...buildLandmarkLaneNetwork(ctx.documents.documentState, fabric.lanes),
        ...(fabric.parcels ?? []).flatMap(parcel =>
          parcel.access.map(access => ({
            faceId: parcel.faceIds[0],
            points: access.points,
            widthMeters: access.widthMeters
          }))
        )
      ];
    } else ctx.interaction.landmarkLanes = [];
    return ctx.interaction.landmarkLanes;
  }
  function updateShipPreview(): void {
    const svg = ctx.map.querySelector("svg");
    if (!svg) return;
    svg.querySelector(".ce-ship-preview")?.remove();
    if (ctx.interaction.tool === "object" && ctx.interaction.shipHoverPoint) {
      const preview = renderObjectSvg({
        id: "object-preview",
        kind: "object",
        faceIds: [],
        locked: false,
        point: ctx.interaction.shipHoverPoint,
        objectType: ctx.interaction.objectType,
        objectScale: ctx.interaction.objectScale,
        rotation: (ctx.interaction.objectAngleDegrees * Math.PI) / 180
      });
      preview.classList.add("ce-ship-preview");
      preview.setAttribute("opacity", "0.65");
      preview.style.pointerEvents = "none";
      svg.querySelector(".ce-map-scene")?.appendChild(preview);
      return;
    }
    if (ctx.interaction.tool !== "ship" || !ctx.interaction.shipHoverPoint) return;
    const preview = renderShipSvg({
      type: ctx.interaction.shipType,
      point: ctx.interaction.shipHoverPoint,
      sizeMeters: ctx.interaction.shipSizeMeters,
      rotation: (ctx.interaction.shipAngleDegrees * Math.PI) / 180,
      opacity: 0.68,
      className: "ce-ship-preview"
    });
    preview.style.pointerEvents = "none";
    svg.querySelector(".ce-map-scene")!.appendChild(preview);
  }
  function updateLandmarkPreview(): void {
    const svg = ctx.map.querySelector("svg");
    if (!svg) return;
    svg.querySelector(".ce-landmark-preview")?.remove();
    const asset = selectedLandmarkAsset();
    if (ctx.interaction.tool !== "landmark" || !asset || !ctx.interaction.landmarkHoverPoint) return;
    const placement = {
      id: "preview-landmark",
      position: ctx.interaction.landmarkHoverPoint,
      rotation: (ctx.interaction.landmarkRotationDegrees * Math.PI) / 180,
      scale: 1
    };
    const preview = placeLandmark(ctx.documents.documentState, asset, placement, preservedLandmarkLanes());
    const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
    layer.classList.add("ce-landmark-preview");
    layer.setAttribute("pointer-events", "none");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const site = transformLandmarkPolygons(asset.minimumSite, placement);
    path.setAttribute(
      "d",
      site
        .flatMap(part => [part.outer, ...part.holes])
        .map(ring => `M ${ring.map(point => `${point[0]} ${-point[1]}`).join(" L ")} Z`)
        .join(" ")
    );
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("fill", preview.document ? "#68aa6a66" : "#c2606066");
    path.setAttribute("stroke", preview.document ? "#267943" : "#a22525");
    path.setAttribute("stroke-width", "2");
    layer.appendChild(path);
    const footprint = document.createElementNS("http://www.w3.org/2000/svg", "path");
    footprint.setAttribute(
      "d",
      transformLandmarkPolygons(asset.footprint, placement)
        .flatMap(part => [part.outer, ...part.holes])
        .map(ring => `M ${ring.map(point => `${point[0]} ${-point[1]}`).join(" L ")} Z`)
        .join(" ")
    );
    footprint.setAttribute("fill-rule", "evenodd");
    footprint.setAttribute("fill", preview.document ? "#357a5477" : "#a8444477");
    footprint.setAttribute("stroke", preview.document ? "#1d6539" : "#8b1d1d");
    layer.appendChild(footprint);
    for (const access of preview.document?.landmarks?.at(-1)?.accesses ?? []) {
      const route = document.createElementNS("http://www.w3.org/2000/svg", "path");
      route.setAttribute("d", `M ${access.points.map(point => `${point[0]} ${-point[1]}`).join(" L ")}`);
      route.setAttribute("fill", "none");
      route.setAttribute("stroke", "#267943");
      route.setAttribute("stroke-width", String(access.widthMeters));
      layer.appendChild(route);
    }
    const message = document.createElementNS("http://www.w3.org/2000/svg", "text");
    message.textContent = preview.document
      ? editorText("cityEditor.messages.place", { value0: asset.name })
      : preview.reasons.slice(0, 2).join("; ");
    message.setAttribute("x", String(ctx.interaction.landmarkHoverPoint[0]));
    message.setAttribute("y", String(-ctx.interaction.landmarkHoverPoint[1] - 14));
    message.setAttribute("font-size", "11");
    message.setAttribute("fill", preview.document ? "#165a34" : "#8b1d1d");
    layer.appendChild(message);
    svg.querySelector(".ce-map-scene")!.appendChild(layer);
  }
  function patchFaceRender(faceId: Id): void {
    const face = ctx.documents.documentState.mesh.faces[faceId];
    if (!face) return;
    const path = ctx.faceElementsById.get(faceId);
    if (path) path.setAttribute("class", faceClassName(face, ctx.interaction.selection.faceId === faceId));
    const svg = ctx.map.querySelector("svg");
    if (svg && ctx.documents.documentState.showElevationTint !== false)
      syncCellReliefFace(svg, ctx.documents.documentState.mesh, face);
    ctx.wardLandmarkElementsById.get(faceId)?.remove();
    ctx.wardLandmarkElementsById.delete(faceId);
    const landmark = renderFaceWardLandmark(ctx.documents.documentState.mesh, face, ctx.documents.documentState);
    if (landmark && ctx.wardLandmarksGroup) {
      ctx.wardLandmarksGroup.appendChild(landmark);
      ctx.wardLandmarkElementsById.set(faceId, landmark as SVGGElement);
    }
  }
  function updateRoutePreview(): void {
    const layer = ctx.map.querySelector<SVGGElement>(".ce-route-preview-layer");
    if (!layer) return;
    ctx.scope.replaceChildren(layer);
    if (!ctx.interaction.routePreview) return;
    const path = renderRoutePreview(
      ctx.documents.documentState,
      ctx.interaction.routePreview.group,
      ctx.interaction.routePreview.replacementVertices
    );
    if (path) layer.appendChild(path);
  }
  function updateHoverOverlay(): void {
    const layer = ctx.map.querySelector<SVGGElement>(".ce-hover-layer");
    if (!layer) return;
    ctx.scope.replaceChildren(
      layer,
      ...renderHoverOverlay(ctx.documents.documentState, ctx.interaction.selection, zoomFactor())
    );
    updateGenerationLogHover();
  }
  function patchSelectionRender(): boolean {
    const svg = ctx.map.querySelector<SVGSVGElement>("svg");
    if (!svg || ctx.interaction.tool !== "select") return false;

    // Use the same classes and encoded pick metadata as renderEditorSvg().
    svg.querySelectorAll(".ce-selected, .ce-is-selected, .cg-is-selected, .ce-active-group").forEach(el => {
      el.classList.remove("ce-selected", "ce-is-selected", "cg-is-selected", "ce-active-group");
    });

    const groups = new Map(ctx.documents.documentState.featureGroups.map(group => [group.id, group]));
    for (const el of svg.querySelectorAll<SVGElement>("[data-road-owner]")) {
      const info = parsePickInfo(el.getAttribute("data-pick"));
      if (!info || !Array.isArray(info.routeIds)) continue;
      const selectedId = ctx.interaction.selection.groupId;
      const groupId =
        selectedId && info.routeIds.includes(selectedId) ? selectedId : el.getAttribute("data-road-owner");
      const group = groupId ? groups.get(groupId) : undefined;
      if (!group) continue;
      el.setAttribute("data-group", group.id);
      el.setAttribute("data-pick", encodeURIComponent(JSON.stringify(featureGroupPickInfo(group, info))));
    }

    if (ctx.interaction.selection.faceId) {
      const faceEl =
        ctx.faceElementsById.get(ctx.interaction.selection.faceId) ??
        svg.querySelector<SVGElement>(`[data-face="${ctx.interaction.selection.faceId}"]`);
      faceEl?.classList.add("ce-selected");
    }
    if (ctx.interaction.selection.edgeId) {
      svg.querySelector<SVGElement>(`[data-edge="${ctx.interaction.selection.edgeId}"]`)?.classList.add("ce-selected");
    }
    if (ctx.interaction.selection.vertexId) {
      svg
        .querySelector<SVGElement>(`[data-vertex="${ctx.interaction.selection.vertexId}"]`)
        ?.classList.add("ce-selected");
    }

    if (ctx.interaction.selection.inspectedId) {
      const id = ctx.interaction.selection.inspectedId;
      const prefixes: Record<string, string> = {
        cells: "cell",
        edges: "edge",
        vertices: "vertex",
        features: "feature"
      };
      for (const el of svg.querySelectorAll<SVGElement>("[data-pick]")) {
        const info = parsePickInfo(el.getAttribute("data-pick"));
        if (!info) continue;
        const prefix = prefixes[info.layer];
        const selected =
          info.id === id ||
          (prefix && `${prefix}-${info.id}` === id) ||
          (info.layer === "features" &&
            Array.isArray(info.routeIds) &&
            info.routeIds.some(routeId => routeId === id || `feature-${routeId}` === id)) ||
          (info.layer === "buildings" && info.faceId === id);
        if (selected) el.classList.add("ce-is-selected", "cg-is-selected");
      }
    }

    if (ctx.interaction.selection.groupId) {
      svg.querySelectorAll<SVGElement>(`[data-group="${ctx.interaction.selection.groupId}"]`).forEach(el => {
        el.classList.add("ce-active-group");
      });
    }

    svg.querySelectorAll(".ce-object-handle-group").forEach(handle => {
      handle.remove();
    });
    const selectedObject = ctx.documents.documentState.elements.find(
      e => e.kind === "object" && e.id === ctx.interaction.selection.inspectedId
    );
    if (selectedObject?.point && !selectedObject.locked) {
      svg.querySelector(".ce-elements")?.appendChild(renderObjectRotationHandle(selectedObject));
    }

    svg.querySelectorAll(".ce-ship-handle-group").forEach(handle => {
      handle.remove();
    });
    const selectedShip = ctx.documents.documentState.elements.find(
      e => e.kind === "ship" && e.id === ctx.interaction.selection.inspectedId
    );
    if (selectedShip?.point) {
      svg.querySelector(".ce-elements")?.appendChild(
        renderShipRotationHandle({
          id: selectedShip.id,
          point: selectedShip.point,
          sizeMeters: selectedShip.sizeMeters,
          rotation: selectedShip.rotation
        })
      );
    }

    // Labels
    svg.querySelector(".ce-selection-labels")?.remove();
    if (ctx.display.showSelectionLabels && ctx.interaction.selection.faceId) {
      appendFaceSelectionLabels(svg, ctx.documents.documentState, ctx.interaction.selection.faceId, zoomFactor());
    }

    updateRoutePreview();
    updateHoverOverlay();
    return true;
  }
  function refreshScaleBar(): void {
    const width = ctx.map.getBoundingClientRect().width;
    if (width <= 0) return;
    const metersPerPixel = (ctx.display.halfView * 2) / width;
    const meters = niceScale(metersPerPixel * 120);
    ctx.scaleLine.style.width = `${meters / metersPerPixel}px`;
    const blockCount = Math.max(1, Math.round(meters / ctx.documents.documentState.frame.blockSizeMeters));
    ctx.scaleLabel.textContent = editorText("cityEditor.messages.block1Cell", {
      value0: zoomFactor().toFixed(1),
      value1: formatDistance(meters),
      value2: blockCount,
      value3: blockCount === 1 ? "" : "s",
      value4: formatDistance(ctx.documents.documentState.frame.blockSizeMeters)
    });
    refreshJunctionGapScale();
  }
  function refreshJunctionGapScale(): void {
    const width = ctx.map.getBoundingClientRect().width;
    if (width <= 0) return;
    const metersPerPixel = (ctx.display.halfView * 2) / width;
    const pixelLength = Math.max(1, ctx.interaction.junctionMaxGapMeters / metersPerPixel);
    ctx.junctionGapLine.style.width = `${pixelLength}px`;
    ctx.junctionGapLength.textContent = editorText("cityEditor.messages.edgeThreshold", {
      value0: formatDistance(ctx.interaction.junctionMaxGapMeters)
    });
  }
  function zoomFactor(): number {
    return ctx.documents.documentState.frame.extentMeters / 2 / ctx.display.halfView;
  }
  function hoverGenerationLogObjects(ids: string[], seed: string): void {
    ctx.generation.generationLogHover = { ids, seed };
    updateGenerationLogHover();
  }
  function updateGenerationLogHover(): void {
    const svg = ctx.map.querySelector("svg");
    if (!svg) return;
    svg.querySelector(".ce-generation-log-highlight")?.remove();
    if (
      ctx.generation.generationLogHover.seed !== ctx.documents.documentState.generationSeed ||
      !ctx.generation.generationLogHover.ids.length
    )
      return;
    const ns = "http://www.w3.org/2000/svg";
    const layer = document.createElementNS(ns, "g");
    layer.setAttribute("class", "ce-generation-log-highlight");
    layer.setAttribute("pointer-events", "none");
    for (const id of ctx.generation.generationLogHover.ids) {
      const vertex = ctx.documents.documentState.mesh.vertices[id],
        edge = ctx.documents.documentState.mesh.edges[id],
        face = ctx.documents.documentState.mesh.faces[id];
      let node: SVGElement;
      if (vertex) {
        node = document.createElementNS(ns, "circle");
        node.setAttribute("cx", String(vertex.point[0]));
        node.setAttribute("cy", String(-vertex.point[1]));
        node.setAttribute("r", String(Math.max(0.5, ctx.display.halfView / 70)));
        node.setAttribute("fill", "#ffdf0088");
      } else if (
        edge &&
        ctx.documents.documentState.mesh.vertices[edge.a] &&
        ctx.documents.documentState.mesh.vertices[edge.b]
      ) {
        node = document.createElementNS(ns, "path");
        const a = ctx.documents.documentState.mesh.vertices[edge.a].point,
          b = ctx.documents.documentState.mesh.vertices[edge.b].point;
        node.setAttribute("d", `M${a[0]},${-a[1]}L${b[0]},${-b[1]}`);
        node.setAttribute("fill", "none");
      } else if (face?.boundary.every(ref => ctx.documents.documentState.mesh.edges[ref.edgeId])) {
        node = document.createElementNS(ns, "path");
        node.setAttribute(
          "d",
          `${facePoints(ctx.documents.documentState.mesh, face)
            .map((p, i) => `${i ? "L" : "M"}${p[0]},${-p[1]}`)
            .join(" ")}Z`
        );
        node.setAttribute("fill", "#ffdf0044");
      } else continue;
      node.setAttribute("data-object-id", id);
      node.setAttribute("stroke", "#ffdf00");
      node.setAttribute("stroke-width", "4");
      node.setAttribute("vector-effect", "non-scaling-stroke");
      layer.append(node);
    }
    svg.querySelector(".ce-map-scene")!.append(layer);
  }
  return {
    cancelFarmland,
    generateFarmland,
    refresh,
    refreshUiOnly,
    scheduleRedraw,
    flushRedraw,
    updateViewport,
    redrawMap,
    selectedLandmarkAsset,
    preservedLandmarkLanes,
    updateShipPreview,
    updateLandmarkPreview,
    patchFaceRender,
    updateRoutePreview,
    updateHoverOverlay,
    patchSelectionRender,
    refreshScaleBar,
    refreshJunctionGapScale,
    zoomFactor,
    hoverGenerationLogObjects,
    updateGenerationLogHover
  };
}
