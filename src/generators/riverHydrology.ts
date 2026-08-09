import type { WorldContext } from "../context/worldContext";
import { useOptionsState } from "../store/optionsState";
import type { River, RiverCellHydrology } from "../types/models";
import { heightToMeters, normalizeHeightExponent } from "../utils/height";
import { rn } from "../utils/numberUtils";

const MIN_RIVER_LENGTH_KM = 0.01;
const MIN_VELOCITY_MPS = 0.1;
const MAX_VELOCITY_MPS = 12;

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
  world: Pick<WorldContext, "pack" | "grid" | "distanceScale">
): void {
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

  uniqueCells.forEach((cellId, index) => {
    const progress = index / finalIndex;
    const localGradient = Math.max(0.00002, baseGradient * (1 - progress * 0.55));
    const channelWidth = sourceWidth + (mouthWidth - sourceWidth) * progress;
    const widthSlowdown = clamp(Math.sqrt(sourceWidth / channelWidth), 0.25, 1);
    const surfaceVelocity = clamp(
      MIN_VELOCITY_MPS + Math.sqrt(localGradient) * 9 * dischargeFactor * widthSlowdown,
      MIN_VELOCITY_MPS,
      MAX_VELOCITY_MPS
    );
    const gridCell = packedCells?.g?.[cellId];
    const ambientTemperature =
      gridCell === undefined ? sourceWaterTemperature : (world.grid?.cells?.temp?.[gridCell] ?? sourceWaterTemperature);
    const ambientMix = progress * 0.8;

    cellHydrology[cellId] = {
      surfaceVelocity: rn(surfaceVelocity, 2),
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
export function refreshAllRiverHydrology(world: Pick<WorldContext, "pack" | "grid" | "distanceScale">): void {
  world.pack.rivers.forEach(river => {
    refreshRiverHydrology(river, world);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isFiniteNonNegative(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
