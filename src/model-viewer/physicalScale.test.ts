import * as THREE from "three";
import { expect, it } from "vitest";
import { createPostMill } from "../buildings/mills/postMill";
import { createLowBankWaterMill, LOW_BANK_WATER_MILLS } from "../buildings/mills/waterMill";
import {
  createReferencePerson,
  fitStudyCamera,
  REFERENCE_PERSON_HEIGHT_METERS,
  studyBounds,
  studyEnvelope
} from "./physicalScale";

it("measures visible world geometry and instances without changing physical dimensions", () => {
  const geometry = new THREE.BoxGeometry(2, 3, 4);
  const material = new THREE.MeshBasicMaterial();
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(2, 1.5, 0);
  root.add(mesh);
  root.position.set(10, 5, -3);
  const hidden = new THREE.Group();
  hidden.visible = false;
  const alternative = new THREE.Mesh(geometry, material);
  alternative.scale.setScalar(100);
  hidden.add(alternative);
  root.add(hidden);
  const instances = new THREE.InstancedMesh(geometry, material, 2);
  instances.setMatrixAt(0, new THREE.Matrix4().makeTranslation(-2, 1.5, 0));
  instances.setMatrixAt(1, new THREE.Matrix4().makeTranslation(4, 1.5, 0));
  root.add(instances);
  const bounds = studyBounds([root])!;
  expect(bounds.min.toArray()).toEqual([7, 5, -5]);
  expect(bounds.max.toArray()).toEqual([15, 8, -1]);
  expect(studyEnvelope(bounds)).toBe("8.00 × 4.00 × 3.00 m");
  expect(root.scale.toArray()).toEqual([1, 1, 1]);
  geometry.dispose();
  material.dispose();
});

it("uses actual transformed vertices rather than an oversized rotated local box", () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 2, 0], 3));
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.z = Math.PI / 4;
  expect(studyBounds([mesh])!.max.y).toBeCloseTo(Math.SQRT2);
  const instances = new THREE.InstancedMesh(geometry, material, 1);
  instances.setMatrixAt(0, new THREE.Matrix4().makeRotationZ(Math.PI / 4));
  expect(studyBounds([instances])!.max.y).toBeCloseTo(Math.SQRT2);
  geometry.dispose();
  material.dispose();
});

it("keeps the same 1.70 m person beside both mills, excluding the figure from the envelope", () => {
  const person = createReferencePerson();
  const windmill = createPostMill();
  const watermill = createLowBankWaterMill(LOW_BANK_WATER_MILLS[0], true);
  for (const mill of [windmill, watermill]) {
    const before = studyBounds([mill.group])!;
    person.group.position.set(before.min.x - 0.8, 0, before.max.z + 0.2);
    const human = studyBounds([person.group])!;
    expect(human.min.y).toBeCloseTo(0);
    expect(human.max.y).toBeCloseTo(REFERENCE_PERSON_HEIGHT_METERS);
    expect(studyBounds([mill.group])!.equals(before)).toBe(true);
    expect(mill.group.scale.toArray()).toEqual([1, 1, 1]);
  }
  expect(studyBounds([windmill.group.getObjectByName("door-board")!])!.getSize(new THREE.Vector3()).y).toBeCloseTo(
    1.95
  );
  expect(
    studyBounds([watermill.group.getObjectByName("entrance-door-board")!])!.getSize(new THREE.Vector3()).y
  ).toBeCloseTo(2.02);
  // Repositioning the figure onto the elevated mill landing must preserve its height.
  person.group.position.set(0, 4.46, -3);
  expect(studyBounds([person.group])!.getSize(new THREE.Vector3()).y).toBeCloseTo(1.7);
  person.dispose();
  windmill.dispose();
  watermill.dispose();
});

it.each([0.45, 2.5])("fits the whole measured envelope at aspect %s without rescaling it", aspect => {
  const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 5000);
  const bounds = new THREE.Box3(new THREE.Vector3(-0.8, -1, -4), new THREE.Vector3(8, 40, 6));
  const target = fitStudyCamera(camera, bounds, new THREE.Vector3(1, 0.7, 1));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  for (const x of [bounds.min.x, bounds.max.x])
    for (const y of [bounds.min.y, bounds.max.y])
      for (const z of [bounds.min.z, bounds.max.z]) {
        const point = new THREE.Vector3(x, y, z).project(camera);
        expect(Math.abs(point.x)).toBeLessThan(1);
        expect(Math.abs(point.y)).toBeLessThan(1);
        expect(Math.abs(point.z)).toBeLessThan(1);
      }
});

it("does not invent an envelope for empty geometry", () => {
  expect(studyBounds([])).toBeUndefined();
  expect(studyBounds([new THREE.Group()])).toBeUndefined();
});
