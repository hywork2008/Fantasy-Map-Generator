import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { adoptedVariant, medievalDefinition } from "../../city3d/adoption";
import { meshProjection } from "../meshProjection";
import { models as boats } from "./23-small-boatsModels";
import { models as granaries } from "./25-public-granariesModels";

it.each([...boats, ...granaries])("$id High fits, projects and owns independent resources", definition => {
  const variant = definition.variants!.find(v => v.level === "high")!;
  expect(adoptedVariant(variant.family, "high").id).toBe(variant.id);
  const model = variant.create(),
    other = variant.create(),
    bounds = new THREE.Box3().setFromObject(model.group, true),
    size = bounds.getSize(new THREE.Vector3());
  expect(bounds.min.y).toBeCloseTo(0, 5);
  for (const [actual, limit] of [
    [size.x, definition.size[0]],
    [size.z, definition.size[1]],
    [size.y, definition.size[2]]
  ])
    expect(actual).toBeLessThanOrEqual(limit + 0.00001);
  expect(model.pickables.length).toBeLessThanOrEqual(10);
  for (const mesh of model.pickables)
    for (const attr of ["position", "normal"])
      expect(Array.from(mesh.geometry.getAttribute(attr).array).every(Number.isFinite)).toBe(true);
  for (const view of ["top", "side"] as const) {
    const svg = meshProjection(model, view);
    expect(svg).toContain("<path");
    expect(svg).not.toMatch(/NaN|Infinity/);
  }
  const resources = new Set(model.pickables.flatMap(m => [m.geometry, ...[m.material].flat()])),
    spies = [...resources].map(r => vi.spyOn(r, "dispose")),
    otherDispose = vi.spyOn(other.pickables[0].geometry, "dispose");
  model.dispose();
  for (const spy of spies) expect(spy).toHaveBeenCalledOnce();
  expect(otherDispose).not.toHaveBeenCalled();
  other.dispose();
  const low = definition.variants![0].create(),
    original = definition.create();
  expect(low.group.name).toBe(original.group.name);
  expect(low.pickables.length).toBe(original.pickables.length);
  low.dispose();
  original.dispose();
});

it.each(boats)("$id has an open interior above its floor and a closed hull below the gunwale", definition => {
  const model = definition.variants![1].create();
  model.group.updateMatrixWorld(true);
  const floor = new THREE.Raycaster(new THREE.Vector3(-0.3, 1.5, 0.025), new THREE.Vector3(0, -1, 0)).intersectObjects(
    model.pickables
  )[0];
  expect(floor.point.y).toBeCloseTo(0.4775, 5);
  for (const side of [-1, 1]) {
    const hull = new THREE.Raycaster(
      new THREE.Vector3(-0.3, 0.65, side * 1.5),
      new THREE.Vector3(0, 0, -side),
      0,
      1.5
    ).intersectObjects(model.pickables);
    expect(hull.length).toBeGreaterThan(0);
    const cavity = new THREE.Raycaster(
      new THREE.Vector3(-0.3, 0.65, 0),
      new THREE.Vector3(0, 0, side),
      0,
      0.25
    ).intersectObjects(model.pickables);
    expect(cavity).toHaveLength(0);
  }
  model.dispose();
});

it("public granary retains its CE default identity", () => {
  expect(medievalDefinition(granaries[0]).variant).toBe("medieval.public-granary@default#codex-gpt-6.1-sol");
});

it("granary freight doors and its central receiving route stay clear", () => {
  const model = granaries[0].variants![1].create();
  model.group.updateMatrixWorld(true);
  for (const [x, y] of [
    [0, 2],
    [0, 4.5],
    [-3.8, 4.5],
    [3.8, 4.5],
    [0, 7.1],
    [-3.8, 7.1],
    [3.8, 7.1]
  ]) {
    const opening = new THREE.Raycaster(
      new THREE.Vector3(x, y, 1.9),
      new THREE.Vector3(0, 0, -1),
      0,
      0.7
    ).intersectObjects(model.pickables);
    expect(opening).toHaveLength(0);
  }
  const route = new THREE.Raycaster(new THREE.Vector3(0, 1.5, 7.5), new THREE.Vector3(0, 0, -1), 0, 7).intersectObjects(
    model.pickables
  );
  expect(route).toHaveLength(0);
  const wall = new THREE.Raycaster(new THREE.Vector3(2, 2, 1.9), new THREE.Vector3(0, 0, -1), 0, 0.7).intersectObjects(
    model.pickables
  );
  expect(wall.length).toBeGreaterThan(0);
  model.dispose();
});

it.each(boats)("$id keeps fitted seats and wall cleats within the outer hull", definition => {
  const model = definition.variants![1].create();
  model.group.updateMatrixWorld(true);
  const hullMeshes: THREE.Mesh[] = [];
  const seatPoints: THREE.Vector3[] = [];
  for (const mesh of model.pickables) {
    const positions = mesh.geometry.getAttribute("position");
    for (const range of mesh.userData.modelPartRanges ?? []) {
      if (range.partId === "seating" || range.partId === "seat-support") {
        for (let i = range.start; i < range.start + range.count; i++)
          seatPoints.push(new THREE.Vector3().fromBufferAttribute(positions, i));
      }
      if (range.partId === "hull") {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute(
          "position",
          new THREE.BufferAttribute(positions.array.slice(range.start * 3, (range.start + range.count) * 3), 3)
        );
        const hull = new THREE.Mesh(geometry, mesh.material);
        hull.updateMatrixWorld(true);
        hullMeshes.push(hull);
      }
    }
  }
  expect(seatPoints.length).toBeGreaterThan(0);
  for (const p of seatPoints) {
    const side = Math.sign(p.z) || 1;
    const hits = new THREE.Raycaster(
      new THREE.Vector3(p.x, p.y, side * 2),
      new THREE.Vector3(0, 0, -side),
      0,
      2
    ).intersectObjects(hullMeshes);
    expect(hits.length).toBeGreaterThan(0);
    const outer = Math.max(...hits.map(hit => Math.abs(hit.point.z)));
    expect(Math.abs(p.z)).toBeLessThanOrEqual(outer + 0.0001);
  }
  for (const hull of hullMeshes) hull.geometry.dispose();
  model.dispose();
});

it.each(boats)("$id connects all three thwarts to both hull sides through bearing cleats", definition => {
  const model = definition.variants![1].create();
  const parts: Record<string, THREE.Mesh[]> = { hull: [], seating: [], "seat-support": [] };
  for (const mesh of model.pickables) {
    const positions = mesh.geometry.getAttribute("position");
    for (const range of mesh.userData.modelPartRanges ?? []) {
      if (!parts[range.partId]) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(positions.array.slice(range.start * 3, (range.start + range.count) * 3), 3)
      );
      const part = new THREE.Mesh(geometry, mesh.material);
      part.updateMatrixWorld(true);
      parts[range.partId].push(part);
    }
  }
  const length = definition.id === "small-fishing-boat" ? 5.5 : 3.8;
  for (const t of [0.28, 0.55, 0.77])
    for (const dx of [-0.07, 0.07])
      for (const side of [-1, 1]) {
        const x = (t - 0.5) * length + dx;
        for (const [id, y] of [
          ["seating", 0.8],
          ["seat-support", 0.72]
        ] as const) {
          const skin = new THREE.Raycaster(
            new THREE.Vector3(x, y, side * 2),
            new THREE.Vector3(0, 0, -side),
            0,
            2
          ).intersectObjects(parts.hull);
          const inner = Math.min(...skin.map(h => Math.abs(h.point.z))),
            outer = Math.max(...skin.map(h => Math.abs(h.point.z)));
          const timber = new THREE.Raycaster(
            new THREE.Vector3(x, y, 0),
            new THREE.Vector3(0, 0, side),
            0,
            2
          ).intersectObjects(parts[id]);
          expect(timber.length).toBeGreaterThan(0);
          const end = Math.max(...timber.map(h => Math.abs(h.point.z)));
          expect(end).toBeGreaterThan(inner + 0.003);
          expect(end).toBeLessThan(outer);
        }
        const seatEdge = new THREE.Raycaster(
          new THREE.Vector3(x, 0.775, 0),
          new THREE.Vector3(0, 0, side),
          0,
          2
        ).intersectObjects(parts.seating);
        const bearingZ = side * (Math.max(...seatEdge.map(h => Math.abs(h.point.z))) - 0.07);
        const bearing = new THREE.Raycaster(
          new THREE.Vector3(x, 0.79, bearingZ),
          new THREE.Vector3(0, -1, 0),
          0,
          0.13
        ).intersectObjects(parts["seat-support"]);
        expect(bearing.length).toBeGreaterThan(0);
        expect(bearing[0].point.y).toBeCloseTo(0.78, 5);
      }
  for (const meshes of Object.values(parts)) for (const mesh of meshes) mesh.geometry.dispose();
  model.dispose();
});
