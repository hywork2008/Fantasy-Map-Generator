import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";

export const BOJNICE = {
  author: "Codex GPT-6.1 Sol",
  name: "Bojnice Castle",
  width: 100,
  depth: 100,
  height: 64,
  source: "https://bojnicecastle.sk/en/bojnice-castle/",
  note: "Schematic exterior inspired by the romantic reconstruction of 1889–1910. Layout and dimensions are illustrative, not surveyed. Interiors, sculpture, gardens and underground cave are omitted."
} as const;

export function createBojnice(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "bojnice-castle";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const stone = new THREE.MeshLambertMaterial({ color: 0xd4be99 });
  const trim = new THREE.MeshLambertMaterial({ color: 0xe5d3ae });
  const roof = new THREE.MeshLambertMaterial({ color: 0x47777b });
  const dark = new THREE.MeshLambertMaterial({ color: 0x38434a });
  const rock = new THREE.MeshLambertMaterial({ color: 0x989080, flatShading: true });
  const materials = [stone, trim, roof, dark, rock];
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, material = stone) =>
    add(new THREE.BoxGeometry(w, h, d), material, x, y + h / 2, z);
  const cylinder = (x: number, y: number, z: number, r: number, h: number, material = stone, top = r) =>
    add(new THREE.CylinderGeometry(top, r, h, 20), material, x, y + h / 2, z);
  const cone = (x: number, y: number, z: number, r: number, h: number) =>
    add(new THREE.ConeGeometry(r, h, 20), roof, x, y + h / 2, z);
  const windowShape = new THREE.Shape();
  windowShape.moveTo(-0.55, 0);
  windowShape.lineTo(0.55, 0);
  windowShape.lineTo(0.55, 1.65);
  windowShape.quadraticCurveTo(0.5, 2.1, 0, 2.5);
  windowShape.quadraticCurveTo(-0.5, 2.1, -0.55, 1.65);
  windowShape.closePath();
  const windowGeometry = new THREE.ShapeGeometry(windowShape, 4);
  const window = (x: number, y: number, z: number, angle = 0) => {
    const mesh = add(windowGeometry, dark, x, y, z);
    mesh.rotation.y = angle;
  };
  function tower(x: number, z: number, r: number, h: number, rise: number, base = 5) {
    cylinder(x, base, z, r + 0.6, 1.2, trim);
    cylinder(x, base + 1.2, z, r, h - 1.2);
    cylinder(x, base + h - 1, z, r + 0.4, 1, trim);
    cone(x, base + h, z, r + 0.8, rise);
    cylinder(x, base + h + rise, z, 0.14, 1.2, trim);
    for (let y = base + 5; y < base + h - 3; y += 6) {
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4;
        window(x + Math.sin(a) * (r + 0.025), y, z + Math.cos(a) * (r + 0.025), a);
      }
    }
  }
  function palace(x: number, z: number, w: number, d: number, h: number, rise: number, base = 5) {
    box(x, base, z, w, h, d);
    box(x, base + h - 0.6, z, w + 0.6, 0.6, d + 0.6, trim);
    // A four-sided steep hip with a short ridge.
    const hw = w / 2 + 0.7;
    const hd = d / 2 + 0.7;
    const ridge = Math.max(0, (d - w) / 2);
    const vertices = [-hw, 0, -hd, hw, 0, -hd, hw, 0, hd, -hw, 0, hd, 0, rise, -ridge, 0, rise, ridge];
    const hip = new THREE.BufferGeometry();
    hip.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    hip.setIndex([0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 3, 5, 4, 3, 4, 0, 0, 1, 2, 0, 2, 3]);
    hip.computeVertexNormals();
    add(hip, roof, x, base + h, z);
    for (let y = base + 4; y < base + h - 2; y += 5.5) {
      for (let dx = -w / 2 + 3; dx < w / 2 - 1; dx += 4) {
        window(x + dx, y, z + d / 2 + 0.03);
        window(x + dx, y, z - d / 2 - 0.03, Math.PI);
      }
      for (let dz = -d / 2 + 3; dz < d / 2 - 1; dz += 4) {
        window(x + w / 2 + 0.03, y, z + dz, Math.PI / 2);
        window(x - w / 2 - 0.03, y, z + dz, -Math.PI / 2);
      }
    }
  }
  // Travertine terrace, open courtyard and an asymmetric cluster of palace wings.
  const mound = add(new THREE.CylinderGeometry(45, 50, 5, 14), rock, 0, 2.5, 0);
  mound.scale.z = 0.9;
  box(0, 5, 0, 65, 0.25, 64, trim);
  palace(-23, -2, 17, 49, 22, 13);
  palace(19, -5, 18, 43, 28, 15);
  palace(-2, -24, 28, 15, 30, 12);
  palace(18, 21, 20, 16, 18, 11);
  tower(-30, 22, 8, 24, 18);
  tower(29, -22, 7, 34, 20);
  tower(-29, -25, 5, 27, 17);
  tower(29, 20, 5.5, 24, 16);
  // Tall square upper keep with four roofline turrets.
  palace(0, -22, 18, 19, 41, 17);
  for (const x of [-8, 8]) for (const z of [-30, -14]) tower(x, z, 1.8, 9, 8, 45);
  // Small attached turrets give the lower palace its stepped silhouette.
  tower(-30, 4, 2.7, 12, 10, 21);
  tower(27, -2, 2.6, 12, 11, 29);
  // Entrance curtain with a genuine open arch, rather than a painted doorway.
  box(-20, 5, 29, 10, 9, 3);
  box(8, 5, 29, 18, 9, 3);
  const gate = new THREE.Shape();
  gate.moveTo(-6, 0);
  gate.lineTo(-3, 0);
  gate.lineTo(-3, 4);
  gate.absarc(0, 4, 3, Math.PI, 0, true);
  gate.lineTo(3, 0);
  gate.lineTo(6, 0);
  gate.lineTo(6, 11);
  gate.lineTo(-6, 11);
  gate.closePath();
  add(new THREE.ExtrudeGeometry(gate, { depth: 4, bevelEnabled: false, curveSegments: 12 }), stone, -9, 5, 27);
  for (let x = -24; x <= 16; x += 3) box(x, 14, 29, 1.5, 1, 3, trim);
  box(-9, 5.1, 37, 6, 0.3, 16, trim);
  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

/** Plan is projected from the same meshes, keeping the drawing aligned with the model. */
export function bojnicePlan(model: CityStructureMeshes): string {
  const paths: string[] = [];
  model.group.updateMatrixWorld(true);
  for (const mesh of [...model.pickables].sort(
    (a, b) => new THREE.Box3().setFromObject(a).max.y - new THREE.Box3().setFromObject(b).max.y
  )) {
    if (mesh.geometry.type === "ShapeGeometry") continue;
    const bounds = new THREE.Box3().setFromObject(mesh);
    const fill =
      mesh.material instanceof THREE.MeshLambertMaterial ? `#${mesh.material.color.getHexString()}` : "#c9b58c";
    const style = `fill="${fill}" stroke="#665f51" stroke-width="0.2"`;
    if (["CylinderGeometry", "ConeGeometry"].includes(mesh.geometry.type)) {
      paths.push(
        `<ellipse cx="${mesh.position.x}" cy="${mesh.position.z}" rx="${(bounds.max.x - bounds.min.x) / 2}" ry="${(bounds.max.z - bounds.min.z) / 2}" ${style}/>`
      );
    } else {
      paths.push(
        `<rect x="${bounds.min.x}" y="${bounds.min.z}" width="${bounds.max.x - bounds.min.x}" height="${bounds.max.z - bounds.min.z}" ${style}/>`
      );
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-53 -48 106 96">${paths.join("")}</svg>`;
}
