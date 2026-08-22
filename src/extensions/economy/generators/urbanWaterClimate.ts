import type { WorldContext } from "../../../context/worldContext";
import { getSeasonalTemperatureOffset } from "../../../utils/seasonUtils";
import type { Burg } from "../../hostTypes";

/** A winter freeze with a short warm season; exposed treatment must be stored or seasonal. */
export const SEASONAL_COLD_WINTER_C = -15;
export const SEASONAL_COLD_SUMMER_C = 10;

/**
 * True where the local seasonal range has the cold-winter / usable-summer pattern used by
 * covered Giant sewer storage. Missing map-coordinate data fails open for legacy fixtures.
 */
export function isSeasonalColdBurg(world: WorldContext, burg: Burg): boolean {
  const gridCell = world.pack.cells.g?.[burg.cell] ?? burg.cell;
  const annualTemperature = world.grid?.cells?.temp?.[gridCell];
  const point = world.pack.cells.p?.[burg.cell];
  const { latN, latT } = world.mapCoordinates;
  if (
    !Number.isFinite(annualTemperature) ||
    !point ||
    !Number.isFinite(latN) ||
    !Number.isFinite(latT) ||
    !world.graphHeight
  ) {
    return false;
  }

  const latitude = latN! - (point[1] / world.graphHeight) * latT!;
  const climate = {
    temperatureEquator: world.options.temperatureEquator,
    temperatureNorthPole: world.options.temperatureNorthPole,
    temperatureSouthPole: world.options.temperatureSouthPole
  };
  const january =
    annualTemperature + getSeasonalTemperatureOffset(latitude, 1, 1, 15, climate, world.options.axialTilt);
  const july = annualTemperature + getSeasonalTemperatureOffset(latitude, 1, 7, 15, climate, world.options.axialTilt);
  return Math.min(january, july) <= SEASONAL_COLD_WINTER_C && Math.max(january, july) >= SEASONAL_COLD_SUMMER_C;
}

export function getSeasonalColdBurgIds(
  world: WorldContext,
  burgs: readonly (Burg | undefined)[],
  burgIds: Iterable<number>
): Set<number> {
  const result = new Set<number>();
  for (const burgId of burgIds) {
    const burg = burgs[burgId];
    if (burg?.i && isSeasonalColdBurg(world, burg)) result.add(burgId);
  }
  return result;
}
