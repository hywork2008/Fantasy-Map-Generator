import * as THREE from "three";
import { expect, it, vi } from "vitest";
import {
  createFriary,
  createMonastery,
  friaryPreviewPlan,
  monasteryPreviewPlan
} from "../../buildings/monasteries/friary";
import { fitMonastery } from "../../city-editor/generators/monasteryLayout";
import { makeRng } from "../../city-editor/generators/prng";
import type { Point } from "../../city-editor/types/document";
import { createTownMonasteries } from "./friaryMeshes";

const center = (ring: Point[]): Point =>
  ring.reduce<Point>((a, p) => [a[0] + p[0] / ring.length, a[1] + p[1] / ring.length], [0, 0]);

it("uses the CE church footprints and keeps the cloister garth open above the garden", () => {
  const plan = friaryPreviewPlan();
  const before = JSON.stringify(plan);
  const model = createFriary(plan);
  model.group.updateMatrixWorld(true);
  const nave = plan.buildings.find(b => b.role === "church")!;
  const roof = model.pickables.find(m => m.name === "pitched-roof")!;
  const bounds = new THREE.Box3().setFromObject(roof);
  expect(bounds.min.x).toBeCloseTo(Math.min(...nave.polygon.map(p => p[0])));
  expect(bounds.max.z).toBeCloseTo(-Math.min(...nave.polygon.map(p => p[1])));
  const [x, y] = center(plan.walk!.garth);
  const ray = new THREE.Raycaster(new THREE.Vector3(x, 20, -y), new THREE.Vector3(0, -1, 0));
  const roofs = model.pickables.filter(m => m.name === "cloister-roof");
  expect(roofs).toHaveLength(4);
  expect(ray.intersectObjects(roofs)).toHaveLength(0);
  const a = plan.walk!.outer[0],
    b = plan.walk!.garth[0],
    point: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  ray.set(new THREE.Vector3(point[0], 20, -point[1]), new THREE.Vector3(0, -1, 0));
  expect(ray.intersectObjects(roofs).length).toBeGreaterThan(0);
  const bell = model.pickables.find(m => m.name === "friary-bell")!;
  expect(new THREE.Box3().setFromObject(bell).min.y).toBeGreaterThan(bounds.max.y);
  expect(JSON.stringify(plan)).toBe(before);
  model.dispose();
});

it("keeps both the precinct entrance and gatehouse passage open at walking height", () => {
  const plan = friaryPreviewPlan();
  const model = createFriary(plan);
  model.group.updateMatrixWorld(true);
  const gatehouse = plan.buildings.find(b => b.role === "gatehouse")!;
  const p = center(gatehouse.polygon),
    a = gatehouse.polygon[0],
    b = gatehouse.polygon[1];
  const normal = new THREE.Vector3(-(b[1] - a[1]), 0, -(b[0] - a[0])).normalize();
  const target = new THREE.Vector3(p[0], 1, -p[1]);
  const ray = new THREE.Raycaster(target.clone().addScaledVector(normal, 5), normal.clone().negate(), 0, 10);
  const walls = model.pickables.filter(
    m => m.name === "friary-precinct-wall" || m.name === "gatehouse-pier" || m.parent?.name === "friary-gatehouse"
  );
  expect(ray.intersectObjects(walls)).toHaveLength(0);
  model.dispose();
});

it.each(["friary", "abbey", "orthodoxMonastery"] as const)(
  "preserves rotation, translation and fitted scale for %s",
  kind => {
    const angle = 0.43;
    const ring: Point[] = [
      [0, 0],
      [75, 0],
      [75, 66],
      [0, 66]
    ].map(([x, y]) => [
      100 + x * Math.cos(angle) - y * Math.sin(angle),
      -80 + x * Math.sin(angle) + y * Math.cos(angle)
    ]);
    const plan = fitMonastery({
      kind,
      id: "rotated",
      faceId: "f",
      ring,
      margin: 8,
      rng: makeRng("friary-test"),
      maxScale: 0.75,
      minScale: 0.62
    })!.monastery;
    const model = createTownMonasteries([plan]);
    expect(model.pickables).toHaveLength(1);
    const positions = model.pickables[0].geometry.getAttribute("position");
    expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
    const bounds = new THREE.Box3().setFromObject(model.group);
    expect(bounds.min.x).toBeGreaterThan(60);
    expect(bounds.max.z).toBeGreaterThan(20);
    expect(bounds.max.y).toBeLessThan(14);
    model.dispose();
  }
);

it("grounds the full precinct, including the well, on one foundation and disposes its batch once", () => {
  const plan = friaryPreviewPlan();
  const model = createTownMonasteries([plan], { foundationAt: () => 12, heightAt: () => 8 });
  const bounds = new THREE.Box3().setFromObject(model.group);
  expect(bounds.min.y).toBeCloseTo(7.8);
  const mesh = model.pickables[0];
  const geometry = vi.spyOn(mesh.geometry, "dispose");
  const material = vi.spyOn(mesh.material as THREE.Material, "dispose");
  model.dispose();
  expect(geometry).toHaveBeenCalledTimes(1);
  expect(material).toHaveBeenCalledTimes(1);
});

it.each(["abbey", "orthodoxMonastery"] as const)(
  "renders %s from its fitted plan and records its own BV variant",
  kind => {
    const plan = monasteryPreviewPlan(kind);
    const model = createTownMonasteries([plan], { foundationAt: () => 12, heightAt: () => 8 });
    expect(model.pickables).toHaveLength(1);
    expect(Array.from(model.pickables[0].geometry.getAttribute("position").array).every(Number.isFinite)).toBe(true);
    expect(model.group.userData.modelVariants).toContain(`monastery.${kind}@default#codex-gpt-6.1-sol`);
    expect(new THREE.Box3().setFromObject(model.group).min.y).toBeCloseTo(7.8);
    const detailed = createMonastery(plan);
    expect(detailed.pickables.some(mesh => mesh.name === "friary-bell")).toBe(false);
    expect(detailed.pickables.some(mesh => mesh.name === "stone-tower")).toBe(true);
    expect(detailed.pickables.some(mesh => mesh.name === "bulbous-church-dome")).toBe(kind === "orthodoxMonastery");
    expect(detailed.pickables.filter(mesh => mesh.name === "cloister-roof")).toHaveLength(kind === "abbey" ? 4 : 0);
    model.dispose();
    detailed.dispose();
  }
);
