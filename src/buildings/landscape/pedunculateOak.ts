import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";
import { type LeafShoot, type TreeAppearanceOptions, WINTER_TWIGS, winterTwigs } from "./treeSeasonLayers";

/** Summer Quercus robur: furrowed timber, crooked spreading limbs and lobed leaves. */
export function createPedunculateOak(
  quality: TreeQuality = "ultra",
  options: TreeAppearanceOptions = {}
): CityStructureMeshes {
  const low = quality === "low";
  const medium = quality === "medium";
  const reduced = low || medium;
  // Bare winter trees keep the leafy skeleton; the registry drops the leaves (seasonalLooks.ts).
  const bare = options.appearance === "bare";
  const shoots: LeafShoot[] = [];
  let seed = 43163;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const up = new THREE.Vector3(0, 1, 0);
  const crownCenter = new THREE.Vector3(0, 11.5, 0);
  const wood: THREE.BufferGeometry[] = [];
  const lobes: CanopyLobe[] = [];
  const crownPoints: THREE.Vector3[] = [];
  const positions: number[] = [],
    colors: number[] = [],
    normals: number[] = [];
  function timber(geometry: THREE.BufferGeometry) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position");
    const rgb: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const groove = Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 19 + Math.sin(p.getY(i) * 0.7));
      const color = new THREE.Color().setHSL(0.095, 0.18, 0.26 + groove * 0.055);
      rgb.push(color.r, color.g, color.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    wood.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const geometry = new THREE.CylinderGeometry(
      radius * 0.65,
      radius,
      a.distanceTo(b),
      low ? 4 : medium ? 5 : 9,
      1,
      true
    );
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    timber(geometry);
  }
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const point of [a, b, c]) {
      positions.push(point.x, point.y, point.z);
      colors.push(color.r, color.g, color.b);
      const n = normal
        .clone()
        .lerp(point.clone().sub(crownCenter).normalize(), 0.6)
        .addScaledVector(up, 0.25)
        .normalize();
      normals.push(n.x, n.y, n.z);
    }
  }
  function spray(center: THREE.Vector3, angle: number) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 84; i++) {
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      const point = center
        .clone()
        .add(new THREE.Vector3(Math.cos(theta) * r * 1.55, (random() - 0.5) * 2.2, Math.sin(theta) * r * 1.55));
      const yaw = angle + (random() - 0.5) * 3;
      const blade = new THREE.Vector3(Math.cos(yaw), (random() - 0.4) * 1.7, Math.sin(yaw)).normalize();
      const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      const length = 0.3 + random() * 0.07;
      const width = length * (0.56 + random() * 0.08);
      const color = new THREE.Color().setHSL(0.24 + random() * 0.035, 0.43, 0.24 + random() * 0.13);
      points.push(point);
      // Consume all samples before reducing foliage; the structural branches must remain fixed.
      if (reduced || (quality === "high" && i % 6)) continue;
      const scale = quality === "high" ? Math.sqrt(6) : 1;
      const base = point.clone().addScaledVector(blade, -length * scale);
      const tip = point.clone().addScaledVector(blade, length * scale);
      const ridge = point.clone().addScaledVector(up, 0.035 * scale);
      // Alternating broad lobes and narrow sinuses; the base has two small auricles.
      const contour = [-0.9, -0.8, -0.68, -0.54, -0.39, -0.24, -0.09, 0.06, 0.23, 0.4, 0.58, 0.77];
      const widths = [0.4, 0.65, 0.45, 0.83, 0.95, 0.48, 0.9, 0.94, 0.42, 0.62, 0.65, 0.24];
      for (const sign of [-1, 1]) {
        const edge = contour.map((t, j) =>
          point
            .clone()
            .addScaledVector(blade, t * length * scale)
            .addScaledVector(side, sign * widths[j] * width * scale)
        );
        const outline = [base, ...edge, tip];
        for (let j = 0; j < outline.length - 1; j++) {
          if (sign === 1) triangle(outline[j], ridge, outline[j + 1], color);
          else triangle(outline[j + 1], ridge, outline[j], color);
        }
      }
    }
    crownPoints.push(...points);
    if (medium) lobes.push(fitCanopyLobe(points, 1.12));
    return points;
  }
  const trunk = createTreeBase(
    [
      { center: [0, 0, 0], radius: 0.7 },
      { center: [0.12, 3.8, -0.08], radius: 0.52 },
      { center: [-0.25, 7, 0.14], radius: 0.36 },
      { center: [0.3, 10.3, 0], radius: 0.2 },
      { center: [-0.15, 13.5, 0.2], radius: 0.015 }
    ],
    1.35,
    low ? 3 : 6,
    low ? 5 : medium ? 8 : 20
  );
  const p = trunk.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const angle = Math.atan2(p.getZ(i), p.getX(i));
    const ridge = 1 + 0.075 * Math.cos(angle * 10 + Math.sin(p.getY(i) * 0.4));
    p.setXYZ(i, p.getX(i) * ridge, p.getY(i), p.getZ(i) * ridge);
  }
  trunk.computeVertexNormals();
  timber(trunk);
  // Unequal forks, rather than a conifer's repeating whorls or the beech's tall straight leader.
  for (let i = 0; i < 8; i++) {
    const angle = i * 2.39996 + 0.2;
    const reach = 4.2 + (i % 3) * 0.7;
    const start = new THREE.Vector3(-0.1, 4 + i * 0.72, 0.05);
    const elbow = new THREE.Vector3(
      Math.cos(angle - 0.18) * reach * 0.48,
      6.4 + i * 0.7,
      Math.sin(angle - 0.18) * reach * 0.48
    );
    const fork = new THREE.Vector3(
      Math.cos(angle + 0.12) * reach * 0.82,
      8.2 + i * 0.64,
      Math.sin(angle + 0.12) * reach * 0.82
    );
    const end = new THREE.Vector3(Math.cos(angle) * reach, 10 + i * 0.58, Math.sin(angle) * reach);
    if (!low || i % 2 === 0 || bare) {
      branch(start, elbow, 0.29 - i * 0.015);
      if (!low || bare) {
        branch(elbow, fork, 0.18 - i * 0.009);
        branch(fork, end, 0.09);
      }
    }
    for (let j = 0; j < 6; j++) {
      const a = elbow.clone().lerp(end, 0.15 + j * 0.15);
      const yaw = angle + (j % 2 ? -0.8 : 0.8);
      const tip = a
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(yaw) * (0.6 + random() * 0.8),
            (random() - 0.25) * 1.7,
            Math.sin(yaw) * (0.6 + random() * 0.8)
          )
        );
      if (!reduced || (bare && medium)) branch(a, tip, 0.035);
      shoots.push({ base: a, tip, points: spray(tip, yaw) });
    }
  }
  for (let i = 0; i < 6; i++) {
    const angle = i * 2.39996;
    const end = new THREE.Vector3(Math.cos(angle) * 2, 14.3 + (i % 3) * 0.9, Math.sin(angle) * 2);
    if (!low || bare) branch(new THREE.Vector3(0, 10, 0), end, 0.12);
    shoots.push({ base: new THREE.Vector3(0, 10, 0), tip: end, points: spray(end, angle) });
  }
  // Oak twigs are short and crooked; fewer, stouter twigs keep the gnarled winter crown.
  if (bare)
    for (const shoot of shoots)
      for (const [from, to] of winterTwigs(shoot, WINTER_TWIGS[quality])) branch(from, to, medium ? 0.02 : 0.012);
  if (low) {
    for (const upper of [false, true])
      for (const east of [false, true])
        for (const north of [false, true]) {
          const points = crownPoints.filter(p => p.y >= 11.8 === upper && p.x >= 0 === east && p.z >= 0 === north);
          if (points.length) {
            const lobe = fitCanopyLobe(points, 1.12);
            lobe.radius.x *= 1.05;
            lobe.radius.z *= 1.2;
            lobes.push(lobe);
          }
        }
  }
  const bark = mergeGeometries(wood)!;
  for (const part of wood) part.dispose();
  const foliage = reduced
    ? createCanopyLobes(lobes, { hue: 0.255, saturation: 0.43, lightness: 0.31 }, 43163)
    : new THREE.BufferGeometry();
  if (!reduced) {
    foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    foliage.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  }
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const foliageMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const stem = new THREE.Mesh(bark, barkMaterial);
  const crown = new THREE.Mesh(foliage, foliageMaterial);
  stem.name = "oak-furrowed-bole-and-crooked-spreading-limbs";
  crown.name = reduced ? "oak-fitted-crown-lobes" : "oak-folded-lobed-leaves";
  const group = new THREE.Group();
  group.name = "pedunculate-oak";
  group.userData.treeQuality = quality;
  group.add(stem, crown);
  return {
    group,
    pickables: [stem, crown],
    dispose() {
      bark.dispose();
      foliage.dispose();
      barkMaterial.dispose();
      foliageMaterial.dispose();
    }
  };
}
