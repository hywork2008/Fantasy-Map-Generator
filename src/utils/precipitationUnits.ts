/** Display calibration for FMG's stored 0–255 annual precipitation proxy. */
export const ANNUAL_PRECIPITATION_MILLIMETERS_PER_PROXY_UNIT = 100;

/** Converts the stored annual precipitation proxy into the millimetre values shown to users. */
export function precipitationProxyToMillimeters(precipitation: number): number {
  return precipitation * ANNUAL_PRECIPITATION_MILLIMETERS_PER_PROXY_UNIT;
}
