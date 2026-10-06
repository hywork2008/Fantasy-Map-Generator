import calibration from "../data/foodClimateCalibration.json";

export type EstimatedFoodSoil = "loam" | "alluvial" | "humus" | "clay" | "sandy" | "thin";

function bracket(axis: readonly number[], value: number): [number, number, number] {
  const finite = Number.isFinite(value) ? value : axis[0];
  if (finite <= axis[0]) return [0, 0, 0];
  for (let i = 1; i < axis.length; i++) {
    if (finite <= axis[i]) return [i - 1, i, (finite - axis[i - 1]) / (axis[i] - axis[i - 1])];
  }
  return [axis.length - 1, axis.length - 1, 0];
}

/** Offline-measured mean kg/sown ha. Contains no crop selection or extension runtime dependency. */
export function estimateFoodClimateYield(
  temperature: number,
  precipitation: number,
  soil: EstimatedFoodSoil,
  irrigationSupplement = 0,
  irrigatedShare = 0,
  amplitudeC = 0
): number {
  const t = bracket(calibration.temperatures, temperature);
  const a = bracket(calibration.amplitudes, amplitudeC);
  const p = bracket(calibration.rainfall, precipitation);
  const w = bracket(calibration.water, Math.max(0, irrigationSupplement));
  const soilIndex = Math.max(0, calibration.soils.indexOf(soil));
  const share = Number.isFinite(irrigatedShare) ? Math.max(0, Math.min(1, irrigatedShare)) : 0;
  let value = 0;
  for (let ti = 0; ti < 2; ti++)
    for (let ai = 0; ai < 2; ai++)
      for (let pi = 0; pi < 2; pi++)
        for (let wi = 0; wi < 2; wi++) {
          const weight =
            (ti ? t[2] : 1 - t[2]) * (ai ? a[2] : 1 - a[2]) * (pi ? p[2] : 1 - p[2]) * (wi ? w[2] : 1 - w[2]);
          const index =
            (((t[ti] * calibration.amplitudes.length + a[ai]) * calibration.rainfall.length + p[pi]) *
              calibration.water.length +
              w[wi]) *
              2 *
              calibration.soils.length +
            soilIndex;
          const dry = calibration.values[index];
          const irrigated = calibration.values[index + calibration.soils.length];
          value += weight * (dry * (1 - share) + irrigated * share);
        }
  return Math.max(0, value);
}

/** Nearest measured irrigation target, in the map's 100 mm precipitation units. */
export function estimateFoodWaterTarget(
  temperature: number,
  precipitation: number,
  soil: EstimatedFoodSoil,
  amplitudeC = 0
): number {
  const t = bracket(calibration.temperatures, temperature);
  const p = bracket(calibration.rainfall, precipitation);
  const ti = t[t[2] < 0.5 ? 0 : 1];
  const pi = p[p[2] < 0.5 ? 0 : 1];
  const a = bracket(calibration.amplitudes, amplitudeC);
  const ai = a[a[2] < 0.5 ? 0 : 1];
  const s = Math.max(0, calibration.soils.indexOf(soil));
  return Math.max(
    precipitation,
    calibration.targets[
      ((ti * calibration.amplitudes.length + ai) * calibration.rainfall.length + pi) * calibration.soils.length + s
    ]
  );
}
