import { editorText } from "../../i18n/editorMessages";
import type { GridKind } from "../core/document";
import { orientTempleHybrid } from "../core/gen/civicPlacement";
import { setBuildingPattern } from "../core/gen/fabricDistricts";
import type { WallCoastChoice, WallMaterialChoice } from "../core/gen/site/siteConfig";
import {
  type CityLayout,
  clearGenerationPreviewCache,
  type FarNodeMode,
  type GenerationSettings,
  randomSeed,
  riversForCount,
  type SiteConfig
} from "../core/generate";
import { validateLandmarks } from "../core/landmarks";
import type { CityDocument, LandmarkAsset } from "../core/types";
import { SHIP_SPECS, type ShipType } from "../render/shipSvg";
import type { DisplayState, DocumentsState, GenerationState, InteractionState } from "../state/editorSession";
import type { EraseTarget } from "../types/editor";
import { formatDistance } from "./editorGeometry";
export interface PanelEventsContext {
  scope: import("../services/editorLifetime").EditorLifetime;
  landmarkSelect: HTMLSelectElement;
  interaction: InteractionState;
  refresh: () => void;
  landmarkAngle: HTMLInputElement;
  updateLandmarkPreview: () => void;
  landmarkFile: HTMLInputElement;
  documents: DocumentsState;
  commit: (next: CityDocument, label?: string) => void;
  showNotice: (value: string, redraw?: boolean) => void;
  shipSelect: HTMLSelectElement;
  shipSizeInput: HTMLInputElement;
  updateShipPreview: () => void;
  shipAngle: HTMLInputElement;
  hexSizeInput: HTMLInputElement;
  hexSizeValue: HTMLSpanElement;
  gridKindSelect: HTMLSelectElement;
  syncGridKindUi: () => void;
  showLabelsInput: HTMLInputElement;
  display: DisplayState;
  redrawMap: () => void;
  brushSizeInput: HTMLInputElement;
  brushSizeValue: HTMLSpanElement;
  brushSizeText: () => string;
  updateWardBrushPreview: (event?: PointerEvent) => void;
  eraseTargetInput: HTMLSelectElement;
  junctionMaxGapInput: HTMLInputElement;
  junctionMaxGapValue: HTMLSpanElement;
  refreshJunctionGapScale: () => void;
  gridEvoSlider: HTMLInputElement;
  generation: GenerationState;
  syncGridEvoUi: () => void;
  currentBuildingPatternSelect: HTMLSelectElement;
  syncGenerateControls: () => void;
  historicalPeriodSelect: HTMLSelectElement;
  layoutSelect: HTMLSelectElement;
  buildingPatternSelect: HTMLSelectElement;
  coastSelect: HTMLSelectElement;
  seaWallSelect: HTMLSelectElement;
  wallMaterialSelect: HTMLSelectElement;
  riversSelect: HTMLSelectElement;
  riverPlacementSelect: HTMLSelectElement;
  stageSlider: HTMLInputElement;
  setStageStep: (step: number) => void;
  urbanNPatchesInput: HTMLInputElement;
  urbanCoreModeSelect: HTMLSelectElement;
  rerunLastStage: () => void;
  walledShareInput: HTMLInputElement;
  townWallBuildOrderSelect: HTMLSelectElement;
  syncStageUi: (step: number) => void;
  townWallRingsSelect: HTMLSelectElement;
  inferredHistoryWalls: () => { townWallRings: "single" | "double"; walledAreaShare: number } | null;
  farNodeSelect: HTMLSelectElement;
  syncBearingsRow: () => void;
  bearingsInput: HTMLInputElement;
  renderQualitySelect: HTMLSelectElement;
  seedInput: HTMLInputElement;
  runCompleteGeneration: () => void;
}
export function bindPanelEvents(ctx: PanelEventsContext, binding: PanelBinding) {
  switch (binding) {
    case "landmarkSelect:change": {
      ctx.scope.listen(ctx.landmarkSelect, "change", () => {
        ctx.interaction.landmarkAssetId = ctx.landmarkSelect.value;
        ctx.refresh();
      });
      break;
    }
    case "landmarkAngle:change": {
      ctx.scope.listen(ctx.landmarkAngle, "change", () => {
        ctx.interaction.landmarkRotationDegrees = Number(ctx.landmarkAngle.value) || 0;
        ctx.updateLandmarkPreview();
      });
      break;
    }
    case "landmarkFile:change": {
      ctx.scope.listen(ctx.landmarkFile, "change", () => {
        const file = ctx.landmarkFile.files?.[0];
        if (!file) return;
        void file.text().then(source => {
          if (!ctx.scope.active) return;
          try {
            const asset = JSON.parse(source) as LandmarkAsset;
            const trial: CityDocument = {
              ...ctx.documents.documentState,
              version: ctx.documents.documentState.sceneRegions ? 4 : 3,
              landmarkAssets: [asset],
              landmarks: []
            };
            if (validateLandmarks(trial).length) throw new Error(editorText("cityEditor.messages.invalidAsset"));
            const already = (ctx.documents.documentState.landmarkAssets ?? []).some(
              item => item.id === asset.id && item.revision === asset.revision
            );
            if (!already)
              ctx.commit(
                {
                  ...ctx.documents.documentState,
                  version: ctx.documents.documentState.sceneRegions ? 4 : 3,
                  landmarkAssets: [...(ctx.documents.documentState.landmarkAssets ?? []), asset]
                },
                editorText("cityEditor.messages.import", { value0: asset.name })
              );
            ctx.interaction.landmarkAssetId = `${asset.id}@${asset.revision}`;
            ctx.interaction.tool = "landmark";
            ctx.refresh();
          } catch {
            ctx.showNotice(editorText("cityEditor.messages.checkTheLandmarkAssetFormat"));
          }
        });
      });
      break;
    }
    case "shipSelect:change": {
      ctx.scope.listen(ctx.shipSelect, "change", () => {
        ctx.interaction.shipType = ctx.shipSelect.value as ShipType;
        ctx.interaction.shipSizeMeters = SHIP_SPECS[ctx.interaction.shipType].defaultSizeMeters;
        ctx.shipSizeInput.value = String(ctx.interaction.shipSizeMeters);
        ctx.updateShipPreview();
        ctx.refresh();
      });
      break;
    }
    case "shipSizeInput:input": {
      ctx.scope.listen(ctx.shipSizeInput, "input", () => {
        ctx.interaction.shipSizeMeters =
          Number(ctx.shipSizeInput.value) || SHIP_SPECS[ctx.interaction.shipType].defaultSizeMeters;
        ctx.updateShipPreview();
      });
      break;
    }
    case "shipAngle:input": {
      ctx.scope.listen(ctx.shipAngle, "input", () => {
        ctx.interaction.shipAngleDegrees = Number(ctx.shipAngle.value) || 0;
        ctx.updateShipPreview();
      });
      break;
    }
    case "hexSizeInput:input": {
      ctx.scope.listen(ctx.hexSizeInput, "input", () => {
        ctx.documents.hexSizeMeters = Number(ctx.hexSizeInput.value);
        ctx.hexSizeValue.textContent = formatDistance(ctx.documents.hexSizeMeters);
      });
      break;
    }
    case "gridKindSelect:change": {
      ctx.scope.listen(ctx.gridKindSelect, "change", () => {
        ctx.documents.gridKind = ctx.gridKindSelect.value as GridKind;
        ctx.syncGridKindUi();
      });
      break;
    }
    case "showLabelsInput:change": {
      ctx.scope.listen(ctx.showLabelsInput, "change", () => {
        ctx.display.showSelectionLabels = ctx.showLabelsInput.checked;
        ctx.redrawMap();
      });
      break;
    }
    case "brushSizeInput:input": {
      ctx.scope.listen(ctx.brushSizeInput, "input", () => {
        ctx.interaction.brushSizeCells = Number(ctx.brushSizeInput.value);
        ctx.brushSizeValue.textContent = ctx.brushSizeText();
        ctx.updateWardBrushPreview();
      });
      break;
    }
    case "eraseTargetInput:change": {
      ctx.scope.listen(ctx.eraseTargetInput, "change", () => {
        ctx.interaction.eraseTarget = ctx.eraseTargetInput.value as EraseTarget;
      });
      break;
    }
    case "junctionMaxGapInput:input": {
      ctx.scope.listen(ctx.junctionMaxGapInput, "input", () => {
        ctx.interaction.junctionMaxGapMeters = Number(ctx.junctionMaxGapInput.value);
        ctx.junctionMaxGapValue.textContent = formatDistance(ctx.interaction.junctionMaxGapMeters);
        ctx.refreshJunctionGapScale();
      });
      break;
    }
    case "gridEvoSlider:input": {
      ctx.scope.listen(ctx.gridEvoSlider, "input", () => {
        ctx.generation.gridEvoIndex = Number(ctx.gridEvoSlider.value);
        ctx.syncGridEvoUi();
        ctx.redrawMap();
      });
      break;
    }
    case "currentBuildingPatternSelect:change": {
      ctx.scope.listen(ctx.currentBuildingPatternSelect, "change", () => {
        const pattern = ctx.currentBuildingPatternSelect.value as "legacy" | "medieval";
        ctx.generation.generateSettings.buildingPattern = pattern;
        ctx.commit(
          setBuildingPattern(ctx.documents.documentState, pattern),
          editorText("cityEditor.messages.changeBuildingPattern")
        );
        if (ctx.documents.documentState.appearance === "town") {
          ctx.generation.completeResult = ctx.documents.documentState;
          ctx.generation.completeResultSettings = JSON.stringify(ctx.generation.generateSettings);
        }
        ctx.syncGenerateControls();
      });
      break;
    }
    case "historicalPeriodSelect:change": {
      ctx.scope.listen(ctx.historicalPeriodSelect, "change", () => {
        const period = ctx.historicalPeriodSelect.value as import("../core/types").HistoricalPeriod;
        ctx.generation.generateSettings.historicalPeriod = period;
        const next = { ...ctx.documents.documentState, historicalPeriod: period };
        const plaza = next.elements.find(e => e.kind === "plaza");
        for (const elem of next.elements) {
          if (elem.kind === "temple" && elem.point && !elem.locked) {
            elem.rotation = orientTempleHybrid(elem.point, elem.rotation ?? 0, plaza?.point, period);
          }
        }
        ctx.commit(next, editorText("cityEditor.messages.changeHistoricalPeriod"));
        if (ctx.documents.documentState.appearance === "town") {
          ctx.generation.completeResult = next;
          ctx.generation.completeResultSettings = JSON.stringify(ctx.generation.generateSettings);
        }
        ctx.syncGenerateControls();
      });
      break;
    }
    case "layoutSelect:change": {
      ctx.scope.listen(ctx.layoutSelect, "change", () => {
        const val = ctx.layoutSelect.value as CityLayout;
        ctx.generation.generateSettings.layout = val;
        ctx.generation.generateSettings.config.layout = val;
      });
      break;
    }
    case "buildingPatternSelect:change": {
      ctx.scope.listen(ctx.buildingPatternSelect, "change", () => {
        ctx.generation.generateSettings.buildingPattern = ctx.buildingPatternSelect.value as "legacy" | "medieval";
        ctx.generation.completeResult = null;
        clearGenerationPreviewCache();
      });
      break;
    }
    case "coastSelect:change": {
      ctx.scope.listen(ctx.coastSelect, "change", () => {
        ctx.generation.generateSettings.config.coast = ctx.coastSelect.value as SiteConfig["coast"];
        ctx.generation.generateSettings.config.rivers = riversForCount(
          ctx.generation.generateSettings.config,
          ctx.generation.generateSettings.config.rivers.length
        );
      });
      break;
    }
    case "seaWallSelect:change": {
      ctx.scope.listen(ctx.seaWallSelect, "change", () => {
        ctx.generation.generateSettings.config.wall.coast = ctx.seaWallSelect.value as WallCoastChoice;
        ctx.generation.completeResult = null;
        clearGenerationPreviewCache();
      });
      break;
    }
    case "wallMaterialSelect:change": {
      ctx.scope.listen(ctx.wallMaterialSelect, "change", () => {
        ctx.generation.generateSettings.config.wall.material = ctx.wallMaterialSelect.value as WallMaterialChoice;
        ctx.generation.completeResult = null;
        clearGenerationPreviewCache();
      });
      break;
    }
    case "riversSelect:change": {
      ctx.scope.listen(ctx.riversSelect, "change", () => {
        ctx.generation.generateSettings.config.rivers = riversForCount(
          ctx.generation.generateSettings.config,
          Number(ctx.riversSelect.value)
        );
      });
      break;
    }
    case "riverPlacementSelect:change": {
      ctx.scope.listen(ctx.riverPlacementSelect, "change", () => {
        ctx.generation.generateSettings.riverPlacement = ctx.riverPlacementSelect
          .value as GenerationSettings["riverPlacement"];
        ctx.generation.completeResult = null;
        clearGenerationPreviewCache();
      });
      break;
    }
    case "stageSlider:input": {
      ctx.scope.listen(ctx.stageSlider, "input", () => {
        const step = Number(ctx.stageSlider.value);
        ctx.setStageStep(step);
      });
      break;
    }
    case "urbanNPatchesInput:change": {
      ctx.scope.listen(ctx.urbanNPatchesInput, "change", () => {
        const raw = ctx.urbanNPatchesInput.value.trim();
        if (raw === "") {
          ctx.generation.generateSettings.urbanNPatches = undefined;
          return;
        }
        const n = Math.round(Number(raw));
        if (!Number.isFinite(n) || n < 1) {
          ctx.urbanCoreModeSelect.value = ctx.generation.generateSettings.urbanCoreMode ?? "legacy";
          ctx.urbanNPatchesInput.value =
            ctx.generation.generateSettings.urbanNPatches != null
              ? String(ctx.generation.generateSettings.urbanNPatches)
              : "";
          return;
        }
        ctx.generation.generateSettings.urbanNPatches = n;
      });
      break;
    }
    case "urbanCoreModeSelect:change": {
      ctx.scope.listen(ctx.urbanCoreModeSelect, "change", () => {
        ctx.generation.generateSettings.urbanCoreMode = ctx.urbanCoreModeSelect.value as "legacy" | "compact";
        ctx.generation.completeResult = null;
        clearGenerationPreviewCache();
        ctx.generation.completeResultSettings = null;
        ctx.rerunLastStage();
      });
      break;
    }
    case "walledShareInput:change": {
      ctx.scope.listen(ctx.walledShareInput, "change", () => {
        const raw = ctx.walledShareInput.value.trim();
        const n = Number(raw);
        if (!raw) ctx.generation.generateSettings.walledAreaShare = undefined;
        else if (Number.isFinite(n) && n >= 5 && n <= 100) ctx.generation.generateSettings.walledAreaShare = n / 100;
        ctx.walledShareInput.value =
          ctx.generation.generateSettings.walledAreaShare === undefined
            ? ""
            : String(ctx.generation.generateSettings.walledAreaShare * 100);
      });
      break;
    }
    case "townWallBuildOrderSelect:change": {
      ctx.scope.listen(ctx.townWallBuildOrderSelect, "change", () => {
        ctx.generation.generateSettings.townWallBuildOrder =
          ctx.townWallBuildOrderSelect.value === "inner-first" ? "inner-first" : undefined;
        delete ctx.generation.generateSettings.townWallDefensePolicy;
        ctx.generation.completeResult = null;
        clearGenerationPreviewCache();
        ctx.generation.completeResultSettings = null;
        ctx.syncStageUi(ctx.generation.currentStageStep);
      });
      break;
    }
    case "townWallRingsSelect:change": {
      ctx.scope.listen(ctx.townWallRingsSelect, "change", () => {
        const value = ctx.townWallRingsSelect.value;
        ctx.generation.generateSettings.townWallRings =
          value === "single" ? (ctx.inferredHistoryWalls() ? "single" : undefined) : "double";
        ctx.generation.generateSettings.innerWallState = value === "razed" ? "razed" : undefined;
        ctx.townWallBuildOrderSelect.disabled = value === "single";
        ctx.generation.completeResult = null;
        clearGenerationPreviewCache();
        ctx.generation.completeResultSettings = null;
        ctx.syncStageUi(ctx.generation.currentStageStep);
      });
      break;
    }
    case "farNodeSelect:change": {
      ctx.scope.listen(ctx.farNodeSelect, "change", () => {
        ctx.generation.streets.farNode = ctx.farNodeSelect.value as FarNodeMode;
        ctx.syncBearingsRow();
      });
      break;
    }
    case "bearingsInput:change": {
      ctx.scope.listen(ctx.bearingsInput, "change", () => {
        const parsed = ctx.bearingsInput.value
          .split(/[,\s]+/)
          .map(s => Number(s))
          .filter(n => Number.isFinite(n));
        ctx.generation.streets.manualBearings = parsed.length ? parsed.map(n => ((n % 360) + 360) % 360) : undefined;
        ctx.bearingsInput.value = ctx.generation.streets.manualBearings?.map(n => String(n)).join(", ") ?? "";
      });
      break;
    }
    case "renderQualitySelect:change": {
      ctx.scope.listen(ctx.renderQualitySelect, "change", () => ctx.redrawMap());
      break;
    }
    case "seedInput:input": {
      ctx.scope.listen(ctx.seedInput, "input", () => {
        ctx.generation.generateSeed = ctx.seedInput.value;
      });
      break;
    }
    case "seedInput:keydown": {
      ctx.scope.listen(ctx.seedInput, "keydown", event => {
        if (event.key !== "Enter") return;
        event.preventDefault();
        if (!ctx.generation.generateSeed.trim()) ctx.generation.generateSeed = randomSeed();
        ctx.seedInput.value = ctx.generation.generateSeed;
        ctx.runCompleteGeneration();
      });
      break;
    }
  }
}

export type PanelBinding =
  | "landmarkSelect:change"
  | "landmarkAngle:change"
  | "landmarkFile:change"
  | "shipSelect:change"
  | "shipSizeInput:input"
  | "shipAngle:input"
  | "hexSizeInput:input"
  | "gridKindSelect:change"
  | "showLabelsInput:change"
  | "brushSizeInput:input"
  | "eraseTargetInput:change"
  | "junctionMaxGapInput:input"
  | "gridEvoSlider:input"
  | "currentBuildingPatternSelect:change"
  | "historicalPeriodSelect:change"
  | "layoutSelect:change"
  | "buildingPatternSelect:change"
  | "coastSelect:change"
  | "seaWallSelect:change"
  | "wallMaterialSelect:change"
  | "riversSelect:change"
  | "riverPlacementSelect:change"
  | "stageSlider:input"
  | "urbanNPatchesInput:change"
  | "urbanCoreModeSelect:change"
  | "walledShareInput:change"
  | "townWallBuildOrderSelect:change"
  | "townWallRingsSelect:change"
  | "farNodeSelect:change"
  | "bearingsInput:change"
  | "renderQualitySelect:change"
  | "seedInput:input"
  | "seedInput:keydown";
