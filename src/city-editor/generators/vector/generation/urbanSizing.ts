/** Dwellings the CE perimeter layout actually adopts per square metre of site per storey, fitted to synthetic
 * sites of radius 150–600 m (two seeds, three storeys, every lot built; generation v8): dwellings ≈ k·s·π(r − e)².
 * The fit is within 7% at every measured radius. */
export const MESHLESS_DWELLINGS_PER_M2_STOREY = 0.0068;
/** Rim of the site where no lot is laid out (district streets and setbacks along the boundary). */
export const MESHLESS_SITE_RIM_METERS = 12;
/** Covers the fit's spread between seeds and radii (±7%) and the rim an automatic wall takes. */
const MARGIN = 1.15;

/** Radius of a round site whose CE lots, built at `lotOccupancy`, hold `requiredDwellings`, with `reservedM2`
 * of land (civic centre, reservations, placements) that holds no lot. */
export function meshlessCityRadius(
  requiredDwellings: number,
  storeys: number,
  lotOccupancy = 1,
  reservedM2 = 0
): number {
  const perM2 = MESHLESS_DWELLINGS_PER_M2_STOREY * Math.max(1, storeys) * Math.min(1, Math.max(0.1, lotOccupancy));
  return (
    MESHLESS_SITE_RIM_METERS +
    Math.sqrt(((Math.max(1, requiredDwellings) * MARGIN) / perM2 + Math.max(0, reservedM2)) / Math.PI)
  );
}
