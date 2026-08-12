/**
 * Deterministic annual precipitation proxy generation.
 *
 * The model deliberately returns the persisted 0–255 proxy only after all
 * moisture paths have been accumulated in floating-point precision. Keeping
 * the calculation here free of SVG work makes its climate contract testable.
 */
export interface PrecipitationModelInput {
  readonly cellsX: number;
  readonly cellsY: number;
  readonly elevations: ArrayLike<number>;
  readonly temperatures: ArrayLike<number>;
  readonly latN: number;
  readonly latS: number;
  readonly latT: number;
  readonly winds: readonly number[];
  /** Grid-density correction; it must not include the precipitation setting. */
  readonly resolutionModifier: number;
  /** World Configurator global atmospheric-moisture setting, where 100 is standard. */
  readonly precipitationPercent: number;
  readonly randomInteger: (min: number, max: number) => number;
}

export interface PrecipitationWindDirections {
  readonly westerly: readonly PrecipitationWindSource[];
  readonly easterly: readonly PrecipitationWindSource[];
  readonly northerly: boolean;
  readonly southerly: boolean;
}

export interface PrecipitationWindSource {
  readonly cellId: number;
  readonly windTier: number;
}

export interface PrecipitationModelResult {
  /** Annual precipitation proxy, saturated rather than wrapped into the 0–255 persistence range. */
  readonly precipitation: Uint8Array;
  readonly windDirections: PrecipitationWindDirections;
}

const LATITUDE_MODIFIERS = [4, 2, 2, 2, 1, 1, 2, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1, 0.5] as const;
const MAX_PASSABLE_ELEVATION = 85;
const MAX_PRECIPITATION_PROXY = 255;

/**
 * Resolves all wind paths into one annual precipitation field.
 *
 * Increasing `precipitationPercent` only increases atmospheric water. Terrain,
 * path length, and the per-step release rate remain stable, so a wetter input
 * cannot make an otherwise identical cell drier.
 */
export function generateAnnualPrecipitation(input: PrecipitationModelInput): PrecipitationModelResult {
  const {
    cellsX,
    cellsY,
    elevations,
    temperatures,
    latN,
    latS,
    latT,
    winds,
    resolutionModifier,
    precipitationPercent,
    randomInteger
  } = input;
  const cellCount = elevations.length;
  const precipitation = new Float32Array(cellCount);
  const moistureMultiplier = Math.max(0, precipitationPercent) / 100;
  const safeResolutionModifier = Math.max(resolutionModifier, Number.EPSILON);
  const westerly: PrecipitationWindSource[] = [];
  const easterly: PrecipitationWindSource[] = [];
  let northerlyCount = 0;
  let southerlyCount = 0;

  for (let firstCell = 0, row = 0; firstCell < cellCount; firstCell += cellsX, row++) {
    const latitude = latN - (row / cellsY) * latT;
    const windTier = Math.floor(Math.abs(latitude - 89) / 30);
    const { isWest, isEast, isNorth, isSouth } = getWindDirections(winds[windTier] ?? 0);

    if (isWest) westerly.push({ cellId: firstCell, windTier });
    if (isEast) easterly.push({ cellId: firstCell + cellsX - 1, windTier });
    if (isNorth) northerlyCount++;
    if (isSouth) southerlyCount++;
  }

  const baseHorizontalHumidity = 120 * safeResolutionModifier * moistureMultiplier;
  const sourceHumidityCap = MAX_PRECIPITATION_PROXY * moistureMultiplier;
  passWind(
    westerly.map(source => ({ ...source, latitudeModifier: getLatitudeModifier(getLatitudeForCell(source.cellId)) })),
    baseHorizontalHumidity,
    1,
    cellsX,
    sourceHumidityCap
  );
  passWind(
    easterly.map(source => ({ ...source, latitudeModifier: getLatitudeModifier(getLatitudeForCell(source.cellId)) })),
    baseHorizontalHumidity,
    -1,
    cellsX,
    sourceHumidityCap
  );

  const verticalCount = northerlyCount + southerlyCount;
  if (northerlyCount) {
    const latitudeModifier = latT > 60 ? meanLatitudeModifier() : getLatitudeModifier(latN);
    const maximumHumidity =
      (northerlyCount / verticalCount) * 60 * safeResolutionModifier * latitudeModifier * moistureMultiplier;
    passWind(range(cellsX), maximumHumidity, cellsX, cellsY, maximumHumidity);
  }
  if (southerlyCount) {
    const latitudeModifier = latT > 60 ? meanLatitudeModifier() : getLatitudeModifier(latS);
    const maximumHumidity =
      (southerlyCount / verticalCount) * 60 * safeResolutionModifier * latitudeModifier * moistureMultiplier;
    passWind(rangeFrom(cellCount - cellsX, cellCount), maximumHumidity, -cellsX, cellsY, maximumHumidity);
  }

  const saturatedPrecipitation = new Uint8Array(cellCount);
  for (let cellId = 0; cellId < cellCount; cellId++) {
    saturatedPrecipitation[cellId] = saturatePrecipitation(precipitation[cellId]);
  }

  return {
    precipitation: saturatedPrecipitation,
    windDirections: { westerly, easterly, northerly: northerlyCount > 0, southerly: southerlyCount > 0 }
  };

  function getLatitudeForCell(cellId: number): number {
    const row = Math.floor(cellId / cellsX);
    return latN - (row / cellsY) * latT;
  }

  function passWind(
    sources: readonly ({ readonly cellId: number; readonly latitudeModifier: number } | number)[],
    maximumHumidity: number,
    next: number,
    steps: number,
    humidityCap: number
  ): void {
    for (const source of sources) {
      const sourceCell = typeof source === "number" ? source : source.cellId;
      const sourceMaximumHumidity =
        typeof source === "number" ? maximumHumidity : Math.min(maximumHumidity * source.latitudeModifier, humidityCap);
      let humidity = sourceMaximumHumidity - (elevations[sourceCell] ?? 0);
      if (humidity <= 0) continue;

      for (
        let step = 0, current = sourceCell;
        step < steps && current >= 0 && current < cellCount;
        step++, current += next
      ) {
        if ((temperatures[current] ?? -128) < -5) continue;

        const nextCell = current + next;
        const nextElevation = elevations[nextCell];
        if ((elevations[current] ?? 0) < 20) {
          if (nextElevation !== undefined && nextElevation >= 20) {
            precipitation[nextCell] += Math.max(humidity / randomInteger(10, 20), 1);
          } else {
            const recharge = 5 * safeResolutionModifier * moistureMultiplier;
            humidity = Math.min(humidity + recharge, sourceMaximumHumidity);
            precipitation[current] += recharge;
          }
          continue;
        }

        const isPassable = nextElevation !== undefined && nextElevation <= MAX_PASSABLE_ELEVATION;
        const rainfall = isPassable ? getRainfall(humidity, current, nextCell) : humidity;
        precipitation[current] += rainfall;
        const evaporation = rainfall > 1.5 ? 1 : 0;
        humidity = isPassable ? clamp(humidity - rainfall + evaporation, 0, sourceMaximumHumidity) : 0;
      }
    }
  }

  function getRainfall(humidity: number, current: number, nextCell: number): number {
    const normalLoss = Math.max(humidity / (10 * safeResolutionModifier), 1);
    const elevationDifference = Math.max((elevations[nextCell] ?? 0) - (elevations[current] ?? 0), 0);
    const terrainModifier = ((elevations[nextCell] ?? 0) / 70) ** 2;
    return clamp(normalLoss + elevationDifference * terrainModifier, 1, humidity);
  }
}

function getLatitudeModifier(latitude: number): number {
  const band = Math.max(0, Math.min(LATITUDE_MODIFIERS.length - 1, Math.floor((Math.abs(latitude) - 1) / 5)));
  return LATITUDE_MODIFIERS[band];
}

function meanLatitudeModifier(): number {
  return LATITUDE_MODIFIERS.reduce((sum, modifier) => sum + modifier, 0) / LATITUDE_MODIFIERS.length;
}

function getWindDirections(angle: number) {
  return {
    isWest: angle > 40 && angle < 140,
    isEast: angle > 220 && angle < 320,
    isNorth: angle > 100 && angle < 260,
    isSouth: angle > 280 || angle < 80
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function saturatePrecipitation(value: number): number {
  return Math.min(MAX_PRECIPITATION_PROXY, Math.max(0, Math.floor(value)));
}

function range(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

function rangeFrom(start: number, end: number): number[] {
  return Array.from({ length: Math.max(0, end - start) }, (_, index) => start + index);
}
