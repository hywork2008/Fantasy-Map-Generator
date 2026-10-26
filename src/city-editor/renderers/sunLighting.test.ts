import * as THREE from "three";
import { expect, it } from "vitest";
import { DEFAULT_SUN, normalizeSun, sunDirection, updateSun } from "./sunLighting";

it("maps compass bearings to the city frame independently of the camera", () => {
  for (const [azimuth, x, z] of [
    [0, 0, -1],
    [90, 1, 0],
    [180, 0, 1],
    [270, -1, 0],
    [360, 0, -1]
  ]) {
    const direction = sunDirection({ ...DEFAULT_SUN, azimuth, elevation: 30 });
    expect(direction.x).toBeCloseTo(x * Math.cos(Math.PI / 6));
    expect(direction.z).toBeCloseTo(z * Math.cos(Math.PI / 6));
    expect(direction.y).toBeCloseTo(0.5);
  }
});

it("contains terrain and buildings in the shadow camera at low and vertical sun angles", () => {
  const bounds = new THREE.Box3(new THREE.Vector3(-1200, -50, -800), new THREE.Vector3(600, 150, 1000));
  const sun = new THREE.DirectionalLight();
  for (const elevation of [1, 45, 90]) {
    updateSun(sun, bounds, { ...DEFAULT_SUN, enabled: true, elevation, azimuth: 270 });
    const camera = sun.shadow.camera;
    for (const x of [bounds.min.x, bounds.max.x])
      for (const y of [bounds.min.y, bounds.max.y])
        for (const z of [bounds.min.z, bounds.max.z]) {
          const projected = new THREE.Vector3(x, y, z).project(camera);
          expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
          expect(Math.abs(projected.z)).toBeLessThanOrEqual(1);
        }
  }
});

it("rejects non-finite stored settings and clamps supported ranges", () => {
  expect(normalizeSun({ azimuth: NaN, elevation: Infinity, intensity: -1 })).toEqual({ ...DEFAULT_SUN, intensity: 0 });
  expect(normalizeSun({ azimuth: 400, elevation: 0, intensity: 500 })).toEqual({
    enabled: false,
    azimuth: 360,
    elevation: 1,
    intensity: 300,
    color: "#ffffff",
    shadows: true
  });
});

it("restores a valid saved color and falls back safely for legacy or malformed settings", () => {
  expect(normalizeSun({ color: "#FF8A80" }).color).toBe("#ff8a80");
  expect(normalizeSun({}).color).toBe("#ffffff");
  expect(normalizeSun({ color: "invalid" }).color).toBe("#ffffff");
});
