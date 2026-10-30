import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";
import { WINDMILL_SAIL_RADIUS_METERS } from "./millDimensions";

/** An imagined stone tower mill, in meters; not a surveyed reconstruction. */
export const TOWER_MILL = {
  author: "Codex GPT-6.1 Sol",
  name: "Stone tower windmill",
  width: 17,
  depth: 12,
  height: 21,
  towerHeight: 11.7,
  baseRadius: 3.5,
  topRadius: 2.25,
  hubHeight: 12.2,
  sailRadius: WINDMILL_SAIL_RADIUS_METERS.tower,
  note: "Imagined European stone tower windmill with tapering masonry, an arched timber entrance, small shuttered windows, a conical timber cap, four canvas-covered lattice sails and a rear tailpole. The cap carries the windshaft and sails above the fixed tower. Static exterior study; gearing, millstones and interiors are omitted. Dimensions are illustrative."
} as const;

export interface TowerMillMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createTowerMill(): TowerMillMeshes {
  const group = new THREE.Group();
  group.name = "stone-tower-windmill";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const stones = [0xb9af96, 0xc2b69c, 0xaaa28f, 0xc9bea7].map(color => new THREE.MeshLambertMaterial({ color }));
  const mortar = new THREE.MeshLambertMaterial({ color: 0x716d61 });
  const trim = new THREE.MeshLambertMaterial({ color: 0xd7cbb0 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x715236 });
  const paleWood = new THREE.MeshLambertMaterial({ color: 0xb79762 });
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x493c2e });
  const roof = new THREE.MeshLambertMaterial({ color: 0x53594c });
  const roofAlternate = new THREE.MeshLambertMaterial({ color: 0x656955 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x303733 });
  const recess = new THREE.MeshLambertMaterial({ color: 0x202623 });
  const canvas = new THREE.MeshLambertMaterial({ color: 0xf0e3c3, side: THREE.DoubleSide });
  const materials = [...stones, mortar, trim, wood, paleWood, darkWood, roof, roofAlternate, iron, recess, canvas];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, parent = group) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    parent.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material = wood,
    parent = group
  ) {
    const mesh = add(name, cube, material, parent);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, width: number, material = wood, parent = group) {
    const mesh = add(name, cylinder, material, parent);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(width, a.distanceTo(b), width);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  const radiusAt = (y: number) =>
    TOWER_MILL.baseRadius + ((TOWER_MILL.topRadius - TOWER_MILL.baseRadius) * y) / TOWER_MILL.towerHeight;
  const shell = add(
    "tower-mortar",
    new THREE.CylinderGeometry(
      TOWER_MILL.topRadius - 0.04,
      TOWER_MILL.baseRadius - 0.04,
      TOWER_MILL.towerHeight,
      40,
      26,
      true
    ),
    mortar
  );
  shell.position.y = TOWER_MILL.towerHeight / 2;
  // Shared annular blocks per course give staggered joints without large hidden cap faces.
  const courses = 26,
    sectors = 20,
    pitch = (Math.PI * 2) / sectors;
  for (let row = 0; row < courses; row++) {
    const bottom = row * 0.45 + 0.015,
      top = (row + 1) * 0.45 - 0.015;
    const a = 0.008,
      b = pitch - 0.008;
    const points: number[] = [];
    for (const inset of [0, 0.3])
      for (const y of [bottom, top])
        for (const angle of [a, b]) {
          const r = radiusAt(y) - inset;
          points.push(Math.sin(angle) * r, y, Math.cos(angle) * r);
        }
    const block = new THREE.BufferGeometry();
    block.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    block.setIndex([
      0, 1, 2, 1, 3, 2, 4, 6, 5, 5, 6, 7, 2, 3, 6, 3, 7, 6, 0, 4, 1, 1, 4, 5, 0, 2, 4, 2, 6, 4, 1, 5, 3, 3, 5, 7
    ]);
    block.computeVertexNormals();
    for (let i = 0; i < sectors; i++) {
      const mesh = add("masonry-block", block, stones[(i * 7 + row * 3) % stones.length]);
      mesh.rotation.y = (i + (row % 2) * 0.5) * pitch;
    }
  }
  const footing = add("foundation-ring", new THREE.CylinderGeometry(3.54, 3.68, 0.25, 40), stones[2]);
  footing.position.y = 0.125;
  const cornice = add("stone-cornice", new THREE.CylinderGeometry(2.44, 2.42, 0.28, 40), trim);
  cornice.position.y = 11.62;

  // Dark inset panels depict closed openings on this exterior-only model.
  const doorShape = new THREE.Shape();
  doorShape.moveTo(-0.7, 0.15);
  doorShape.lineTo(0.7, 0.15);
  doorShape.lineTo(0.7, 1.8);
  doorShape.absarc(0, 1.8, 0.7, 0, Math.PI, false);
  doorShape.closePath();
  const door = add(
    "arched-door",
    new THREE.ExtrudeGeometry(doorShape, { depth: 0.12, bevelEnabled: false, curveSegments: 12 }),
    darkWood
  );
  door.position.z = 3.45;
  for (let i = 0; i < 7; i++) {
    const x = -0.6 + i * 0.2,
      top = 1.8 + Math.sqrt(0.49 - x * x);
    box("door-plank", x, (0.17 + top) / 2, 3.59, 0.185, top - 0.17, 0.06, wood);
  }
  for (const y of [0.65, 1.6]) box("door-strap", -0.12, y, 3.64, 1.1, 0.09, 0.05, iron);
  box("door-latch", 0.42, 1.15, 3.66, 0.12, 0.24, 0.06, iron);
  for (const side of [-1, 1])
    for (let row = 0; row < 4; row++) box("door-jamb", side * 0.91, 0.35 + row * 0.43, 3.43, 0.32, 0.4, 0.38, trim);
  for (let i = 0; i < 9; i++) {
    const angle = ((i + 0.5) * Math.PI) / 9;
    const stone = box("arch-stone", 0.89 * Math.cos(angle), 1.8 + 0.89 * Math.sin(angle), 3.44, 0.32, 0.3, 0.4, trim);
    stone.rotation.z = angle - Math.PI / 2;
  }
  box("doorstep", 0, 0.1, 3.85, 1.8, 0.2, 0.7, stones[2]);
  for (const [angle, y] of [
    [0, 5.7],
    [0, 8.9],
    [Math.PI / 2, 4],
    [Math.PI / 2, 7.6],
    [Math.PI, 6.4],
    [-Math.PI / 2, 7.6]
  ]) {
    const window = new THREE.Group();
    window.position.set(Math.sin(angle) * radiusAt(y), y, Math.cos(angle) * radiusAt(y));
    window.rotation.y = angle;
    group.add(window);
    box("window-surround", 0, 0, 0.01, 1.05, 1.5, 0.22, trim, window);
    box("window-recess", 0, 0, 0.14, 0.7, 1.12, 0.08, recess, window);
    box("window-mullion", 0, 0, 0.2, 0.07, 1.12, 0.07, wood, window);
    box("window-sill", 0, -0.76, 0.12, 1.18, 0.16, 0.42, trim, window);
    const shutter = box("window-shutter", 0.7, 0, 0.27, 0.5, 1.2, 0.08, wood, window);
    shutter.rotation.y = 0.3;
  }

  const cap = new THREE.Group();
  cap.name = "rotating-cap";
  group.add(cap);
  const drum = add("cap-drum", new THREE.CylinderGeometry(2.4, 2.4, 0.65, 40), darkWood, cap);
  drum.position.y = 12.04;
  // Individual roof sectors avoid overlapping surfaces in the orthographic drawings.
  for (let i = 0; i < 40; i++) {
    const panel = add(
      "cap-roof",
      new THREE.ConeGeometry(2.7, 2.7, 1, 1, true, (i * Math.PI) / 20, Math.PI / 20),
      i % 2 ? roof : roofAlternate,
      cap
    );
    panel.position.y = 13.68;
  }
  beam("cap-finial", v(0, 15.03, 0), v(0, 15.45, 0), 0.08, iron, cap);
  beam("windshaft", v(0, TOWER_MILL.hubHeight, 1.5), v(0, TOWER_MILL.hubHeight, 4.35), 0.23, darkWood, cap);
  beam("tailpole", v(0, 12, -2), v(0, 1.15, -6.6), 0.11, darkWood, cap);
  beam("tailpole-handle", v(-0.75, 1.15, -6.6), v(0.75, 1.15, -6.6), 0.08, paleWood, cap);
  const rotor = new THREE.Group();
  rotor.name = "sail-assembly";
  rotor.position.set(0, TOWER_MILL.hubHeight, 4);
  cap.add(rotor);
  for (let i = 0; i < 4; i++) {
    const sail = new THREE.Group();
    sail.name = `sail-${i + 1}`;
    sail.rotation.z = Math.PI / 4 + (i * Math.PI) / 2;
    rotor.add(sail);
    box("sail-stock", 0, 3.65, 0, 0.2, TOWER_MILL.sailRadius, 0.24, darkWood, sail);
    const lattice = new THREE.Group();
    lattice.rotation.y = -0.15;
    sail.add(lattice);
    for (const x of [0.08, 0.78, 1.48]) box("sail-longitudinal", x, 4.7, 0, 0.075, 5, 0.08, paleWood, lattice);
    const cloth = add("canvas-sail", new THREE.PlaneGeometry(1.32, 4.55), canvas, lattice);
    cloth.position.set(0.78, 4.7, -0.05);
    for (let j = 0; j <= 12; j++)
      box("sail-crossbar", 0.78, 2.2 + (j * 5) / 12, 0.04, 1.56, 0.07, 0.09, paleWood, lattice);
    for (const y of [0.5, 1.8, 3.5]) box("stock-binding", 0, y, 0, 0.27, 0.13, 0.3, iron, sail);
  }
  beam("rotor-hub", v(0, TOWER_MILL.hubHeight, 3.7), v(0, TOWER_MILL.hubHeight, 4.4), 0.4, darkWood, cap);
  beam("hub-cap", v(0, TOWER_MILL.hubHeight, 4.4), v(0, TOWER_MILL.hubHeight, 4.52), 0.26, iron, cap);
  const model = {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
  // The recessed mortar backing is hidden by the blocks; omit it from vector drawings
  // to avoid painter-order interference between the backing and individual stone faces.
  const drawing = { ...model, pickables: pickables.filter(mesh => mesh !== shell) };
  return { ...model, elevation: meshProjection(drawing, "side"), plan: meshProjection(drawing, "top") };
}
