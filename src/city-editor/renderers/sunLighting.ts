import * as THREE from "three";

export interface SunSettings {
  enabled: boolean;
  azimuth: number;
  elevation: number;
  intensity: number;
  color: string;
  shadows: boolean;
}

export const DEFAULT_SUN: Readonly<SunSettings> = {
  enabled: false,
  azimuth: 110,
  elevation: 55,
  intensity: 115,
  color: "#ffffff",
  shadows: true
};
const STORAGE_KEY = "fmg-city-editor:sun-lighting";

export function normalizeSun(value: Partial<SunSettings>): SunSettings {
  const number = (value: unknown, fallback: number, min: number, max: number) =>
    typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
  return {
    enabled: typeof value.enabled === "boolean" ? value.enabled : false,
    azimuth: number(value.azimuth, DEFAULT_SUN.azimuth, 0, 360),
    elevation: number(value.elevation, DEFAULT_SUN.elevation, 1, 90),
    intensity: number(value.intensity, DEFAULT_SUN.intensity, 0, 300),
    color:
      typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color)
        ? value.color.toLowerCase()
        : DEFAULT_SUN.color,
    shadows: typeof value.shadows === "boolean" ? value.shadows : DEFAULT_SUN.shadows
  };
}

export function readSunSettings(): SunSettings {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    return normalizeSun(value && typeof value === "object" ? value : {});
  } catch {
    return { ...DEFAULT_SUN };
  }
}

export function writeSunSettings(settings: SunSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked: settings last for this view only.
  }
}

/** North is plan +Y (world -Z); bearings increase clockwise toward east. */
export function sunDirection(settings: SunSettings): THREE.Vector3 {
  const azimuth = THREE.MathUtils.degToRad(settings.azimuth);
  const elevation = THREE.MathUtils.degToRad(settings.elevation);
  return new THREE.Vector3(
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    -Math.cos(azimuth) * Math.cos(elevation)
  );
}

/** Fit every caster into light space, including long shadows at low solar elevations. */
export function updateSun(sun: THREE.DirectionalLight, bounds: THREE.Box3, settings: SunSettings): void {
  const center = bounds.getCenter(new THREE.Vector3());
  const radius = Math.max(20, bounds.getSize(new THREE.Vector3()).length() / 2);
  sun.target.position.copy(center);
  sun.position
    .copy(center)
    .addScaledVector(
      settings.enabled ? sunDirection(settings) : new THREE.Vector3(1, 1.6, 0.4).normalize(),
      radius * 3
    );
  sun.intensity = settings.enabled ? settings.intensity / 100 : 1.15;
  sun.color.set(settings.enabled ? settings.color : DEFAULT_SUN.color);
  sun.castShadow = settings.enabled && settings.shadows;
  sun.target.updateMatrixWorld();
  sun.updateMatrixWorld();
  const camera = sun.shadow.camera;
  camera.position.copy(sun.position);
  camera.lookAt(center);
  camera.updateMatrixWorld();
  const lightBounds = bounds.clone().applyMatrix4(camera.matrixWorldInverse);
  const margin = Math.max(2, radius * 0.01);
  camera.left = lightBounds.min.x - margin;
  camera.right = lightBounds.max.x + margin;
  camera.bottom = lightBounds.min.y - margin;
  camera.top = lightBounds.max.y + margin;
  camera.near = Math.max(0.1, -lightBounds.max.z - margin);
  camera.far = Math.max(camera.near + 1, -lightBounds.min.z + margin);
  camera.updateProjectionMatrix();
  sun.shadow.normalBias = 0.15;
  sun.shadow.bias = -0.00005;
  sun.shadow.needsUpdate = true;
}
