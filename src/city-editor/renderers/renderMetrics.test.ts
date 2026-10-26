import * as THREE from "three";
import { expect, it } from "vitest";
import { collectSceneMetrics, collectSvgMetrics } from "./renderMetrics";

it("counts SVG definitions, hidden nodes and batched path complexity without treating them as visible objects", () => {
  const host = document.createElement("div");
  host.innerHTML = `<svg data-render-quality="light" data-core-buildings="20" data-outskirts-buildings="3" data-redraw-cpu-ms="4.5">
    <defs><path d="M0 0L1 1Z"/></defs><g style="display:none"><use href="#house"/></g>
    <path d="M0 0 1 1L2 2Z"/><polygon points="0,0 1,0 1,1"/><polyline points="0,0 1e-3,2"/>
  </svg>`;
  const metrics = collectSvgMetrics(host.querySelector("svg")!);
  expect(metrics).toMatchObject({
    elements: 8,
    tags: { path: 2, use: 1, g: 1, defs: 1, polygon: 1, polyline: 1 },
    pathCommands: 6,
    pathCharacters: 22,
    points: 5,
    buildings: 23,
    quality: "light",
    redrawCpuMs: 4.5
  });
});

it("counts instances separately and deduplicates shared resident geometry and materials", () => {
  const geometry = new THREE.BoxGeometry();
  const material = new THREE.MeshBasicMaterial();
  const scene = new THREE.Scene();
  const hidden = new THREE.Group();
  hidden.visible = false;
  hidden.add(new THREE.Mesh(geometry, material));
  scene.add(hidden, new THREE.InstancedMesh(geometry, material, 100));
  expect(collectSceneMetrics(scene)).toEqual({
    objects: 4,
    meshes: 2,
    instances: 100,
    geometries: 1,
    materials: 1,
    vertices: geometry.getAttribute("position").count
  });
  geometry.dispose();
  material.dispose();
});
