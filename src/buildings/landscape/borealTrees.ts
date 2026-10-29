import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";
import {
  type LeafShoot,
  limbGeometry,
  type TreeAppearanceOptions,
  WINTER_TWIGS,
  winterTwigs
} from "./treeSeasonLayers";

/** Summer boreal trees: whorled evergreen spruce and white-barked, pendulous birch. */
export function createBorealTree(
  species: "norway_spruce" | "silver_birch",
  quality: TreeQuality = "ultra",
  options: TreeAppearanceOptions = {}
): CityStructureMeshes {
  // Bare winter birches keep the leafy skeleton; the registry drops the leaves (seasonalLooks.ts).
  const bare = species === "silver_birch" && options.appearance === "bare";
  if (quality === "low") return createBorealTreeLow(species, bare);
  const shoots: LeafShoot[] = [];
  const spruce = species === "norway_spruce";
  const medium = quality === "medium";
  let seed = spruce ? 43071 : 43097;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const lobes: CanopyLobe[] = [];
  let leafPoints: THREE.Vector3[] = [];
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
    if (medium && radius < 0.025 && !bare) return;
    const geometry = new THREE.CylinderGeometry(radius * 0.3, radius, a.distanceTo(b), medium ? 4 : 6, 1, medium);
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
    if (medium) return;
    for (let i = 0; i < 9; i++) {
      const step = quality === "high" ? 3 : 1;
      if (i % step) continue;
      const t = i / 9,
        reach = width * (1 - t * 0.75);
      const p = a.clone().lerp(b, t),
        q = a
          .clone()
          .lerp(b, (i + step) / 9)
          .addScaledVector(up, 0.04);
      triangle(p, q, p.clone().addScaledVector(side, reach).addScaledVector(direction, 0.09), color);
      triangle(q, p, p.clone().addScaledVector(side, -reach).addScaledVector(direction, 0.09), color);
    }
  }
  function leaves(center: THREE.Vector3, radius: number) {
    const placed: THREE.Vector3[] = [];
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
      placed.push(p);
      // Consume every leaf's randomness at every tier: the later limbs and twigs must not move.
      if (medium) {
        leafPoints.push(p);
        continue;
      }
      if (quality === "high" && i % 5) continue;
      if (quality === "high") {
        side.multiplyScalar(Math.sqrt(5));
        tip.copy(p).addScaledVector(blade, Math.sqrt(5));
        base.copy(p).addScaledVector(blade, -0.7 * Math.sqrt(5));
      }
      triangle(base, p.clone().add(side), ridge, color);
      triangle(ridge, p.clone().add(side), tip, color);
      triangle(base, ridge, p.clone().sub(side), color);
      triangle(ridge, tip, p.clone().sub(side), color);
    }
    return placed;
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
        if (medium) {
          // A flat, drooping eight-face spray follows each original whorled branch, not a solid cone.
          const side = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
          const ring = [
            start.clone().lerp(tip, 0.12),
            elbow.clone().addScaledVector(side, reach * 0.28),
            tip.clone(),
            elbow.clone().addScaledVector(side, -reach * 0.28)
          ];
          const center = start.clone().lerp(tip, 0.65);
          center.y -= 0.2;
          const top = center.clone().addScaledVector(up, 0.2),
            bottom = center.clone().addScaledVector(up, -0.15);
          const shade = new THREE.Color().setHSL(0.35, 0.35, 0.21 + Math.sin(level + arm) * 0.025);
          for (let i = 0; i < ring.length; i++) {
            triangle(ring[i], top, ring[(i + 1) % ring.length], shade);
            triangle(ring[i], ring[(i + 1) % ring.length], bottom, shade);
          }
        }
      }
    }
    needles(new THREE.Vector3(0, 10.5, 0), new THREE.Vector3(0, 12, 0), 0.2);
    if (medium) {
      const leader = new THREE.ConeGeometry(0.22, 1.5, 5);
      leader.translate(0, 11.25, 0);
      const p = leader.toNonIndexed();
      const a = p.getAttribute("position");
      for (let i = 0; i < a.count; i += 3)
        triangle(
          ...([0, 1, 2].map(j => new THREE.Vector3().fromBufferAttribute(a, i + j)) as [
            THREE.Vector3,
            THREE.Vector3,
            THREE.Vector3
          ]),
          new THREE.Color(0x294a30)
        );
      leader.dispose();
      p.dispose();
    }
  } else {
    for (let i = 0; i < 24; i++) {
      leafPoints = [];
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
        shoots.push({ base: a, tip: end, points: [...leaves(end, 0.6), ...leaves(a.clone().lerp(end, 0.45), 0.6)] });
      }
      shoots.push({ base: start.clone().lerp(tip, 0.7), tip, points: leaves(tip, 0.7) });
      if (medium) {
        // Two fitted halves retain the drooping crown of each main branch and its open white trunk.
        const mid = leafPoints.reduce((sum, p) => sum + p.y, 0) / leafPoints.length;
        for (const points of [leafPoints.filter(p => p.y < mid), leafPoints.filter(p => p.y >= mid)])
          if (points.length) lobes.push(fitCanopyLobe(points, 1.1));
      }
    }
    leafPoints = [];
    leaves(new THREE.Vector3(0, 10.8, 0), 0.65);
    if (medium) lobes.push(fitCanopyLobe(leafPoints, 1.1));
  }
  // A fine haze of pendulous twigs gives the winter birch its purplish crown.
  if (bare)
    for (const shoot of shoots)
      for (const [from, to] of winterTwigs(shoot, WINTER_TWIGS[quality])) branch(from, to, medium ? 0.01 : 0.005);
  const bark = mergeGeometries(wood)!;
  for (const geometry of wood) geometry.dispose();
  const foliage =
    medium && !spruce
      ? createCanopyLobes(lobes, { hue: 0.25, saturation: 0.42, lightness: 0.35 }, 43097)
      : new THREE.BufferGeometry();
  if (!medium || spruce) {
    foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    foliage.computeVertexNormals();
  }
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(bark, barkMaterial),
    crown = new THREE.Mesh(foliage, leafMaterial);
  trunk.name = spruce ? "spruce-trunk-and-whorled-branches" : "birch-white-bark-and-drooping-branches";
  crown.name = spruce ? "spruce-needle-sprays" : "birch-small-leaves";
  const group = new THREE.Group();
  group.name = species.replaceAll("_", "-");
  group.userData.treeQuality = quality;
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

/** Small silhouettes preserve separate spruce whorls and the birch's light crown and white stem. */
function createBorealTreeLow(species: "norway_spruce" | "silver_birch", bare = false): CityStructureMeshes {
  const spruce = species === "norway_spruce";
  const stem = createTreeBase(
    [
      { center: [0, 0, 0], radius: spruce ? 0.3 : 0.25 },
      { center: [0.04, 2, 0], radius: 0.18 },
      { center: [-0.08, 7, 0.08], radius: 0.09 },
      { center: [0, spruce ? 12 : 11, 0], radius: 0.006 }
    ],
    0.65,
    5
  );
  // A bare distant birch shows its twelve main limbs where the lobes were.
  const limbs: [THREE.Vector3, THREE.Vector3, number][] = [];
  if (bare)
    for (const i of [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]) {
      const t = i / 24,
        angle = i * 2.39996,
        reach = 2.8 * Math.sin(0.5 + t * 2.2);
      limbs.push([
        new THREE.Vector3(0, 2.8 + t * 6.8, 0),
        new THREE.Vector3(Math.cos(angle) * (reach + 0.9), 4 + t * 6.4 - 0.6, Math.sin(angle) * (reach + 0.9)),
        0.06 * (1 - t * 0.6)
      ]);
    }
  const bark = limbs.length ? mergeGeometries([stem, ...limbGeometry(limbs)])! : stem;
  const lobes: CanopyLobe[] = [];
  if (!spruce)
    for (const i of [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]) {
      const t = i / 24,
        angle = i * 2.39996,
        reach = 2.8 * Math.sin(0.5 + t * 2.2);
      lobes.push({
        center: new THREE.Vector3(Math.cos(angle) * reach, 4 + t * 6.4 - 0.25, Math.sin(angle) * reach),
        radius: new THREE.Vector3(1.35, 1, 1.35)
      });
    }
  if (!spruce) lobes.push({ center: new THREE.Vector3(0, 10.8, 0), radius: new THREE.Vector3(0.65, 0.4, 0.65) });
  let foliage: THREE.BufferGeometry;
  if (spruce) {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 8; i++) {
      const top = i === 7 ? 12.04 : 3.5 + i * 1.08;
      const radius = i === 7 ? 0.45 : 2.78 * (1 - i / 8);
      const g = new THREE.ConeGeometry(radius, top - (1.05 + i * 1.08), 7, 1, true);
      g.translate(0, (top + 1.05 + i * 1.08) / 2, 0);
      g.rotateY(i * 0.7);
      parts.push(g);
    }
    foliage = mergeGeometries(parts)!;
    for (const g of parts) g.dispose();
  } else foliage = createCanopyLobes(lobes, { hue: 0.25, saturation: 0.42, lightness: 0.35 }, 43097);
  const barkMaterial = new THREE.MeshLambertMaterial({ color: spruce ? 0x695541 : 0xdedbd0 });
  const foliageMaterial = new THREE.MeshLambertMaterial(
    spruce ? { color: 0x315638, side: THREE.DoubleSide } : { vertexColors: true }
  );
  const trunk = new THREE.Mesh(bark, barkMaterial),
    crown = new THREE.Mesh(foliage, foliageMaterial);
  const group = new THREE.Group();
  group.name = species.replaceAll("_", "-");
  group.userData.treeQuality = "low";
  trunk.name = `${species}-structural-wood`;
  crown.name = `${species}-canopy-silhouette`;
  group.add(trunk, crown);
  return {
    group,
    pickables: [trunk, crown],
    dispose() {
      bark.dispose();
      foliage.dispose();
      barkMaterial.dispose();
      foliageMaterial.dispose();
    }
  };
}
