import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { createTreeBase } from "./treeBase";

/** A gnarled Mediterranean olive and a montane silver fir with level whorls and upright cones. */
export function createMediterraneanMontaneTree(species: "olive" | "silver_fir"): CityStructureMeshes {
  const olive = species === "olive";
  let seed = olive ? 43261 : 43283;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const positions: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  // Olive wood is grey, ridged and twisted; silver fir bark is smooth and whitish grey.
  const bark = (p: THREE.Vector3) =>
    olive
      ? Math.sin(Math.atan2(p.z, p.x) * 7 + p.y * 2.6) > 0.35
        ? 0x4f4a40
        : 0x857d6e
      : Math.sin(p.y * 13 + p.x * 5) * Math.cos(p.z * 9) > 0.8
        ? 0x7d7c76
        : 0xa8a8a0;
  function timber(geometry: THREE.BufferGeometry) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position"),
      rgb: number[] = [],
      v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const c = new THREE.Color(bark(v.fromBufferAttribute(p, i)));
      rgb.push(c.r, c.g, c.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    wood.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, bottom: number, top = bottom * 0.4, sides = 6) {
    const geometry = new THREE.CylinderGeometry(top, bottom, a.distanceTo(b), sides);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    timber(geometry);
  }
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  /** Narrow lance-shaped olive leaves: dark grey-green above, silvery beneath, in loose clusters. */
  function leaves(center: THREE.Vector3, radius: number, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2,
        r = Math.sqrt(random()) * radius;
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * r, (random() - 0.45) * radius * 0.8, Math.sin(angle) * r));
      const heading = random() * Math.PI * 2;
      const along = new THREE.Vector3(Math.cos(heading), (random() - 0.4) * 0.8, Math.sin(heading))
        .normalize()
        .multiplyScalar(0.2 + random() * 0.07);
      const across = new THREE.Vector3(-Math.sin(heading), 0.1, Math.cos(heading)).multiplyScalar(0.035);
      const silver = random() < 0.35;
      const color = new THREE.Color().setHSL(
        silver ? 0.2 : 0.22 + random() * 0.04,
        silver ? 0.1 : 0.2 + random() * 0.1,
        silver ? 0.55 + random() * 0.1 : 0.24 + random() * 0.1
      );
      const tip = p.clone().add(along);
      triangle(p, p.clone().addScaledVector(along, 0.5).add(across), tip, color);
      triangle(p, tip, p.clone().addScaledVector(along, 0.5).sub(across), color);
    }
  }
  /** Flat, two-ranked fir needles along a shoot, curving slightly up at the sides. */
  function needles(a: THREE.Vector3, b: THREE.Vector3, width: number) {
    const direction = b.clone().sub(a).normalize(),
      side = new THREE.Vector3(-direction.z, 0, direction.x);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    side.normalize();
    const color = new THREE.Color().setHSL(0.33 + random() * 0.04, 0.38, 0.14 + random() * 0.08);
    const steps = 8;
    for (let i = 0; i < steps; i++) {
      const t = i / steps,
        reach = width * (1 - t * 0.6);
      const p = a.clone().lerp(b, t),
        q = a.clone().lerp(b, (i + 1) / steps);
      for (const s of [-1, 1])
        triangle(
          p,
          q,
          p
            .clone()
            .addScaledVector(side, s * reach)
            .addScaledVector(direction, 0.06)
            .addScaledVector(up, 0.04),
          color
        );
    }
  }
  if (olive) {
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.55 },
          { center: [0.1, 0.5, 0.05], radius: 0.45 },
          { center: [0.2, 1.1, -0.05], radius: 0.4 }
        ],
        0.85,
        6
      )
    );
    // The aged bole splits into twisting, partly hollow stems that spiral as they rise.
    const crotch = new THREE.Vector3(0.2, 1.1, -0.05);
    for (let s = 0; s < 3; s++) {
      let angle = s * 2.1 + 0.3,
        a = crotch.clone().add(new THREE.Vector3(Math.cos(angle) * 0.2, 0, Math.sin(angle) * 0.2)),
        radius = 0.26;
      for (let step = 0; step < 4; step++) {
        angle += 0.55;
        const b = a.clone().add(new THREE.Vector3(Math.cos(angle) * 0.6, 0.75 + random() * 0.3, Math.sin(angle) * 0.6));
        branch(a, b, radius, radius * 0.75, 7);
        for (let k = 0; k < 3; k++) {
          const theta = angle + (random() - 0.5) * 2.6,
            reach = 1.4 + random() * 1.3;
          const from = a.clone().lerp(b, random());
          const tip = from
            .clone()
            .add(new THREE.Vector3(Math.cos(theta) * reach, 0.4 + random() * 0.9, Math.sin(theta) * reach));
          if (step > 0) {
            branch(from, tip, radius * 0.35, 0.015, 5);
            leaves(tip, 0.95, 260);
            leaves(from.clone().lerp(tip, 0.55), 0.8, 150);
            // A few olives, green ripening to black.
            for (let f = 0; f < 5; f++) {
              const o = tip
                .clone()
                .add(new THREE.Vector3((random() - 0.5) * 1.2, -0.3 - random() * 0.4, (random() - 0.5) * 1.2));
              const fruit = new THREE.Color(random() < 0.5 ? 0x2a2230 : 0x6b7a3a);
              triangle(
                o,
                o.clone().add(new THREE.Vector3(0.03, -0.04, 0)),
                o.clone().add(new THREE.Vector3(-0.02, -0.04, 0.03)),
                fruit
              );
            }
          }
        }
        a = b;
        radius *= 0.72;
      }
      leaves(a, 1.2, 300);
    }
  } else {
    const height = 19.5;
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.5 },
          { center: [0, 1.5, 0], radius: 0.34 },
          { center: [0, 9, 0], radius: 0.24 },
          { center: [0, 16, 0], radius: 0.11 },
          { center: [0, height, 0], radius: 0.01 }
        ],
        0.8,
        6
      )
    );
    // Regular whorls of level branches; the crown stays columnar, rounding off near the top.
    for (let level = 0; level < 20; level++) {
      const t = level / 20,
        y = 2.6 + t * (height - 3.2);
      const reach = 3.4 * Math.min(1, (1 - t) * 1.7) * (1 - t * 0.25) + 0.3;
      for (let arm = 0; arm < 7; arm++) {
        const angle = (arm * Math.PI * 2) / 7 + level * 0.45 + random() * 0.2;
        const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
          side = new THREE.Vector3(-out.z, 0, out.x);
        const start = new THREE.Vector3(0, y, 0);
        const tip = start
          .clone()
          .addScaledVector(out, reach)
          .addScaledVector(up, -0.15 * (1 - t));
        branch(start, tip, 0.05 * (1 - t) + 0.012, 0.006);
        for (let k = 1; k <= 11; k++) {
          const a = start.clone().lerp(tip, k / 12);
          for (const s of [-1, 1]) {
            const shoot = a
              .clone()
              .addScaledVector(side, s * reach * 0.3 * (1 - k / 14))
              .addScaledVector(out, 0.25);
            needles(a, shoot, 0.22);
            needles(
              a.clone().addScaledVector(up, 0.06),
              shoot.clone().addScaledVector(out, 0.2).addScaledVector(up, 0.1),
              0.18
            );
          }
        }
        needles(start.clone().lerp(tip, 0.25), tip.clone().addScaledVector(out, 0.3), 0.24);
      }
    }
    needles(new THREE.Vector3(0, height - 1.5, 0), new THREE.Vector3(0, height + 0.05, 0), 0.12);
    // Silver fir cones stand upright on the topmost branches.
    for (let i = 0; i < 9; i++) {
      const angle = i * 2.39996,
        y = height - 3.2 + random() * 1.6,
        r = 0.35 + random() * 0.45;
      const a = new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r);
      const geometry = new THREE.CylinderGeometry(0.03, 0.055, 0.16, 6);
      geometry.translate(a.x, a.y + 0.08, a.z);
      const flat = geometry.toNonIndexed();
      geometry.dispose();
      const p = flat.getAttribute("position");
      const color = new THREE.Color(0x5a4630);
      for (let j = 0; j < p.count; j += 3)
        triangle(
          new THREE.Vector3().fromBufferAttribute(p, j),
          new THREE.Vector3().fromBufferAttribute(p, j + 1),
          new THREE.Vector3().fromBufferAttribute(p, j + 2),
          color
        );
      flat.dispose();
    }
  }
  const barkGeometry = mergeGeometries(wood)!;
  for (const geometry of wood) geometry.dispose();
  const foliage = new THREE.BufferGeometry();
  foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  foliage.computeVertexNormals();
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(barkGeometry, barkMaterial),
    crown = new THREE.Mesh(foliage, leafMaterial);
  trunk.name = olive ? "olive-gnarled-twisting-stems" : "silver-fir-smooth-trunk-and-level-whorls";
  crown.name = olive ? "olive-silvery-lance-leaves-and-fruit" : "silver-fir-flat-needles-and-upright-cones";
  const group = new THREE.Group();
  group.name = species.replaceAll("_", "-");
  group.add(trunk, crown);
  return {
    group,
    pickables: [trunk, crown],
    dispose() {
      barkGeometry.dispose();
      foliage.dispose();
      barkMaterial.dispose();
      leafMaterial.dispose();
    }
  };
}
