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
  reservedM2 = 0,
  /** Land per dwelling against the compact lots the fit was made on: burgage plots keep yards behind their houses
   * (`burgageLandFactor`). */
  landFactor = 1
): number {
  const perStorey =
      (Math.max(1, requiredDwellings) * MARGIN * landFactor) /
      (Math.max(1, storeys) * Math.min(1, Math.max(0.1, lotOccupancy))),
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

/** Share of the interior's CE lots a walled town should build at the chosen occupancy (gate-ribbon plan §3.6). A lot
 * left empty inside the wall is a failed town (pre-acceptance U3), so the interior is sized to be built out, with
 * what the estimate misses going to the roadside beyond the gates. Raised from 0.8 on 2026-11-13, once lots trimmed
 * of the slivers they share no longer stood empty for a centimetre of rounding (one lot in seven). */
export const MESHLESS_TARGET_FILL = 1.0;

/** Share of the interior's lots a town of default settings actually built when sized by `meshlessCityRadius` alone,
 * by required dwellings (measured 2026-11-10, generation v17, round walls, two seeds, lot occupancy 1, every lot
 * inside the wall offered), refined once by the fill the corrected sizing reached (docs/analytics/
 * ce-meshless-gate-ribbon-w1a-20261110.md). The fit and the reserved civic and monastery land it adds leave room the
 * lots then take. Below about 50 dwellings the civic centre's own size sets the site, so the fill stays low. Towns of 100–250
 * dwellings vary most between seeds; their values lean to the larger site, so the seeds that fill least still house
 * everyone inside the wall. */
const MEASURED_FILL: [requiredDwellings: number, fill: number][] = [
  [23, 0.258],
  [45, 0.365],
  [78, 0.414],
  [112, 0.65],
  [167, 0.6],
  [223, 0.55],
  [334, 0.591],
  [445, 0.642],
  [667, 0.69],
  [1112, 0.755],
  [1778, 0.723],
  [2667, 0.678],
  [4445, 0.732],
  [6667, 0.715]
];

/** Factor on the site radius so the interior builds `MESHLESS_TARGET_FILL` of its lots. */
export function meshlessSiteFillScale(requiredDwellings: number): number {
  const t = MEASURED_FILL,
    n = Math.max(1, requiredDwellings);
  let fill: number;
  if (n <= t[0][0]) fill = t[0][1];
  else if (n >= t.at(-1)![0]) fill = t.at(-1)![1];
  else {
    const i = t.findIndex(([d]) => d >= n),
      [d0, f0] = t[i - 1],
      [d1, f1] = t[i];
    fill = f0 + ((f1 - f0) * (n - d0)) / (d1 - d0);
  }
  return Math.min(1, Math.sqrt(fill / MESHLESS_TARGET_FILL));
}
