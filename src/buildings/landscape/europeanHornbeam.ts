import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";
import { type LeafShoot, type TreeAppearanceOptions, WINTER_TWIGS, winterTwigs } from "./treeSeasonLayers";

/** Summer Carpinus betulus: a fluted grey stem, long ascending branches and pleated, toothed leaves. */
export function createEuropeanHornbeam(
  quality: TreeQuality = "ultra",
  options: TreeAppearanceOptions = {}
): CityStructureMeshes {
  const low = quality === "low";
  const medium = quality === "medium";
  const reduced = low || medium;
  // Bare winter trees keep the leafy skeleton; the registry drops the leaves (seasonalLooks.ts).
  const bare = options.appearance === "bare";
  const shoots: LeafShoot[] = [];
  let seed = 43189;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const lobes: CanopyLobe[] = [];
  const crownPoints: THREE.Vector3[] = [];
  const positions: number[] = [],
    colors: number[] = [],
    normals: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const crownCenter = new THREE.Vector3(0, 10.5, 0);
  function timber(geometry: THREE.BufferGeometry) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position");
    const rgb: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const flute = Math.cos(Math.atan2(p.getZ(i), p.getX(i)) * 6 - p.getY(i) * 0.35);
      const color = new THREE.Color().setHSL(0.16, 0.045, 0.38 + flute * 0.045);
      rgb.push(color.r, color.g, color.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    wood.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const geometry = new THREE.CylinderGeometry(
      radius * 0.4,
      radius,
      a.distanceTo(b),
      low ? 4 : medium ? 5 : 8,
      1,
      true
    );
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    timber(geometry);
  }
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colors.push(color.r, color.g, color.b);
      const n = normal.clone().lerp(p.clone().sub(crownCenter).normalize(), 0.55).addScaledVector(up, 0.25).normalize();
      normals.push(n.x, n.y, n.z);
    }
  }
  function spray(center: THREE.Vector3, angle: number) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 70; i++) {
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(theta) * r * 1.15, (random() - 0.5) * 1.8, Math.sin(theta) * r * 1.1));
      const yaw = angle + (random() - 0.5) * 3;
      const blade = new THREE.Vector3(Math.cos(yaw), (random() - 0.35) * 1.7, Math.sin(yaw)).normalize();
      const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      const length = 0.26 + random() * 0.06;
      const width = length * (0.49 + random() * 0.07);
      const color = new THREE.Color().setHSL(0.265 + random() * 0.025, 0.46, 0.27 + random() * 0.12);
      points.push(p);
      // Sample every leaf at every tier so the later structural branches never move.
      if (reduced || (quality === "high" && i % 3)) continue;
      const scale = quality === "high" ? Math.sqrt(3) : 1;
      const steps = quality === "high" ? 5 : 10;
      const ridge: THREE.Vector3[] = [];
      const edges: THREE.Vector3[][] = [[], []];
      for (let j = 0; j <= steps; j++) {
        const t = j / steps;
        const position = p.clone().addScaledVector(blade, (2 * t - 1) * length * scale);
        const envelope = Math.sin(Math.PI * t) ** 0.8;
        // Raised midrib and alternating folds abstract the conspicuous parallel leaf veins.
        ridge.push(position.clone().addScaledVector(up, envelope * (j % 2 ? 0.04 : 0.025) * scale));
        const tooth = j % 2 ? (j % 4 === 1 ? 1.08 : 1.03) : 0.9;
        for (const [index, sign] of [-1, 1].entries())
          edges[index].push(position.clone().addScaledVector(side, sign * envelope * tooth * width * scale));
      }
      for (const [index, sign] of [-1, 1].entries()) {
        const edge = edges[index];
        const face = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) =>
          sign === 1 ? triangle(a, b, c, color) : triangle(c, b, a, color);
        for (let j = 0; j < steps; j++) {
          if (j > 0) face(ridge[j], edge[j], ridge[j + 1]);
          if (j < steps - 1) face(ridge[j + 1], edge[j], edge[j + 1]);
        }
      }
    }
    crownPoints.push(...points);
    if (medium) lobes.push(fitCanopyLobe(points, 1.12));
    return points;
  }
  const trunk = createTreeBase(
    [
      { center: [0, 0, 0], radius: 0.43 },
      { center: [0.14, 3.5, 0.06], radius: 0.29 },
      { center: [-0.14, 7, 0.12], radius: 0.21 },
      { center: [0.18, 11, -0.1], radius: 0.1 },
      { center: [-0.1, 15.5, 0.12], radius: 0.008 }
    ],
    0.85,
    low ? 3 : 5,
    low ? 6 : medium ? 10 : 24
  );
  const p = trunk.getAttribute("position");
  for (let i = 0; i < p.count; i++) {
    const angle = Math.atan2(p.getZ(i), p.getX(i));
    const flute = 1 + 0.17 * Math.cos(angle * 6 - p.getY(i) * 0.35);
    p.setXYZ(i, p.getX(i) * flute, p.getY(i), p.getZ(i) * flute);
  }
  trunk.computeVertexNormals();
  timber(trunk);
  for (let i = 0; i < 14; i++) {
    const t = i / 14;
    const angle = i * 2.39996 + 0.4;
    const reach = 2.8 * Math.sin(Math.PI * (0.18 + t * 0.72));
    const start = new THREE.Vector3(0, 3.2 + t * 8.8, 0);
    const elbow = new THREE.Vector3(
      Math.cos(angle - 0.1) * reach * 0.55,
      5.2 + t * 8.1,
      Math.sin(angle - 0.1) * reach * 0.55
    );
    const end = new THREE.Vector3(Math.cos(angle) * reach, 7 + t * 8.2, Math.sin(angle) * reach);
    if (!low || i % 3 === 0 || bare) {
      branch(start, elbow, 0.12 * (1 - t * 0.6));
      if (!low || bare) branch(elbow, end, 0.06 * (1 - t * 0.6));
    }
    for (let j = 0; j < 3; j++) {
      const a = start.clone().lerp(end, 0.4 + j * 0.27);
      const yaw = angle + (j % 2 ? -0.65 : 0.65);
      const tip = a.clone().add(new THREE.Vector3(Math.cos(yaw) * 0.75, 0.2 + random() * 0.9, Math.sin(yaw) * 0.75));
      if (!reduced || (bare && medium)) branch(a, tip, 0.022);
      shoots.push({ base: a, tip, points: spray(tip, yaw) });
    }
  }
  for (let i = 0; i < 4; i++) {
    const angle = i * 2.39996;
    const end = new THREE.Vector3(Math.cos(angle) * 0.7, 15.2 + (i % 2) * 0.3, Math.sin(angle) * 0.7);
    if (!low || bare) branch(new THREE.Vector3(0, 12, 0), end, 0.055);
    shoots.push({ base: new THREE.Vector3(0, 12, 0), tip: end, points: spray(end, angle) });
  }
  if (bare)
    for (const shoot of shoots)
      for (const [from, to] of winterTwigs(shoot, WINTER_TWIGS[quality])) branch(from, to, medium ? 0.016 : 0.009);
  if (low) {
    for (const upper of [false, true])
      for (const east of [false, true])
        for (const north of [false, true]) {
          const points = crownPoints.filter(p => p.y >= 10.4 === upper && p.x >= 0 === east && p.z >= 0 === north);
          if (points.length) {
            const lobe = fitCanopyLobe(points, 1.12);
            lobe.radius.x *= 1.15;
            lobe.radius.z *= 1.15;
            lobes.push(lobe);
          }
        }
  }
  const bark = mergeGeometries(wood)!;
  for (const part of wood) part.dispose();
  const foliage = reduced
    ? createCanopyLobes(lobes, { hue: 0.277, saturation: 0.46, lightness: 0.335 }, 43189)
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
  stem.name = "hornbeam-fluted-grey-bole-and-ascending-branches";
  crown.name = reduced ? "hornbeam-fitted-dense-crown" : "hornbeam-pleated-toothed-leaves";
  const group = new THREE.Group();
  group.name = "european-hornbeam";
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
