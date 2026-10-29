import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";
import {
  type FoliageTint,
  type LeafShoot,
  type TreeAppearanceOptions,
  tintFoliage,
  winterTwigs
} from "./treeSeasonLayers";

/** Copper-orange autumn beech leaves. */
const AUTUMN: FoliageTint = { hue: 0.07, hueJitter: 0.05, saturation: 0.66, lightnessScale: 1.35 };

/**
 * Fagus sylvatica: a clear grey bole, ascending limbs and oval, folded leaf sprays. Summer by
 * default; autumn recolours the leaves and bare drops them for twigs on the same skeleton.
 */
export function createEuropeanBeech(
  quality: TreeQuality = "ultra",
  options: TreeAppearanceOptions = {}
): CityStructureMeshes {
  const low = quality === "low";
  const medium = quality === "medium";
  const reduced = low || medium;
  const appearance = options.appearance === "bare" || options.appearance === "autumn" ? options.appearance : "leaf";
  const bare = appearance === "bare";
  let seed = 43141;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const lobes: CanopyLobe[] = [];
  const limbPoints: THREE.Vector3[][] = [];
  const shoots: LeafShoot[] = [];
  const positions: number[] = [],
    colors: number[] = [],
    normals: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const crownCenter = new THREE.Vector3(0, 13, 0);
  function timber(geometry: THREE.BufferGeometry) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position");
    const rgb: number[] = [];
    for (let i = 0; i < p.count; i++) {
      // Low contrast, smooth bark; no birch scars or oak-like fissures.
      const shade = 0.44 + Math.sin(p.getY(i) * 0.7 + p.getX(i) * 2) * 0.025;
      const color = new THREE.Color().setHSL(0.13, 0.045, shade);
      rgb.push(color.r, color.g, color.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    wood.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const segments = low ? 4 : medium ? 5 : 8;
    const geometry = new THREE.CylinderGeometry(radius * 0.38, radius, a.distanceTo(b), segments, 1, true);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    timber(geometry);
  }
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colors.push(color.r, color.g, color.b);
      // Crown-envelope lighting limits harsh black facets on the shaded side of a leaf.
      const n = normal.clone().lerp(p.clone().sub(crownCenter).normalize(), 0.55).addScaledVector(up, 0.25).normalize();
      normals.push(n.x, n.y, n.z);
    }
  }
  function spray(center: THREE.Vector3, angle: number, points: THREE.Vector3[]) {
    const sample: THREE.Vector3[] = [];
    for (let i = 0; i < 128; i++) {
      const theta = random() * Math.PI * 2;
      const radius = Math.sqrt(random());
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(theta) * radius * 1.4, (random() - 0.5) * 2.4, Math.sin(theta) * radius * 1.3));
      const yaw = angle + (random() - 0.5) * 2.8;
      const length = 0.22 + random() * 0.07;
      const width = length * (0.48 + random() * 0.12);
      const blade = new THREE.Vector3(Math.cos(yaw), (random() - 0.35) * 1.5, Math.sin(yaw)).normalize();
      const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      const color = new THREE.Color().setHSL(0.27 + random() * 0.025, 0.48, 0.25 + random() * 0.12);
      sample.push(p);
      // Every tier consumes the same samples so later branches never shift at a transition.
      if (reduced || (quality === "high" && i % 4)) continue;
      const scale = quality === "high" ? 2 : 1;
      const base = p.clone().addScaledVector(blade, -length * scale);
      const tip = p.clone().addScaledVector(blade, length * scale);
      const ridge = p.clone().addScaledVector(up, 0.035 * scale);
      for (const sign of [-1, 1]) {
        const edge = [-0.58, 0, 0.58].map(t =>
          p
            .clone()
            .addScaledVector(blade, t * length * scale)
            .addScaledVector(side, sign * width * scale * (t === 0 ? 1 : 0.8))
        );
        const outline = [base, ...edge, tip];
        for (let j = 0; j < outline.length - 1; j++) {
          if (sign === 1) triangle(outline[j], ridge, outline[j + 1], color);
          else triangle(outline[j + 1], ridge, outline[j], color);
        }
      }
    }
    points.push(...sample);
    if (medium) lobes.push(fitCanopyLobe(sample, 1.08));
    return sample;
  }
  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.55 },
        { center: [0.05, 5.5, 0], radius: 0.34 },
        { center: [-0.12, 11.5, 0.08], radius: 0.22 },
        { center: [0.15, 16.5, 0], radius: 0.09 },
        { center: [0, 19, 0], radius: 0.012 }
      ],
      1,
      low ? 3 : 5,
      low ? 5 : medium ? 8 : 14
    )
  );
  for (let i = 0; i < 16; i++) {
    const t = i / 16;
    const angle = i * 2.39996;
    const reach = 4.4 * Math.sin(Math.PI * (0.15 + t * 0.8));
    const start = new THREE.Vector3(0, 5.5 + t * 10, 0);
    const elbow = new THREE.Vector3(Math.cos(angle) * reach * 0.6, 7 + t * 9.8, Math.sin(angle) * reach * 0.6);
    const tip = new THREE.Vector3(Math.cos(angle) * reach, 8.2 + t * 9.7, Math.sin(angle) * reach);
    // A bare low tier keeps every limb: without leaves the branch fan is the silhouette.
    if (!low || i % 2 === 0 || bare) {
      branch(start, elbow, 0.18 * (1 - t * 0.6));
      if (!low || bare) branch(elbow, tip, 0.085 * (1 - t * 0.6));
    }
    const points: THREE.Vector3[] = [];
    for (let j = 0; j < 4; j++) {
      const a = start.clone().lerp(tip, 0.3 + j * 0.22);
      const yaw = angle + (j % 2 ? -0.65 : 0.65);
      const end = a.clone().add(new THREE.Vector3(Math.cos(yaw) * 0.8, 0.1 + random() * 1.8, Math.sin(yaw) * 0.8));
      if (!reduced || (bare && medium)) branch(a, end, 0.025);
      shoots.push({ base: a, tip: end, points: spray(end, yaw, points) });
    }
    limbPoints.push(points);
  }
  const leaderPoints: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i * Math.PI) / 2;
    const end = new THREE.Vector3(Math.cos(angle) * 0.8, 18.5 + (i % 2) * 0.35, Math.sin(angle) * 0.8);
    if (!low || bare) branch(new THREE.Vector3(0, 16.5, 0), end, 0.05);
    shoots.push({ base: new THREE.Vector3(0, 16.5, 0), tip: end, points: spray(end, angle, leaderPoints) });
  }
  if (bare) {
    // Winter twigs reach the leaf positions, so leafy and bare branch tips coincide.
    const twigs = quality === "ultra" ? 6 : quality === "high" ? 4 : medium ? 2 : 0;
    for (const shoot of shoots)
      for (const [from, to] of winterTwigs(shoot, twigs)) branch(from, to, medium ? 0.018 : 0.011);
  }
  if (low && !bare) {
    const all = [...limbPoints.flat(), ...leaderPoints];
    // Spatial octants preserve a rounded broadleaf crown instead of stacking opposing limbs into shelves.
    for (const upper of [false, true])
      for (const east of [false, true])
        for (const north of [false, true]) {
          const points = all.filter(p => p.y >= 13.6 === upper && p.x >= 0 === east && p.z >= 0 === north);
          if (points.length) {
            const lobe = fitCanopyLobe(points, 1.08);
            lobe.radius.x *= 1.3;
            lobe.radius.z *= 1.3;
            lobes.push(lobe);
          }
        }
  }
  const bark = mergeGeometries(wood)!;
  for (const part of wood) part.dispose();
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const trunk = new THREE.Mesh(bark, barkMaterial);
  trunk.name = "beech-smooth-grey-bole-and-ascending-limbs";
  const group = new THREE.Group();
  group.name = "european-beech";
  group.userData.treeQuality = quality;
  group.userData.treeAppearance = appearance;
  group.add(trunk);
  const pickables: THREE.Mesh[] = [trunk];
  if (!bare) {
    const foliage = reduced
      ? createCanopyLobes(lobes, { hue: 0.28, saturation: 0.48, lightness: 0.31 }, 43141)
      : new THREE.BufferGeometry();
    if (!reduced) {
      foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      foliage.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    }
    if (appearance === "autumn" || options.autumnPalette) tintFoliage(foliage, AUTUMN);
    const foliageMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const crown = new THREE.Mesh(foliage, foliageMaterial);
    crown.name = reduced ? "beech-fitted-leaf-sprays" : "beech-folded-oval-leaves";
    group.add(crown);
    pickables.push(crown);
  }
  return {
    group,
    pickables,
    dispose() {
      for (const mesh of pickables) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  };
}
