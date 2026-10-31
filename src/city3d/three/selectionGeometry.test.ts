import * as THREE from "three";
import { expect, it } from "vitest";
import { structureSelectionGeometry } from "./selectionGeometry";

it("selects one structure across body and roof batches, including world elevation but excluding neighbours", () => {
  const material = new THREE.MeshBasicMaterial();
  const body = new THREE.BufferGeometry();
  body.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0, 2, 0, 0, 0, 12, 0, 40, 0, 0, 42, 0, 0, 40, 90, 0], 3)
  );
  body.setAttribute("buildingIndex", new THREE.Float32BufferAttribute([3, 3, 3, 8, 8, 8], 1));
  const roof = new THREE.BufferGeometry();
  roof.setAttribute("position", new THREE.Float32BufferAttribute([0, 12, 0, 2, 12, 0, 1, 18, 0], 3));
  roof.setAttribute("buildingIndex", new THREE.Float32BufferAttribute([3, 3, 3], 1));
  roof.setIndex([0, 1, 2]);
  const meshes = [body, roof].map(geometry => new THREE.Mesh(geometry, material));
  const parent = new THREE.Group();
  parent.position.set(20, 7, -15);
  parent.rotation.y = 0.6;
  parent.add(...meshes);
  const selection = structureSelectionGeometry(meshes, 3)!;
  expect(selection.getAttribute("position").count).toBe(6);
  expect(selection.boundingBox!.min.y).toBe(7);
  expect(selection.boundingBox!.max.y).toBe(25);
  expect(selection.boundingBox!.getSize(new THREE.Vector3()).y).toBe(18);
  expect(body.getAttribute("position").getY(2)).toBe(12);
  expect(structureSelectionGeometry(meshes, 99)).toBeUndefined();
  expect(structureSelectionGeometry(meshes, -1)).toBeUndefined();
  selection.dispose();
  body.dispose();
  roof.dispose();
  material.dispose();
});
