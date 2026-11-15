import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedVariant } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { modelParts } from "../modelParts";
import { createGrokTrebuchet, GROK_TREBUCHET, grokTrebuchetParts } from "./grokTrebuchet";
import { createTrebuchet } from "./trebuchet";

function triangles(model: { pickables: readonly THREE.Mesh[] }) {
  let count = 0;
  for (const mesh of model.pickables) {
    const geometry = mesh.geometry;
    count += Math.floor((geometry.index?.count ?? geometry.getAttribute("position").count) / 3);
  }
  return count;
}

const AXIS = new THREE.Vector3(Math.cos(GROK_TREBUCHET.armAngle), Math.sin(GROK_TREBUCHET.armAngle), 0);
const point = (distance: number) => new THREE.Vector3(0, GROK_TREBUCHET.pivotHeight, 0).addScaledVector(AXIS, distance);

it("builds a cocked hinged-counterweight engine inside the shared envelope", () => {
  const model = createGrokTrebuchet();
  const codex = createTrebuchet();
  try {
    model.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model.group, true);
    const size = bounds.getSize(new THREE.Vector3());
    expect(bounds.min.y).toBeGreaterThanOrEqual(-1e-4);
    expect(bounds.min.y).toBeLessThan(0.02);
    expect(size.x).toBeLessThanOrEqual(GROK_TREBUCHET.length);
    expect(size.z).toBeLessThanOrEqual(GROK_TREBUCHET.width);
    expect(size.y).toBeLessThanOrEqual(GROK_TREBUCHET.height);
    expect(size.y).toBeGreaterThan(8);
    expect(triangles(model)).toBeGreaterThan(triangles(codex) * 2);
    const parts = modelParts(model.group);
    expect(parts.map(part => part.role)).toEqual([
      "chassis",
      "frames",
      "throwing arm",
      "counterweight",
      "sling and trough",
      "windlass"
    ]);
    expect(parts.every(part => part.author === "Grok 4.7" && part.quality === "high" && part.triangles > 0)).toBe(true);
    for (const mesh of model.pickables)
      for (const name of ["position", "normal"])
        expect(Array.from(mesh.geometry.getAttribute(name).array).every(Number.isFinite)).toBe(true);
    for (const view of ["side", "top"] as const) {
      const svg = meshProjection(model, view);
      expect(svg).toContain("<path");
      expect(svg).not.toMatch(/NaN|Infinity/);
    }
    expect(meshProjection(model, "side")).not.toBe(meshProjection(model, "top"));
  } finally {
    model.dispose();
    codex.dispose();
  }
});

it("keeps the raised chest clear of the frames and the shot in the trough", () => {
  const built = grokTrebuchetParts().map(part => part.create());
  try {
    const named = (name: string) => built.flatMap(part => part.pickables.filter(mesh => mesh.name === name));
    const box = (meshes: readonly THREE.Object3D[]) => {
      const bounds = new THREE.Box3();
      for (const mesh of meshes) bounds.union(new THREE.Box3().setFromObject(mesh));
      return bounds;
    };
    const heel = point(-GROK_TREBUCHET.shortArm);
    const tip = point(GROK_TREBUCHET.longArm);
    const arm = box(named("throwing-arm"));
    expect(arm.distanceToPoint(heel)).toBe(0);
    expect(arm.distanceToPoint(tip)).toBe(0);
    expect(tip.y).toBeLessThan(GROK_TREBUCHET.pivotHeight);
    expect(heel.y).toBeGreaterThan(GROK_TREBUCHET.pivotHeight);
    const hinge = named("counterweight-hinge")[0];
    expect(hinge.position.distanceTo(heel)).toBeCloseTo(0, 4);
    const chest = box(named("ballast-floor"));
    expect(chest.getCenter(new THREE.Vector3()).x).toBeCloseTo(heel.x, 2);
    expect(chest.max.y).toBeLessThan(hinge.position.y);
    expect(chest.min.y).toBeGreaterThan(4);
    const supports = ["frame-leg", "frame-tie", "frame-brace", "outrigger-brace", "bearing-block"].flatMap(named);
    const ballast = [
      "ballast-post",
      "ballast-plank",
      "ballast-floor",
      "ballast-band",
      "ballast-stone",
      "ballast-liner"
    ].flatMap(named);
    for (const load of ballast)
      for (const support of supports)
        expect(new THREE.Box3().setFromObject(load).intersectsBox(new THREE.Box3().setFromObject(support))).toBe(false);
    const shot = named("projectile")[0];
    const trough = box(named("loading-trough"));
    expect(shot.position.x).toBeGreaterThan(tip.x);
    expect(shot.position.x).toBeLessThan(trough.max.x);
    expect(shot.position.z).toBeCloseTo(0, 4);
    expect(shot.position.y).toBeGreaterThan(trough.max.y);
    const bearingHits = new THREE.Raycaster(
      new THREE.Vector3(0, GROK_TREBUCHET.pivotHeight, 5),
      new THREE.Vector3(0, 0, -1)
    ).intersectObjects(named("bearing-block"));
    expect(bearingHits.length).toBeGreaterThan(0);
    const union = new THREE.Box3();
    for (const part of built) union.union(new THREE.Box3().setFromObject(part.group, true));
    const full = createGrokTrebuchet();
    try {
      const assembled = new THREE.Box3().setFromObject(full.group, true);
      expect(assembled.min.distanceTo(union.min)).toBeLessThan(1e-4);
      expect(assembled.max.distanceTo(union.max)).toBeLessThan(1e-4);
    } finally {
      full.dispose();
    }
  } finally {
    for (const part of built) part.dispose();
  }
});

it("disposes its own merged resources once", () => {
  const model = createGrokTrebuchet();
  const other = createGrokTrebuchet();
  const resources = new Set<THREE.BufferGeometry | THREE.Material>();
  for (const mesh of model.pickables) {
    resources.add(mesh.geometry);
    for (const material of [mesh.material].flat()) resources.add(material);
  }
  const disposals = [...resources].map(resource => vi.spyOn(resource, "dispose"));
  const otherGeometry = vi.spyOn(other.pickables[0].geometry, "dispose");
  model.dispose();
  for (const spy of disposals) expect(spy).toHaveBeenCalledTimes(1);
  expect(otherGeometry).not.toHaveBeenCalled();
  other.dispose();
});

it("keeps City Editor on the Codex engine", () => {
  expect(adoptedVariant("object.trebuchet", "default").author).toBe("Codex GPT-6.1 Sol");
  expect(adoptedVariant("object.trebuchet", "high").author).toBe("Grok 4.7");
  expect(adoptedVariant("object.trebuchet", "high").level).toBe("high");
});
