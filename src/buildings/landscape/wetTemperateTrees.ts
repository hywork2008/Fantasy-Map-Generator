import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { createTreeBase } from "./treeBase";

/** Wet temperate trees: a fluted western red cedar and a multi-stemmed black alder of the carr. */
export function createWetTemperateTree(species: "western_red_cedar" | "black_alder"): CityStructureMeshes {
  const cedar = species === "western_red_cedar";
  let seed = cedar ? 43201 : 43223;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const positions: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  // Cedar bark peels in long reddish strips; alder bark is dark grey-brown and finely cracked.
  const bark = (p: THREE.Vector3) =>
    cedar
      ? Math.sin(Math.atan2(p.z, p.x) * 19 + p.y * 0.4) > 0.45
        ? 0x6a3f2a
        : 0x93583a
      : Math.sin(p.y * 29 + p.x * 11) * Math.cos(p.z * 25) > 0.55
        ? 0x2f2a25
        : 0x4c443b;
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
  /** A flat, frond-like cedar spray of scale leaves: a midrib with alternating, tapering side lobes. */
  function spray(a: THREE.Vector3, b: THREE.Vector3, width: number) {
    const direction = b.clone().sub(a),
      length = direction.length();
    direction.normalize();
    const side = new THREE.Vector3(-direction.z, 0, direction.x);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    side.normalize();
    const color = new THREE.Color().setHSL(0.27 + random() * 0.04, 0.42, 0.17 + random() * 0.1);
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const t = i / steps,
        p = a.clone().addScaledVector(direction, length * t),
        q = a.clone().addScaledVector(direction, length * (t + 1 / steps));
      const reach = width * (1 - t * 0.7),
        s = i % 2 ? 1 : -1;
      const lobe = p
        .clone()
        .addScaledVector(side, s * reach)
        .addScaledVector(direction, length * 0.12)
        .addScaledVector(up, -0.05);
      triangle(p, lobe, q, color);
      triangle(
        q,
        p
          .clone()
          .addScaledVector(side, -s * reach * 0.6)
          .addScaledVector(direction, length * 0.08),
        p,
        color
      );
    }
  }
  /** Rounded alder leaves with the characteristic notched tip, scattered in loose clumps. */
  function leaves(center: THREE.Vector3, radius: number, count: number) {
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2,
        r = Math.sqrt(random()) * radius;
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * r, (random() - 0.5) * radius * 0.9, Math.sin(angle) * r));
      const heading = random() * Math.PI * 2,
        size = 0.13 + random() * 0.05;
      const along = new THREE.Vector3(Math.cos(heading), 0.3 + random() * 0.3, Math.sin(heading))
        .normalize()
        .multiplyScalar(size);
      const across = new THREE.Vector3(-Math.sin(heading), 0.1, Math.cos(heading)).multiplyScalar(size * 0.55);
      const color = new THREE.Color().setHSL(0.27 + random() * 0.04, 0.4 + random() * 0.1, 0.17 + random() * 0.09);
      const tip = p.clone().add(along),
        notch = p.clone().addScaledVector(along, 0.8);
      const shoulderL = p.clone().addScaledVector(along, 0.75).add(across),
        shoulderR = p.clone().addScaledVector(along, 0.75).sub(across);
      const waistL = p.clone().addScaledVector(along, 0.3).addScaledVector(across, 0.8),
        waistR = p.clone().addScaledVector(along, 0.3).addScaledVector(across, -0.8);
      triangle(p, waistL, notch, color);
      triangle(waistL, shoulderL, notch, color);
      triangle(shoulderL, tip.clone().add(across.clone().multiplyScalar(0.4)), notch, color);
      triangle(p, notch, waistR, color);
      triangle(waistR, notch, shoulderR, color);
      triangle(shoulderR, notch, tip.clone().sub(across.clone().multiplyScalar(0.4)), color);
    }
  }
  if (cedar) {
    const height = 18.5;
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.95 },
          { center: [0, 0.6, 0], radius: 0.62 },
          { center: [0, 1.8, 0], radius: 0.46 },
          { center: [0.05, 8, 0.04], radius: 0.32 },
          { center: [0, 14, 0], radius: 0.16 },
          { center: [0, height, 0], radius: 0.01 }
        ],
        1.2,
        8
      )
    );
    // J-shaped limbs: droop from the trunk, then sweep their tips upward; hanging sprays below.
    for (let level = 0; level < 16; level++) {
      const t = level / 16,
        y = 3 + t * (height - 3.8),
        reach = 4.3 * (1 - t) ** 0.85 + 0.4;
      for (let arm = 0; arm < 8; arm++) {
        const angle = arm * 0.785 + level * 0.62 + random() * 0.3;
        const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const start = new THREE.Vector3(0, y, 0);
        const sag = start
          .clone()
          .addScaledVector(out, reach * 0.55)
          .addScaledVector(up, -0.6 * (1 - t) - 0.1);
        const tip = start
          .clone()
          .addScaledVector(out, reach)
          .addScaledVector(up, 0.3 + 0.4 * (1 - t));
        branch(start, sag, 0.07 * (1 - t) + 0.015, 0.035 * (1 - t) + 0.01);
        branch(sag, tip, 0.035 * (1 - t) + 0.01, 0.006);
        for (let k = 0; k < 10; k++) {
          const a = start
            .clone()
            .lerp(sag, 0.4)
            .lerp(tip, k / 10);
          a.y -= Math.sin((k / 10) * Math.PI) * 0.25 * (1 - t);
          const s = k % 2 ? 1 : -1;
          const hang = a
            .clone()
            .addScaledVector(new THREE.Vector3(-out.z, 0, out.x), s * reach * 0.3)
            .addScaledVector(out, 0.25)
            .addScaledVector(up, -0.9 * (1 - t) - 0.25);
          spray(a, hang, 0.5 * (1 - t * 0.5));
        }
        spray(sag, tip.clone().addScaledVector(out, 0.35), 0.5 * (1 - t * 0.5));
      }
    }
    // The leader droops gently, as cedars' tops typically do.
    spray(new THREE.Vector3(0, height - 1.2, 0), new THREE.Vector3(0.35, height + 0.1, 0.1), 0.25);
  } else {
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.45 },
          { center: [0, 0.4, 0], radius: 0.36 },
          { center: [0, 0.9, 0], radius: 0.34 }
        ],
        0.9,
        6
      )
    );
    // Arched, partly exposed roots of a waterlogged carr site.
    for (let i = 0; i < 7; i++) {
      const angle = i * 0.9 + random() * 0.3;
      const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const a = out.clone().multiplyScalar(0.25).setY(0.5),
        b = out.clone().multiplyScalar(0.75).setY(0.35),
        c = out.clone().multiplyScalar(1.15).setY(-0.05);
      branch(a, b, 0.09, 0.07);
      branch(b, c, 0.07, 0.04);
    }
    // Coppice-like stems rise from one stool into a narrow, oval crown.
    const stool = new THREE.Vector3(0, 0.9, 0);
    for (let s = 0; s < 3; s++) {
      const angle = s * 2.1 + 0.4,
        tall = s === 0 ? 12.5 : 10.5 + random() * 1.2;
      const lean = new THREE.Vector3(Math.cos(angle) * 0.9, 0, Math.sin(angle) * 0.9);
      const top = stool.clone().add(lean).setY(tall);
      const middle = stool.clone().lerp(top, 0.45).add(lean.clone().multiplyScalar(0.25));
      branch(stool, middle, s === 0 ? 0.24 : 0.18, 0.14);
      branch(middle, top, 0.14, 0.02);
      for (let i = 0; i < 13; i++) {
        const t = 0.25 + (i / 13) * 0.7,
          theta = i * 2.39996 + s;
        const from = t < 0.45 ? stool.clone().lerp(middle, t / 0.45) : middle.clone().lerp(top, (t - 0.45) / 0.55);
        const reach = 2.4 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + 0.4;
        const tip = from
          .clone()
          .add(new THREE.Vector3(Math.cos(theta) * reach, 0.8 + random() * 0.6, Math.sin(theta) * reach));
        branch(from, tip, 0.05 * (1.2 - t), 0.01, 5);
        leaves(tip, 0.9, 55);
        leaves(from.clone().lerp(tip, 0.55), 0.75, 35);
        // Dark woody "cones" and hanging catkins persist on the twigs.
        if (i % 3 === 0) {
          const cone = new THREE.Color(0x2b2218);
          for (let k = 0; k < 4; k++) {
            const p = tip
              .clone()
              .add(new THREE.Vector3((random() - 0.5) * 0.5, -0.1 - random() * 0.2, (random() - 0.5) * 0.5));
            triangle(
              p,
              p.clone().add(new THREE.Vector3(0.025, -0.06, 0)),
              p.clone().add(new THREE.Vector3(-0.025, -0.06, 0.02)),
              cone
            );
          }
        }
      }
      leaves(top, 0.9, 60);
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
  trunk.name = cedar ? "cedar-fluted-trunk-and-j-limbs" : "alder-coppice-stems-and-arched-roots";
  crown.name = cedar ? "cedar-scale-leaf-sprays" : "alder-notched-leaves-and-cones";
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
