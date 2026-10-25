import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

/** Illustrative medieval belfry, in meters, with the assault bridge facing positive X. */
export const SIEGE_TOWER = {
  name: "Medieval European siege tower",
  length: 9.2,
  width: 5.6,
  height: 11.2,
  note: "Illustrative medieval European timber belfry with four wheels, three fighting levels, internal ladders, hide protection and a lowered assault bridge supported by winch ropes. Inspired by historical siege-tower descriptions; dimensions and details are interpretive, not a reconstruction of a specific engine. Static model without crew."
} as const;

export function createSiegeTowerModel(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "medieval-european-siege-tower";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const wood = [0x80603e, 0x957148, 0xa37d50, 0x896541].map(color => new THREE.MeshLambertMaterial({ color }));
  const dark = new THREE.MeshLambertMaterial({ color: 0x4c3827 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x343b3c });
  const rope = new THREE.MeshLambertMaterial({ color: 0xc4ad7b });
  const hides = [0x8c7960, 0xa18d70, 0x97836a, 0xb09a7a].map(color => new THREE.MeshLambertMaterial({ color }));
  const materials = [...wood, dark, iron, rope, ...hides];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 12);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = wood[0]) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, width: number, material = wood[0], round = false) {
    const mesh = add(name, round ? cylinder : cube, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(width, a.distanceTo(b), width);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  function ring(inner: number, outer: number, depth: number) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
    geometry.translate(0, 0, -depth / 2);
    return geometry;
  }
  const felloe = ring(0.66, 0.87, 0.32);
  const tire = ring(0.87, 0.9, 0.35);
  for (const x of [-1.85, 1.85]) {
    beam("axle", v(x, 0.9, -2.7), v(x, 0.9, 2.7), 0.22, dark, true);
    box("axle-bolster", x, 1.16, 0, 0.5, 0.4, 4.2, dark);
    for (const side of [-1, 1]) {
      const z = side * 2.42;
      add("wheel-felloe", felloe, wood[0]).position.set(x, 0.9, z);
      add("wheel-iron-tire", tire, iron).position.set(x, 0.9, z);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        beam("wheel-spoke", v(x, 0.9, z), v(x + Math.cos(a) * 0.77, 0.9 + Math.sin(a) * 0.77, z), 0.1, wood[i % 4]);
      }
      beam("wheel-hub", v(x, 0.9, z - 0.24), v(x, 0.9, z + 0.24), 0.24, dark, true);
      beam("axle-linchpin", v(x, 0.72, side * 2.7), v(x, 1.08, side * 2.7), 0.045, iron, true);
    }
  }
  for (const z of [-1.8, 1.8]) box("chassis-rail", 0, 1.4, z, 5.5, 0.45, 0.4, dark);
  const half = (y: number) => 2.12 - (y - 1.5) * 0.045;
  const levels = [1.65, 4.55, 7.45];
  // Slightly battered posts carry the floors; the rear remains open to reveal the joinery and ladders.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      beam("corner-post", v(sx * half(1.5), 1.5, sz * 1.8), v(sx * half(10.5), 10.5, sz * 1.8), 0.28);
      for (const y of levels) box("post-iron-collar", sx * half(y), y + 0.2, sz * 1.8, 0.32, 0.13, 0.32, iron);
    }
  for (let level = 0; level < levels.length; level++) {
    const y = levels[level],
      h = half(y);
    for (const z of [-1.65, 0, 1.65]) box("floor-joist", 0, y - 0.14, z, h * 2 + 0.3, 0.22, 0.18, dark);
    for (let i = 0; i < 16; i++) {
      const x = -h + (i + 0.5) * ((h * 2) / 16);
      // A real hatch in each upper deck allows the ladder to emerge without crossing solid decking.
      const hatch = level > 0 && x < -h + 0.85;
      box("floor-plank", x, y, hatch ? 0.46 : 0, (h * 2) / 16 - 0.012, 0.12, hatch ? 2.48 : 3.4, wood[i % 4]);
    }
    for (const side of [-1, 1]) {
      const z = side * 1.8;
      box("level-tie", 0, y + 0.1, z, h * 2, 0.22, 0.22);
      beam("side-diagonal-brace", v(-h + 0.1, y + 0.2, z), v(half(y + 2.7) - 0.1, y + 2.7, z), 0.16, dark);
      beam("side-diagonal-brace", v(h - 0.1, y + 0.2, z), v(-half(y + 2.7) + 0.1, y + 2.7, z), 0.16, dark);
      // Individually laid side planks and hide tiles leave narrow arrow slits in the middle tier.
      for (let row = 0; row < 9; row++) {
        const py = y + 0.36 + row * 0.27;
        const ph = half(py);
        for (const section of [-1, 1]) {
          const slit = row >= 4 && row <= 6;
          const gap = slit ? 0.15 : 0.012;
          box(
            "side-cladding",
            section * (ph / 2 + gap / 2),
            py,
            z + side * 0.12,
            ph - gap,
            0.257,
            0.08,
            wood[(row + level) % 4]
          );
        }
      }
      for (let col = 0; col < 4; col++)
        for (let row = 0; row < 3; row++) {
          if (col === 1 && row === 1) continue;
          const py = y + 0.61 + row * 0.78;
          const x = (-1.5 + col) * ((half(py) * 2) / 4);
          box(
            "hide-panel",
            x,
            py,
            z + side * 0.18,
            (half(py) * 2) / 4 - 0.04,
            0.73,
            0.035,
            hides[(col + row + level) % 4]
          );
          for (const dx of [-0.32, 0.32])
            box("hide-fastener", x + dx, py + 0.29, z + side * 0.205, 0.035, 0.035, 0.025, iron);
        }
    }
    // Front protection stops at the bridge deck to leave a full-height assault doorway.
    if (level < 2)
      for (let row = 0; row < 10; row++) {
        const py = y + 0.3 + row * 0.26;
        box("front-plank", half(py) + 0.1, py, 0, 0.1, 0.25, 3.5, wood[row % 4]);
        for (let col = 0; col < 4; col++)
          box("front-hide-panel", half(py) + 0.17, py, -1.3 + col * 0.87, 0.035, 0.245, 0.83, hides[(row + col) % 4]);
      }
    if (level < 2) {
      const bottom = v(-0.6, y + 0.1, -1.1),
        top = v(-half(levels[level + 1]) + 0.46, levels[level + 1] + 0.6, -1.1);
      for (const dz of [-0.3, 0.3])
        beam("ladder-stile", bottom.clone().add(v(0, 0, dz)), top.clone().add(v(0, 0, dz)), 0.075, wood[2]);
      for (let i = 0; i < 11; i++) {
        const p = bottom.clone().lerp(top, i / 11);
        beam("ladder-rung", p.clone().add(v(0, 0, -0.3)), p.clone().add(v(0, 0, 0.3)), 0.055, wood[1], true);
      }
    }
    // Rear safety rails frame the open access side.
    for (const z of [-1.1, 1.1]) box("rear-rail", -half(y + 1), y + 1, z, 0.12, 0.15, 1.15);
  }
  // Crenellated shooting parapet and a light, pitched timber canopy over the top platform.
  for (const side of [-1, 1]) {
    box("upper-parapet", 0, 8, side * 1.88, 3.8, 1, 0.14);
    for (let i = 0; i < 6; i++)
      box("parapet-merlon", -1.58 + i * 0.63, 8.77, side * 1.88, 0.4, 0.55, 0.16, wood[i % 4]);
    for (const x of [-1.7, 1.7]) beam("canopy-rafter", v(x, 10.25, side * 2.05), v(x, 11, 0), 0.13);
    const angle = Math.atan2(0.75, 2.05);
    for (let i = 0; i < 18; i++) {
      const roof = box(
        "canopy-plank",
        -1.98 + i * 0.233,
        10.625,
        side * 1.025,
        0.225,
        0.085,
        Math.hypot(2.05, 0.75),
        wood[i % 4]
      );
      roof.rotation.x = side * angle;
    }
  }
  box("canopy-ridge", 0, 11.04, 0, 4.3, 0.14, 0.16, dark);
  // Hinged bridge is lowered horizontally; paired ropes lead to an actual transverse winch.
  const hingeX = half(7.45) + 0.18;
  beam("bridge-hinge", v(hingeX, 7.45, -1.35), v(hingeX, 7.45, 1.35), 0.12, iron, true);
  for (const z of [-1.05, 1.05]) box("bridge-stringer", hingeX + 1.8, 7.3, z, 3.6, 0.22, 0.2, dark);
  for (let i = 0; i < 18; i++) box("bridge-plank", hingeX + 0.1 + i * 0.2, 7.46, 0, 0.19, 0.12, 2.55, wood[i % 4]);
  beam("winch-drum", v(0.8, 8.35, -1.52), v(0.8, 8.35, 1.52), 0.17, dark, true);
  for (const side of [-1, 1]) {
    box("winch-bearing", 0.8, 7.95, side * 1.45, 0.22, 1, 0.22);
    beam("bridge-hoist-rope", v(hingeX + 3.45, 7.55, side * 1.17), v(hingeX, 9.65, side * 1.4), 0.035, rope, true);
    beam("winch-rope", v(hingeX, 9.65, side * 1.4), v(0.8, 8.5, side * 1.15), 0.035, rope, true);
    const pulley = add("hoist-pulley", new THREE.TorusGeometry(0.13, 0.035, 6, 16), iron);
    pulley.position.set(hingeX, 9.65, side * 1.4);
    for (const dy of [-0.4, 0.4])
      beam("winch-handspike", v(0.8, 8.35, side * 1.6), v(0.8 + dy, 8.35 + dy, side * 1.6), 0.06, wood[2]);
  }
  for (let i = 0; i < 12; i++) {
    const coil = add("winch-rope-coil", new THREE.TorusGeometry(0.19, 0.023, 5, 12), rope);
    coil.position.set(0.8, 8.35, -0.45 + i * 0.08);
  }
  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createSiegeTower() {
  const model = createSiegeTowerModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
