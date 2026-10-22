import * as THREE from "three";
import { expect, it, vi } from "vitest";
import {
  AIRSHIP,
  createAirship,
  createHotAirBalloon,
  createSteamLocomotive,
  HOT_AIR_BALLOON,
  STEAM_LOCOMOTIVE
} from "./industrialVehicles";

it.each([
  [HOT_AIR_BALLOON, createHotAirBalloon],
  [AIRSHIP, createAirship],
  [STEAM_LOCOMOTIVE, createSteamLocomotive]
] as const)("keeps $name within its display envelope and a low-poly budget", (definition, create) => {
  const model = create();
  const bounds = new THREE.Box3().setFromObject(model.group);
  const size = bounds.getSize(new THREE.Vector3());
  expect(bounds.min.y).toBeGreaterThanOrEqual(-0.001);
  expect(bounds.max.y).toBeLessThanOrEqual(definition.height + 0.001);
  expect(size.x).toBeLessThanOrEqual(definition.length + 0.001);
  expect(size.z).toBeLessThanOrEqual(definition.width + 0.001);
  const triangles = model.pickables.reduce(
    (sum, mesh) => sum + (mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count) / 3,
    0
  );
  expect(triangles).toBeLessThan(6000);
  expect(model.plan + model.elevation).not.toMatch(/NaN|Infinity|undefined/);
  expect(model.plan).toContain("<path");
  expect(model.elevation).toContain("<path");
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const mesh of model.pickables) {
    resources.add(mesh.geometry);
    for (const material of [mesh.material].flat()) resources.add(material);
  }
  const disposals = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  model.dispose();
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
});

it("leaves the passenger basket open below the burner", () => {
  const model = createHotAirBalloon();
  const ray = new THREE.Raycaster(new THREE.Vector3(0.5, 2, 0), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObjects(model.pickables)[0].object.name).toBe("basket-floor");
  model.dispose();
});

it("rests the locomotive wheel treads on the display rails", () => {
  const model = createSteamLocomotive();
  model.group.updateMatrixWorld(true);
  const rails = model.pickables.filter(mesh => mesh.name === "rail").map(mesh => new THREE.Box3().setFromObject(mesh));
  for (const wheel of model.pickables.filter(mesh => mesh.name === "wheel-tread")) {
    const bounds = new THREE.Box3().setFromObject(wheel);
    const rail = rails.find(rail => bounds.min.z < rail.max.z && bounds.max.z > rail.min.z);
    expect(rail).toBeDefined();
    expect(bounds.min.y).toBeCloseTo(rail!.max.y);
  }
  model.dispose();
});
