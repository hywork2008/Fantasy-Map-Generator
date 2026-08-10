import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { River, RiverCellHydrology } from "../types/models";
import { heightToMeters, normalizeHeightExponent } from "../utils/height";
import { rn } from "../utils/numberUtils";

const MIN_RIVER_LENGTH_KM = 0.01;
const MIN_VELOCITY_MPS = 0.1;
const MAX_VELOCITY_MPS = 12;
const MEAN_TO_SURFACE_VELOCITY_RATIO = 0.8;
const RIVER_DEPTH_CALIBRATION_FACTOR = 1;
const MAX_DEPTH_MULTIPLIER_FROM_MOUTH = 1.5;
const residualFlowOptionsByRiver = new WeakMap<River, RiverHydrologyOptions>();

export interface RiverHydrologyOptions {
  /**
   * Post-withdrawal flow in a shared annual unit. When it contains river flow,
   * it replaces the natural generator flux for depth estimation only.
   */
  readonly residualFlowByCell?: Float32Array<ArrayBufferLike>;
  /** Converts one generator flux unit into the residual flow's annual unit. */
  readonly annualWaterPerFlux?: number;
}

/**
 * Populate river source conditions and per-cell surface values.
 *
 * The velocity estimate uses source-to-mouth elevation drop divided by real
 * map length as its primary slope term. It deliberately makes otherwise-equal
 * high, short rivers faster than low, long rivers, while wider downstream
 * channels reduce their surface velocity.
 */
export function refreshRiverHydrology(
  river: River,
  world: Pick<WorldContext, "pack" | "grid" | "distanceScale">,
  options: RiverHydrologyOptions = {}
): void {
  const effectiveOptions = options.residualFlowByCell ? options : (residualFlowOptionsByRiver.get(river) ?? options);
  const packedCells = world.pack.cells;
  const sourceCell = river.source;
  const sourceHeight = packedCells?.h?.[sourceCell] ?? 20;
  const heightExponent = normalizeHeightExponent(useOptionsState.getState().heightExponent);
  const sourceFeature = world.pack.features?.[packedCells?.f?.[sourceCell] ?? 0];
  const sourceElevationHeight =
    sourceFeature?.type === "lake" && Number.isFinite(sourceFeature.height) ? sourceFeature.height : sourceHeight;
  const sourceGridCell = packedCells?.g?.[sourceCell];
  const sourceAirTemperature = sourceGridCell === undefined ? 0 : (world.grid?.cells?.temp?.[sourceGridCell] ?? 0);
  const sourceTemperature =
    sourceFeature?.type === "lake" && Number.isFinite(sourceFeature.temp) ? sourceFeature.temp : sourceAirTemperature;

  const elevatedLakeSource = sourceFeature?.type === "lake" && sourceElevationHeight >= 20;
  const isLegacyLakeSourceAtSeaLevel =
    river.sourceElevationMode === undefined && elevatedLakeSource && river.sourceElevation === 0;
  if (
    !isFiniteNonNegative(river.sourceElevation) ||
    river.sourceElevationMode === "auto" ||
    isLegacyLakeSourceAtSeaLevel
  ) {
    river.sourceElevation = rn(heightToMeters(sourceElevationHeight, heightExponent), 1);
    river.sourceElevationMode = "auto";
  }
  if (!Number.isFinite(river.sourceWaterTemperature)) {
    river.sourceWaterTemperature = sourceTemperature;
  }

  const sourceElevation = river.sourceElevation ?? 0;
  const sourceWaterTemperature = river.sourceWaterTemperature ?? 0;
  const mouthHeight = packedCells?.h?.[river.mouth] ?? 20;
  const mouthElevation = heightToMeters(mouthHeight, heightExponent);
  const elevationDrop = Math.max(0, sourceElevation - mouthElevation);

  const cellCount = packedCells?.i?.length ?? 0;
  const orderedCells = (river.cells ?? []).filter(cellId => cellId >= 0 && cellId < cellCount);
  const uniqueCells = [...new Set(orderedCells)];
  const cellHydrology: Record<number, RiverCellHydrology> = {};
  const lengthKm = Math.max((river.length || 0) * (world.distanceScale || 1), MIN_RIVER_LENGTH_KM);
  const baseGradient = elevationDrop / (lengthKm * 1000);
  const dischargeFactor = clamp(0.8 + Math.log10(Math.max(1, river.discharge || 0)) / 5, 0.8, 1.4);
  const sourceWidth = Math.max(river.sourceWidth, 0.05);
  const mouthWidth = Math.max(river.width, sourceWidth);
  const finalIndex = Math.max(uniqueCells.length - 1, 1);
  const residualFlowByCell = effectiveOptions.residualFlowByCell;
  const hasResidualFlow = hasUsableResidualFlow(residualFlowByCell, effectiveOptions.annualWaterPerFlux);
  const mouthGradient = Math.max(0.00002, baseGradient * 0.45);
  const mouthSurfaceVelocity = getSurfaceVelocity({
    localGradient: mouthGradient,
    dischargeFactor,
    sourceWidth,
    channelWidth: mouthWidth
  });
  const mouthFlow = hasResidualFlow ? (residualFlowByCell[river.mouth] ?? 0) : river.discharge;
  const maximumWaterDepth =
    estimateWaterDepth({
      river,
      channelWidth: mouthWidth,
      surfaceVelocity: mouthSurfaceVelocity,
      distanceScale: world.distanceScale,
      naturalFlow: mouthFlow,
      residualFlow: hasResidualFlow ? mouthFlow : undefined,
      annualWaterPerFlux: hasResidualFlow ? effectiveOptions.annualWaterPerFlux : undefined
    }) * MAX_DEPTH_MULTIPLIER_FROM_MOUTH;

  uniqueCells.forEach((cellId, index) => {
    const progress = index / finalIndex;
    const localGradient = Math.max(0.00002, baseGradient * (1 - progress * 0.55));
    const naturalFlow = packedCells?.fl?.[cellId] ?? river.discharge;
    const channelWidth = getChannelWidth({
      sourceWidth,
      mouthWidth,
      progress,
      localFlow: naturalFlow,
      mouthFlow: river.discharge
    });
    const surfaceVelocity = getSurfaceVelocity({ localGradient, dischargeFactor, sourceWidth, channelWidth });
    const estimatedWaterDepth = estimateWaterDepth({
      river,
      channelWidth,
      surfaceVelocity,
      distanceScale: world.distanceScale,
      naturalFlow,
      residualFlow: hasResidualFlow ? residualFlowByCell[cellId] : undefined,
      annualWaterPerFlux: effectiveOptions.annualWaterPerFlux
    });
    const waterDepth = rn(Math.min(estimatedWaterDepth, maximumWaterDepth), 2);
    const gridCell = packedCells?.g?.[cellId];
    const ambientTemperature =
      gridCell === undefined ? sourceWaterTemperature : (world.grid?.cells?.temp?.[gridCell] ?? sourceWaterTemperature);
    const ambientMix = progress * 0.8;

    cellHydrology[cellId] = {
      surfaceVelocity: rn(surfaceVelocity, 2),
      waterDepth,
      waterTemperature: rn(sourceWaterTemperature * (1 - ambientMix) + ambientTemperature * ambientMix, 1)
    };
  });

  river.cellHydrology = cellHydrology;
}

/** Read a river's derived surface values for a particular packed cell. */
export function getRiverCellHydrology(river: River | undefined, cellId: number): RiverCellHydrology | null {
  return river?.cellHydrology?.[cellId] ?? null;
}

/** Backfill source settings and derived values after loading a legacy map. */
export function refreshAllRiverHydrology(
  world: Pick<WorldContext, "pack" | "grid" | "distanceScale">,
  options: RiverHydrologyOptions = {}
): void {
  world.pack.rivers.forEach(river => {
    refreshRiverHydrology(river, world, options);
  });
}

/** Applies economy-owned residual flows without serializing simulation-only water withdrawals into the map. */
export function applyRiverResidualFlows(
  world: Pick<WorldContext, "pack" | "grid" | "distanceScale">,
  options: RiverHydrologyOptions
): void {
  world.pack.rivers.forEach(river => {
    if (hasUsableResidualFlow(options.residualFlowByCell, options.annualWaterPerFlux)) {
      residualFlowOptionsByRiver.set(river, options);
    } else {
      residualFlowOptionsByRiver.delete(river);
    }
    refreshRiverHydrology(river, world, options);
  });
}

/** Removes economy-owned residual flows and restores depths estimated from natural flow. */
export function clearRiverResidualFlows(world: Pick<WorldContext, "pack" | "grid" | "distanceScale">): void {
  world.pack.rivers.forEach(river => {
    residualFlowOptionsByRiver.delete(river);
    refreshRiverHydrology(river, world);
  });
}

/**
 * A confluence can add most of a river's discharge in one cell. The visual
 * path grows by accumulated flux, so depth estimation must do the same rather
 * than retaining the narrow width implied by a tributary's path position.
 */
function getChannelWidth({
  sourceWidth,
  mouthWidth,
  progress,
  localFlow,
  mouthFlow
}: {
  readonly sourceWidth: number;
  readonly mouthWidth: number;
  readonly progress: number;
  readonly localFlow: number;
  readonly mouthFlow: number;
}): number {
  const pathWidth = sourceWidth + (mouthWidth - sourceWidth) * progress;
  const flowFraction = clamp(localFlow / Math.max(mouthFlow, localFlow, 1), 0, 1);
  const flowWidth = sourceWidth + (mouthWidth - sourceWidth) * flowFraction;
  return Math.max(pathWidth, flowWidth);
}

function getSurfaceVelocity({
  localGradient,
  dischargeFactor,
  sourceWidth,
  channelWidth
}: {
  readonly localGradient: number;
  readonly dischargeFactor: number;
  readonly sourceWidth: number;
  readonly channelWidth: number;
}): number {
  const widthSlowdown = clamp(Math.sqrt(sourceWidth / channelWidth), 0.25, 1);
  return clamp(
    MIN_VELOCITY_MPS + Math.sqrt(localGradient) * 9 * dischargeFactor * widthSlowdown,
    MIN_VELOCITY_MPS,
    MAX_VELOCITY_MPS
  );
}

function estimateWaterDepth({
  river,
  channelWidth,
  surfaceVelocity,
  distanceScale,
  naturalFlow,
  residualFlow,
  annualWaterPerFlux
}: {
  readonly river: River;
  readonly channelWidth: number;
  readonly surfaceVelocity: number;
  readonly distanceScale: number;
  readonly naturalFlow: number | undefined;
  readonly residualFlow: number | undefined;
  readonly annualWaterPerFlux: number | undefined;
}): number {
  const effectiveFlow =
    typeof residualFlow === "number" && Number.isFinite(residualFlow) && annualWaterPerFlux && annualWaterPerFlux > 0
      ? Math.max(0, residualFlow) / annualWaterPerFlux
      : Math.max(0, naturalFlow ?? river.discharge ?? 0);
  const widthMetres = Math.max(channelWidth * Math.max(distanceScale || 1, 0.001) * 1000, 0.1);
  const meanVelocity = Math.max(surfaceVelocity * MEAN_TO_SURFACE_VELOCITY_RATIO, MIN_VELOCITY_MPS);
  const depth = (effectiveFlow * RIVER_DEPTH_CALIBRATION_FACTOR) / (widthMetres * meanVelocity);
  return rn(Math.max(0, depth), 2);
}

function hasUsableResidualFlow(
  residualFlowByCell: Float32Array<ArrayBufferLike> | undefined,
  annualWaterPerFlux: number | undefined
): residualFlowByCell is Float32Array<ArrayBufferLike> {
  if (!residualFlowByCell?.length) return false;
  return (
    typeof annualWaterPerFlux === "number" &&
    Number.isFinite(annualWaterPerFlux) &&
    annualWaterPerFlux > 0 &&
    residualFlowByCell.some(flow => Number.isFinite(flow) && flow > 0)
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNonNegative(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
