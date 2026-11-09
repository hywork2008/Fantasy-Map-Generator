/** Dwellings the CE perimeter layout actually adopts per square metre of site per storey, fitted to synthetic
 * sites of radius 150–600 m (two seeds, three storeys, every lot built; generation v8): dwellings ≈ k·s·π(r − e)².
 * The fit is within 7% at every measured radius. */
export const MESHLESS_DWELLINGS_PER_M2_STOREY = 0.0068;
/** Rim of the site where no lot is laid out (district streets and setbacks along the boundary). */
export const MESHLESS_SITE_RIM_METERS = 12;
/** Covers the fit's spread between seeds and radii (±7%) and the rim an automatic wall takes. */
const MARGIN = 1.15;

/** Below 150 m the rim and the street-block layout take far more of the site than the fit assumes (measured
 * 2026-11-09, two seeds, every lot built, automatic wall): dwellings per storey adopted at each radius. At 150 m
 * the table meets the fit, which takes over above it. */
const SMALL_SITE_DWELLINGS_PER_STOREY: [radiusMeters: number, dwellings: number][] = [
  [45, 9],
  [60, 30],
  [80, 58],
  [100, 73],
  [125, 155],
  [150, MESHLESS_DWELLINGS_PER_M2_STOREY * Math.PI * (150 - MESHLESS_SITE_RIM_METERS) ** 2]
];

/** Radius of a round site whose CE lots, built at `lotOccupancy`, hold `requiredDwellings`, with `reservedM2`
 * of land (civic centre, reservations, placements) that holds no lot. */
export function meshlessCityRadius(
  requiredDwellings: number,
  storeys: number,
  lotOccupancy = 1,
  reservedM2 = 0
): number {
  const perStorey =
      (Math.max(1, requiredDwellings) * MARGIN) / (Math.max(1, storeys) * Math.min(1, Math.max(0.1, lotOccupancy))),
    reserved = Math.max(0, reservedM2) / Math.PI,
    table = SMALL_SITE_DWELLINGS_PER_STOREY;
  if (perStorey < table.at(-1)![1]) {
    const i = Math.max(
        1,
        table.findIndex(([, n]) => n >= perStorey)
      ),
      [r0, n0] = table[i - 1],
      [r1, n1] = table[i],
      housing = perStorey <= n0 ? r0 : r0 + ((r1 - r0) * (perStorey - n0)) / (n1 - n0);
    return Math.sqrt(housing ** 2 + reserved);
  }
  return MESHLESS_SITE_RIM_METERS + Math.sqrt(perStorey / MESHLESS_DWELLINGS_PER_M2_STOREY / Math.PI + reserved);
}
