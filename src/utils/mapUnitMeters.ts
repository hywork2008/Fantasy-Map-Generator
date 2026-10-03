const UNIT_METERS: Record<string, number> = { km: 1000, mi: 1609.344, lg: 4828.032, vr: 1066.8, nmi: 1852 };
/** Same distance units as FMG river-width UI and CE site geometry. */
export function mapUnitMeters(distanceScale: number, distanceUnit = "km"): number {
  return distanceScale * (UNIT_METERS[distanceUnit] ?? 1000);
}
