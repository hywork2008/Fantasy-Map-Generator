import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";

export const CHAMBORD = {
  name: "Château de Chambord",
  width: 190,
  depth: 145,
  height: 62,
  source: "https://www.chambord.org/en/history/the-chateau/architecture/",
  note: "Schematic French Renaissance exterior: four-towered keep, central lantern, terraces, roof pavilions, chimneys, lateral wings and courtyard enclosure. Dimensions and placement are illustrative, not surveyed. Interiors, double-helix staircase, sculpture and gardens are omitted."
} as const;

export interface ChambordMeshes extends CityStructureMeshes {
  plan: string;
}

export function createChambord(): ChambordMeshes {
  const group = new THREE.Group();
  group.name = "chambord";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const stone = new THREE.MeshLambertMaterial({ color: 0xe1d7bd });
  const trim = new THREE.MeshLambertMaterial({ color: 0xf0e6d0 });
  const slate = new THREE.MeshLambertMaterial({ color: 0x3e4b59 });
  const lead = new THREE.MeshLambertMaterial({ color: 0x899393 });
  const glass = new THREE.MeshLambertMaterial({ color: 0x303c46 });
  const paving = new THREE.MeshLambertMaterial({ color: 0xb5ad99 });
  const gold = new THREE.MeshLambertMaterial({ color: 0xc7a853 });
  const materials = [stone, trim, slate, lead, glass, paving, gold];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const drum = new THREE.CylinderGeometry(1, 1, 1, 24);
  const cone = new THREE.ConeGeometry(1, 1, 24);
  const hip = new THREE.BufferGeometry();
  hip.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, 0, 1, -0.2, 0, 1, 0.2], 3)
  );
  hip.setIndex([0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 3, 5, 4, 3, 4, 0, 0, 1, 2, 0, 2, 3]);
  hip.computeVertexNormals();
  const plans: { y: number; svg: string }[] = [];
  function add(
    geometry: THREE.BufferGeometry,
    material: THREE.MeshLambertMaterial,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    plan = true
  ) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    group.add(mesh);
    pickables.push(mesh);
    if (plan) {
      const style = `fill="#${material.color.getHexString()}" stroke="#777263" stroke-width="0.25"`;
      const round = geometry === drum || geometry === cone;
      plans.push({
        y: y + (geometry === hip ? h : h / 2),
        svg: round
          ? `<ellipse cx="${x}" cy="${z}" rx="${w}" ry="${d}" ${style}/>`
          : `<rect x="${x - w / 2}" y="${z - d / 2}" width="${w}" height="${d}" ${style}/>`
      });
    }
    return mesh;
  }
  const box = (x: number, base: number, z: number, w: number, h: number, d: number, material = stone, plan = true) =>
    add(cube, material, x, base + h / 2, z, w, h, d, plan);
  const cylinder = (x: number, base: number, z: number, r: number, h: number, material = stone) =>
    add(drum, material, x, base + h / 2, z, r, h, r);
  const cap = (x: number, base: number, z: number, r: number, h: number, material = slate) =>
    add(cone, material, x, base + h / 2, z, r, h, r);
  function window(x: number, y: number, z: number, angle = 0) {
    const parts = [
      box(x, y - 0.2, z, 1.9, 3.3, 0.16, trim, false),
      box(x, y, z, 1.35, 2.85, 0.2, glass, false),
      box(x, y, z, 0.12, 2.85, 0.24, trim, false),
      box(x, y + 1.5, z, 1.35, 0.12, 0.24, trim, false)
    ];
    for (const part of parts) part.rotation.y = angle;
  }
  function facade(x: number, z: number, w: number, d: number, h: number) {
    for (let y = 3; y < h - 3; y += 7) {
      for (let dx = -w / 2 + 4; dx < w / 2 - 2; dx += 5.5) {
        window(x + dx, y, z + d / 2 + 0.12);
        window(x + dx, y, z - d / 2 - 0.12);
      }
      for (let dz = -d / 2 + 4; dz < d / 2 - 2; dz += 5.5) {
        window(x + w / 2 + 0.12, y, z + dz, Math.PI / 2);
        window(x - w / 2 - 0.12, y, z + dz, Math.PI / 2);
      }
    }
  }
  function block(x: number, z: number, w: number, d: number, h: number) {
    box(x, 0.4, z, w, h, d);
    for (let y = 1; y < h; y += 7) box(x, y, z, w + 0.35, 0.35, d + 0.35, trim);
    box(x, h, z, w + 0.8, 0.65, d + 0.8, trim);
    facade(x, z, w, d, h);
  }
  function lantern(x: number, z: number, base: number, r: number, h: number) {
    cylinder(x, base, z, r + 0.4, 0.6, trim);
    cylinder(x, base + 0.6, z, r * 0.78, h - 1.2, glass);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      cylinder(x + Math.sin(a) * r, base + 0.6, z + Math.cos(a) * r, 0.22, h - 1.2, trim);
    }
    cylinder(x, base + h - 0.6, z, r + 0.4, 0.6, trim);
    cap(x, base + h, z, r + 0.5, 2.5, lead);
    cylinder(x, base + h + 2.5, z, 0.12, 1.2, gold);
  }
  function tower(x: number, z: number, h: number, r = 8) {
    cylinder(x, 0.4, z, r, h);
    for (let y = 1; y < h; y += 7) cylinder(x, y, z, r + 0.2, 0.4, trim);
    cylinder(x, h, z, r + 0.6, 0.8, trim);
    cap(x, h + 0.8, z, r + 0.6, 13);
    lantern(x, z, h + 13.8, 1.5, 3.2);
    for (let y = 3; y < h - 3; y += 7) {
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5;
        window(x + Math.sin(a) * (r + 0.12), y, z + Math.cos(a) * (r + 0.12), a);
      }
    }
  }
  function chimney(x: number, z: number, base: number, h: number) {
    box(x, base, z, 1.8, h, 1.5);
    box(x, base + h - 1.2, z, 2.5, 0.4, 2.1, trim);
    box(x, base + h, z, 2.3, 0.45, 1.9, trim);
    for (const dx of [-0.5, 0.5]) box(x + dx, base + h + 0.45, z, 0.55, 0.8, 0.65, slate);
  }
  // The high northern front and lower enclosure surround a large open court.
  box(0, 0, 15, 184, 0.4, 130, paving);
  block(0, -22, 44, 44, 29);
  for (const x of [-22, 22]) for (const z of [-44, 0]) tower(x, z, 29);
  // Four separate roof pavilions leave a cross of accessible roof terraces.
  for (const x of [-11, 11])
    for (const z of [-33, -11]) {
      add(hip, slate, x, 30, z, 17, 12, 17);
      for (const dx of [-6, 6]) chimney(x + dx, z, 36, 8);
      for (const dz of [-7, 7]) {
        box(x, 31, z + dz, 3.2, 5, 2.3);
        add(hip, slate, x, 36, z + dz, 4, 2.5, 3);
        window(x, 32, z + dz + Math.sign(dz) * 1.2);
      }
    }
  // The staircase lantern is the highest point of the silhouette.
  cylinder(0, 29.5, -22, 4, 12, trim);
  lantern(0, -22, 41.5, 3.2, 10);
  cap(0, 54, -22, 2, 5, lead);
  cylinder(0, 59, -22, 0.13, 2, gold);
  for (const side of [-1, 1]) {
    block(side * 53, -22, 46, 15, 20);
    const wingRoof = add(hip, slate, side * 53, 20.8, -22, 16.4, 8, 46);
    wingRoof.rotation.y = Math.PI / 2;
    // Replace the unrotated plan rectangle for this transverse roof.
    plans[plans.length - 1].svg =
      `<rect x="${side * 53 - 23}" y="-30.2" width="46" height="16.4" fill="#3e4b59" stroke="#777263" stroke-width="0.25"/>`;
    tower(side * 80, -22, 24, 8);
    for (const offset of [-12, 0, 12]) chimney(side * 53 + offset, -22, 26, 6);
    block(side * 80, 23, 12, 74, 8);
    add(hip, slate, side * 80, 8.8, 23, 13, 5, 75);
    tower(side * 80, 64, 10, 6);
    block(side * 43, 64, 68, 12, 8);
    const frontRoof = add(hip, slate, side * 43, 8.8, 64, 13, 5, 68);
    frontRoof.rotation.y = Math.PI / 2;
    plans[plans.length - 1].svg =
      `<rect x="${side * 43 - 34}" y="57.5" width="68" height="13" fill="#3e4b59" stroke="#777263" stroke-width="0.25"/>`;
  }
  // A real opening through the entrance pavilion keeps access to the court clear.
  const gate = new THREE.Shape();
  gate.moveTo(-9, 0);
  gate.lineTo(-3, 0);
  gate.lineTo(-3, 4);
  gate.absarc(0, 4, 3, Math.PI, 0, true);
  gate.lineTo(3, 0);
  gate.lineTo(9, 0);
  gate.lineTo(9, 11);
  gate.lineTo(-9, 11);
  gate.closePath();
  add(
    new THREE.ExtrudeGeometry(gate, { depth: 12, bevelEnabled: false, curveSegments: 12 }),
    stone,
    0,
    0.4,
    58,
    1,
    1,
    1,
    false
  );
  add(hip, slate, 0, 11.4, 64, 19, 7, 13);
  const plan = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-96 -58 192 139">${plans
    .sort((a, b) => a.y - b.y)
    .map(p => p.svg)
    .join("")}</svg>`;
  return {
    group,
    pickables,
    plan,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}
