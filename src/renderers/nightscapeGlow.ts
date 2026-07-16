export interface NightscapePopulationGlow {
  /** Relative brightness from a barely visible settlement (0) to a star-like city (1). */
  intensity: number;
  /** A small fixed range used to batch halo point sizes and emissive materials. */
  level: number;
}

export const NIGHTSCAPE_GLOW_LEVELS = 5;

export interface NightscapeBeamPose {
  source: [number, number, number];
  target: [number, number, number];
  angle: number;
}

/**
 * Compresses city populations logarithmically so every settlement remains visible while the
 * largest city still reads as a bright landmark. The result is intentionally relative to the
 * currently rendered map, rather than depending on a world-size-specific population threshold.
 */
export function getNightscapePopulationGlow(
  population: number | undefined,
  largestPopulation: number
): NightscapePopulationGlow {
  const safePopulation = Math.max(1, Number.isFinite(population) ? (population ?? 1) : 1);
  const safeLargestPopulation = Math.max(1, largestPopulation);
  const normalized = Math.min(1, Math.log1p(safePopulation) / Math.log1p(safeLargestPopulation));
  const intensity = 0.06 + 0.94 * normalized ** 1.55;
  const level = Math.min(NIGHTSCAPE_GLOW_LEVELS - 1, Math.floor(intensity * NIGHTSCAPE_GLOW_LEVELS));

  return { intensity, level };
}

/**
 * Places one soft spotlight beyond the far side of the camera view and aims it back toward the
 * viewer. This gives all city meshes a shared, camera-relative light direction without creating
 * a point light per settlement or rendering a shadow map.
 */
export function getNightscapeBeamPose(
  cameraPosition: readonly [number, number, number],
  cameraDirection: readonly [number, number, number],
  mapWidth: number,
  mapHeight: number,
  cameraFovDegrees: number,
  cameraAspect: number,
  reverseDirection = false
): NightscapeBeamPose {
  const length = Math.hypot(cameraDirection[0], cameraDirection[1], cameraDirection[2]) || 1;
  const direction: [number, number, number] = [
    cameraDirection[0] / length,
    cameraDirection[1] / length,
    cameraDirection[2] / length
  ];
  const range = Math.max(600, Math.hypot(mapWidth, mapHeight) * 1.8);
  const horizontalFov = 2 * Math.atan(Math.tan((cameraFovDegrees * Math.PI) / 360) * cameraAspect);

  const farSide: [number, number, number] = [
    cameraPosition[0] + direction[0] * range,
    cameraPosition[1] + direction[1] * range,
    cameraPosition[2] + direction[2] * range
  ];
  const nearSide: [number, number, number] = [
    cameraPosition[0] - direction[0] * range * 0.25,
    cameraPosition[1] - direction[1] * range * 0.25,
    cameraPosition[2] - direction[2] * range * 0.25
  ];

  return {
    source: reverseDirection ? nearSide : farSide,
    target: reverseDirection ? farSide : nearSide,
    angle: Math.min(Math.PI / 2 - 0.05, Math.max(0.65, horizontalFov * 0.72))
  };
}
