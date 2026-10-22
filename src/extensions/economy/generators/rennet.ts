/**
 * FAO Animal Production and Health Paper 69, part III, VI.2:
 * two unweaned calf abomasa yield about 1 L of standardized 1:10,000 rennet.
 * https://www.fao.org/4/x6934f/X6934F03.htm
 * These are eligible stomachs, not unspecified Cattle market heads.
 */
export const RENNET_LITERS_PER_CALF_ABOMASUM = 0.5;
export const RENNET_LITERS_PER_BARREL = 120;

/** FAO Mediterranean cheesemaking, chapter III, table 7: 25 mL per 100 kg milk. */
export const RENNET_BARRELS_PER_CHEESE_LOT = 2.5 / RENNET_LITERS_PER_BARREL;

/** Keep sub-barrel yields unrounded: one stomach makes less than 0.01 barrel. */
export function rennetBarrelsFromCalfAbomasa(abomasa: number): number {
  if (!Number.isFinite(abomasa) || abomasa <= 0) return 0;
  return (abomasa * RENNET_LITERS_PER_CALF_ABOMASUM) / RENNET_LITERS_PER_BARREL;
}
