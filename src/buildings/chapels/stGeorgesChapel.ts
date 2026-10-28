import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";

export const ST_GEORGES_CHAPEL = {
  author: "Codex GPT-6.1 Sol",
  name: "St George's Chapel · Windsor Castle",
  width: 86,
  depth: 42,
  height: 27,
  source: "https://www.stgeorges-windsor.org/about-st-georges/experience-st-georges/360-virtual-tours/the-nave/",
  note: "Schematic Perpendicular Gothic exterior with nave, quire, aisles, transepts, east ambulatory, west steps and south porch. Dimensions and bay spacing are illustrative, not surveyed. Interior fan vaults, tombs, adjoining castle buildings, Albert Memorial Chapel and individual heraldic sculptures are omitted."
} as const;

/** Long axis is east–west (X); the ceremonial west front faces negative X. */
export function createStGeorgesChapel(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "st-georges-chapel";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const stone = new THREE.MeshLambertMaterial({ color: 0xcbbb9a });
  const trim = new THREE.MeshLambertMaterial({ color: 0xe4d8bb });
  const lead = new THREE.MeshLambertMaterial({ color: 0x747e80 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x344c58 });
  const door = new THREE.MeshLambertMaterial({ color: 0x41392e });
  const materials = [stone, trim, lead, glass, door];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cone = new THREE.ConeGeometry(1, 1, 4);
  const drum = new THREE.CylinderGeometry(1, 1, 1, 8);
  function add(geometry: THREE.BufferGeometry, material: THREE.MeshLambertMaterial, x: number, y: number, z: number) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(x: number, y: number, z: number, w: number, h: number, d: number, material = stone) {
    const mesh = add(cube, material, x, y + h / 2, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function pinnacle(x: number, y: number, z: number) {
    box(x, y, z, 0.7, 1.1, 0.7, trim);
    const cap = add(cone, trim, x, y + 2.2, z);
    cap.scale.set(0.64, 2.2, 0.64);
    cap.rotation.y = Math.PI / 4;
    box(x, y + 3.3, z, 0.14, 0.45, 0.14, trim);
  }
  const arch = new THREE.Shape();
  arch.moveTo(-0.5, 0);
  arch.lineTo(0.5, 0);
  arch.lineTo(0.5, 0.72);
  arch.quadraticCurveTo(0.5, 0.88, 0, 1);
  arch.quadraticCurveTo(-0.5, 0.88, -0.5, 0.72);
  arch.closePath();
  const archGeometry = new THREE.ShapeGeometry(arch, 8);
  // Local U follows the facade; its outward normal follows positive local Z.
  function window(x: number, y: number, z: number, w: number, h: number, angle = 0, lights = 4, material = glass) {
    const place = (
      geometry: THREE.BufferGeometry,
      mat: THREE.MeshLambertMaterial,
      u: number,
      v: number,
      out: number
    ) => {
      const mesh = add(
        geometry,
        mat,
        x + Math.cos(angle) * u + Math.sin(angle) * out,
        y + v,
        z - Math.sin(angle) * u + Math.cos(angle) * out
      );
      mesh.rotation.y = angle;
      return mesh;
    };
    place(archGeometry, trim, 0, 0, 0.025).scale.set(w + 0.4, h + 0.25, 1);
    place(archGeometry, material, 0, 0.18, 0.055).scale.set(w, h - 0.2, 1);
    if (material !== glass) return;
    for (let i = 1; i < lights; i++) {
      const u = -w / 2 + (w * i) / lights;
      const barH = h * (0.91 - 0.14 * Math.abs(u / w) * 2);
      place(cube, trim, u, 0.18 + barH / 2, 0.09).scale.set(0.09, barH, 0.1);
    }
    for (const fraction of [0.36, 0.69]) place(cube, trim, 0, h * fraction, 0.09).scale.set(w, 0.12, 0.1);
    // Short upper subdivisions suggest the vertical panel tracery.
    for (let i = 0; i < lights; i++) {
      place(cube, trim, -w / 2 + (w * (i + 0.5)) / lights, h * 0.77, 0.09).scale.set(0.065, h * 0.17, 0.1);
    }
  }
  function parapet(x: number, y: number, z: number, length: number, angle = 0) {
    const rail = box(x, y, z, length, 0.32, 0.4, trim);
    rail.rotation.y = angle;
    const coping = box(x, y + 1.05, z, length, 0.22, 0.5, trim);
    coping.rotation.y = angle;
    const count = Math.ceil(length / 0.85);
    for (let i = 0; i <= count; i++) {
      const u = -length / 2 + (length * i) / count;
      const post = box(x + Math.cos(angle) * u, y + 0.32, z - Math.sin(angle) * u, 0.16, 0.73, 0.32, trim);
      post.rotation.y = angle;
    }
  }
  function block(x: number, z: number, w: number, d: number, h: number) {
    box(x, 0.6, z, w, h, d);
    box(x, h + 0.25, z, w + 0.4, 0.35, d + 0.4, trim);
    // Shallow lead gables remain below the pinnacles; there is no crossing tower.
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, 0);
    shape.lineTo(d / 2, 0);
    shape.lineTo(0, 1.65);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false });
    const roof = add(geometry, lead, x - w / 2, h + 0.6, z);
    roof.rotation.y = Math.PI / 2;
    parapet(x, h + 0.6, z + d / 2, w);
    parapet(x, h + 0.6, z - d / 2, w);
    parapet(x - w / 2, h + 0.6, z, d, Math.PI / 2);
    parapet(x + w / 2, h + 0.6, z, d, Math.PI / 2);
  }
  box(-1, 0, 0, 74, 0.6, 28, trim);
  block(-2, 0, 70, 13, 20.6);
  for (const side of [-1, 1]) block(-2, side * 10, 70, 7, 10.4);
  // Shallow transepts interrupt the continuous nave and quire roofline.
  for (const side of [-1, 1]) {
    block(-1, side * 13, 10, 12, 19.4);
    window(-1, 4.2, side * 19.02, 7.2, 13, side > 0 ? 0 : Math.PI, 6);
    for (const x of [-6, 4]) {
      box(x, 0.6, side * 19, 1.1, 19.5, 1.3);
      pinnacle(x, 20.1, side * 19);
    }
  }
  // Repeated aisle buttresses and clerestory bays, split by the transepts.
  for (const x of [-34, -28, -22, -16, -10, 8, 14, 20, 26, 32]) {
    for (const side of [-1, 1]) {
      box(x, 0.6, side * 14, 1.2, 5, 3.2);
      box(x, 5.6, side * 13.8, 0.95, 5.7, 2.4);
      box(x, 11.3, side * 13.5, 0.75, 1, 1.9, trim);
      pinnacle(x, 12.3, side * 13.5);
      box(x, 11, side * 6.7, 0.65, 10.2, 0.8, trim);
      pinnacle(x, 21.2, side * 6.7);
      if (x < 32 && x !== -10) {
        window(x + 3, 3, side * 13.52, 4.2, 6.6, side > 0 ? 0 : Math.PI);
        window(x + 3, 12.1, side * 6.52, 4.4, 7.2, side > 0 ? 0 : Math.PI);
      }
    }
  }
  // Broad west window and ceremonial portal, flanked by octagonal stair turrets.
  window(-37.02, 7.4, 0, 10.6, 11.7, -Math.PI / 2, 10);
  window(-37.03, 0.6, 0, 3.4, 4.8, -Math.PI / 2, 2, door);
  for (const z of [-7.3, 7.3]) {
    const turret = add(drum, stone, -37, 11.6, z);
    turret.scale.set(1.15, 22, 1.15);
    const crown = add(drum, trim, -37, 22.8, z);
    crown.scale.set(1.35, 0.5, 1.35);
    pinnacle(-37, 23.05, z);
  }
  for (let i = 0; i < 6; i++) box(-42 + i * 0.8, 0, 0, 0.8, (i + 1) * 0.1, 12, trim);
  // Lower east ambulatory closes the quire, without including the separate memorial chapel.
  block(35, 0, 4, 22, 9.4);
  window(37.02, 2.8, 0, 5.5, 5.8, Math.PI / 2, 5);
  window(33.02, 11.8, 0, 10, 7.5, Math.PI / 2, 8);
  // South porch and its recessed doorway.
  block(-23, 16, 6, 5, 7.4);
  window(-23, 0.6, 18.52, 2.8, 4.6, 0, 2, door);
  for (const x of [-26, -20]) pinnacle(x, 8, 18.5);
  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}
