import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { createTreeBase } from "./treeBase";

/** Summer boreal trees: whorled evergreen spruce and white-barked, pendulous birch. */
export function createBorealTree(species: "norway_spruce" | "silver_birch"): CityStructureMeshes {
  const spruce = species === "norway_spruce";
  let seed = spruce ? 43071 : 43097;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const positions: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  function timber(geometry: THREE.BufferGeometry, white = false) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position"),
      rgb: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const scar =
        white && (Math.sin(p.getY(i) * 19 + p.getX(i) * 13) * Math.cos(p.getZ(i) * 17) > 0.8 || p.getY(i) < 0.8);
      const c = new THREE.Color(white ? (scar ? 0x4a4941 : 0xdedbd0) : 0x695541);
      rgb.push(c.r, c.g, c.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    wood.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number, white = false) {
    const geometry = new THREE.CylinderGeometry(radius * 0.3, radius, a.distanceTo(b), 6);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    timber(geometry, white);
  }
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  function needles(a: THREE.Vector3, b: THREE.Vector3, width: number) {
    const direction = b.clone().sub(a).normalize(),
      side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    const color = new THREE.Color().setHSL(0.35, 0.35, 0.15 + random() * 0.12);
    for (let i = 0; i < 9; i++) {
      const t = i / 9,
        reach = width * (1 - t * 0.75);
      const p = a.clone().lerp(b, t),
        q = a
          .clone()
          .lerp(b, (i + 1) / 9)
          .addScaledVector(up, 0.04);
      triangle(p, q, p.clone().addScaledVector(side, reach).addScaledVector(direction, 0.09), color);
      triangle(q, p, p.clone().addScaledVector(side, -reach).addScaledVector(direction, 0.09), color);
    }
  }
  function leaves(center: THREE.Vector3, radius: number) {
    for (let i = 0; i < 45; i++) {
      const angle = random() * Math.PI * 2,
        r = Math.sqrt(random()) * radius;
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * r, (random() - 0.5) * radius, Math.sin(angle) * r));
      const blade = new THREE.Vector3(Math.cos(angle), 0.4, Math.sin(angle))
        .normalize()
        .multiplyScalar(0.16 + random() * 0.08);
      const side = new THREE.Vector3(-Math.sin(angle), 0.2, Math.cos(angle)).multiplyScalar(0.1);
      const tip = p.clone().add(blade),
        base = p.clone().addScaledVector(blade, -0.7);
      const ridge = p.clone().addScaledVector(up, 0.025);
      const color = new THREE.Color().setHSL(0.22 + random() * 0.06, 0.42, 0.28 + random() * 0.14);
      triangle(base, p.clone().add(side), ridge, color);
      triangle(ridge, p.clone().add(side), tip, color);
      triangle(base, ridge, p.clone().sub(side), color);
      triangle(ridge, tip, p.clone().sub(side), color);
    }
  }
  const height = spruce ? 12 : 11;
  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: spruce ? 0.3 : 0.25 },
        { center: [0.04, 2, 0], radius: 0.18 },
        { center: [-0.08, 7, 0.08], radius: 0.09 },
        { center: [0, height, 0], radius: 0.006 }
      ],
      0.65,
      5
    ),
    !spruce
  );
  if (spruce) {
    for (let level = 0; level < 12; level++) {
      const y = 1.4 + level * 0.86,
        reach = 2.8 * (1 - level / 13);
      for (let arm = 0; arm < 9; arm++) {
        const angle = (arm * Math.PI * 2) / 9 + level * 0.7;
        const start = new THREE.Vector3(0, y, 0),
          elbow = new THREE.Vector3(Math.cos(angle) * reach * 0.65, y - 0.35, Math.sin(angle) * reach * 0.65);
        const tip = new THREE.Vector3(Math.cos(angle) * reach, y + 0.08, Math.sin(angle) * reach);
        branch(start, elbow, 0.045 * (1 - level / 13));
        branch(elbow, tip, 0.02);
        for (let t = 1; t <= 7; t++)
          for (const sign of [-1, 1]) {
            const a = start.clone().lerp(tip, t / 8);
            a.y -= Math.sin((t / 8) * Math.PI) * 0.35;
            const twig = a
              .clone()
              .add(
                new THREE.Vector3(-Math.sin(angle) * sign * reach * 0.28, -0.18, Math.cos(angle) * sign * reach * 0.28)
              );
            needles(a, twig, 0.22 * (1 - level / 14));
          }
        for (let spray = 0; spray < 5; spray++) {
          const a = start.clone().lerp(tip, 0.12 + spray * 0.16);
          const b = a.clone().add(new THREE.Vector3(Math.cos(angle) * 0.7, 0.15, Math.sin(angle) * 0.7));
          needles(a, b, 0.32 * (1 - level / 16));
        }
        needles(elbow, tip, 0.23);
      }
    }
    needles(new THREE.Vector3(0, 10.5, 0), new THREE.Vector3(0, 12, 0), 0.2);
  } else {
    for (let i = 0; i < 24; i++) {
      const t = i / 24,
        angle = i * 2.39996,
        reach = 2.8 * Math.sin(0.5 + t * 2.2);
      const start = new THREE.Vector3(0, 2.8 + t * 6.8, 0),
        tip = new THREE.Vector3(Math.cos(angle) * reach, 4 + t * 6.4, Math.sin(angle) * reach);
      branch(start, tip, 0.07 * (1 - t * 0.7), i < 8);
      for (let j = 0; j < 5; j++) {
        const a = start.clone().lerp(tip, 0.35 + j * 0.14),
          theta = angle + (j - 2) * 0.45;
        const end = a
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(theta) * (0.6 + random() * 0.6),
              -0.5 - random() * 0.5,
              Math.sin(theta) * (0.6 + random() * 0.6)
            )
          );
        branch(a, end, 0.012);
        leaves(end, 0.6);
        leaves(a.clone().lerp(end, 0.45), 0.6);
      }
      leaves(tip, 0.7);
    }
    leaves(new THREE.Vector3(0, 10.8, 0), 0.65);
  }
  const bark = mergeGeometries(wood)!;
  for (const geometry of wood) geometry.dispose();
  const foliage = new THREE.BufferGeometry();
  foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  foliage.computeVertexNormals();
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(bark, barkMaterial),
    crown = new THREE.Mesh(foliage, leafMaterial);
  trunk.name = spruce ? "spruce-trunk-and-whorled-branches" : "birch-white-bark-and-drooping-branches";
  crown.name = spruce ? "spruce-needle-sprays" : "birch-small-leaves";
  const group = new THREE.Group();
  group.name = species.replaceAll("_", "-");
  group.add(trunk, crown);
  return {
    group,
    pickables: [trunk, crown],
    dispose() {
      bark.dispose();
      foliage.dispose();
      barkMaterial.dispose();
      leafMaterial.dispose();
    }
  };
}
