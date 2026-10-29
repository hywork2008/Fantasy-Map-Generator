import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { mergeFruitParts } from "./fruitLayer";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";
import type { TreeAppearanceOptions } from "./treeSeasonLayers";

/** Illustrative Coffea arabica: a compact upright shrub, opposite leaves and cherry clusters at lateral nodes. */
export function createArabicaCoffee(
  quality: TreeQuality = "ultra",
  options: TreeAppearanceOptions = {}
): CityStructureMeshes {
  const low = quality === "low";
  const medium = quality === "medium";
  const reduced = low || medium;
  let seed = 95303;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const fruitParts: THREE.BufferGeometry[] = [];
  // Seasonal looks drop, thin or shrink each fruit with its stalk (fruitLayer.ts).
  const fruitAnchors: THREE.Vector3[] | undefined = options.appearance || options.autumnPalette ? [] : undefined;
  const lobes: CanopyLobe[] = [];
  const crownPoints: THREE.Vector3[] = [];
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const crownCenter = new THREE.Vector3(0, 1.5, 0);

  function timber(geometry: THREE.BufferGeometry, into = wood) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position");
    const rgb: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const grain = Math.sin(p.getY(i) * 1.8 + Math.atan2(p.getZ(i), p.getX(i)) * 15);
      const color = new THREE.Color().setHSL(0.095, 0.13, 0.31 + grain * 0.025);
      rgb.push(color.r, color.g, color.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    into.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number, sides = 8, into = wood) {
    const geometry = new THREE.CylinderGeometry(
      radius * 0.45,
      radius,
      a.distanceTo(b),
      low ? 3 : medium ? 4 : sides,
      1,
      true
    );
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    timber(geometry, into);
  }
  /** Fruit stalks join the fruit parts when a season is drawn, so harvest takes them with the fruit. */
  function stalk(anchor: THREE.Vector3, end: THREE.Vector3, radius: number, sides?: number) {
    branch(anchor, end, radius, sides, fruitAnchors ? fruitParts : wood);
    fruitAnchors?.push(anchor);
  }
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    const face = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const p of [a, b, c]) {
      const n = face.clone().lerp(p.clone().sub(crownCenter).normalize(), 0.48).addScaledVector(up, 0.25).normalize();
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  function leaf(
    base: THREE.Vector3,
    direction: THREE.Vector3,
    length: number,
    tint: number,
    keep: boolean,
    samples: THREE.Vector3[]
  ) {
    const blade = direction.clone().normalize();
    const side = new THREE.Vector3(-blade.z, 0, blade.x).normalize();
    const center = base
      .clone()
      .addScaledVector(blade, length * 0.48)
      .addScaledVector(up, 0.009);
    // Sample the full leaf outline for fitted tiers before any detailed-tier omission.
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      for (const sign of [-1, 1])
        samples.push(
          base
            .clone()
            .addScaledVector(blade, t * length)
            .addScaledVector(side, sign * Math.sin(Math.PI * t) * length * 0.22)
        );
    }
    if (reduced || (quality === "high" && !keep)) return;
    const scale = quality === "high" ? Math.sqrt(2) : 1;
    const ridge = base.clone().lerp(center, scale);
    const color = new THREE.Color().setHSL(0.285 + tint * 0.025, 0.5, 0.2 + tint * 0.09);
    const steps = quality === "high" ? 4 : 8;
    for (const sign of [-1, 1]) {
      let previous = base.clone();
      for (let j = 1; j <= steps; j++) {
        const t = j / steps;
        const edge = Math.sin(Math.PI * t) ** 0.85 * (1 + Math.sin(t * Math.PI * 6) * 0.045);
        const next = base
          .clone()
          .addScaledVector(blade, t * length * scale)
          .addScaledVector(side, sign * edge * length * 0.22 * scale);
        if (sign === 1) triangle(next, ridge, previous, color);
        else triangle(previous, ridge, next, color);
        previous = next;
      }
    }
  }
  function leafPair(node: THREE.Vector3, angle: number, length: number, index: number, samples: THREE.Vector3[]) {
    const tint = random();
    for (const sign of [-1, 1]) {
      const out = new THREE.Vector3(Math.cos(angle) * sign, -0.3 - tint * 0.18, Math.sin(angle) * sign).normalize();
      const base = node.clone().addScaledVector(out, 0.014);
      if (!reduced) branch(node, base, 0.0018, 3);
      leaf(base, out, length, tint, index % 2 === 0, samples);
    }
  }
  function cherries(node: THREE.Vector3, tangent: THREE.Vector3, side: THREE.Vector3, index: number) {
    if (low || (medium && index % 2)) return;
    const count = medium ? 2 : 6;
    for (let i = 0; i < count; i++) {
      const angle = (i * Math.PI * 2) / count;
      const radial = side.clone().multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
      const center = node
        .clone()
        .addScaledVector(radial, 0.021)
        .addScaledVector(tangent, (i % 2 ? 1 : -1) * 0.007);
      const radius = 0.0075 + (index % 3) * 0.0007;
      const geometry = new THREE.SphereGeometry(
        1,
        medium ? 4 : quality === "high" ? 6 : 10,
        medium ? 2 : quality === "high" ? 3 : 6
      );
      const p = geometry.getAttribute("position");
      const rgb: number[] = [];
      for (let j = 0; j < p.count; j++) {
        const x = p.getX(j),
          y = p.getY(j),
          z = p.getZ(j);
        p.setXYZ(j, center.x + x * radius, center.y + y * radius * 1.15, center.z + z * radius);
        const color = new THREE.Color().setHSL(0.985 + (index % 3) * 0.004, 0.72, 0.32 + y * 0.025);
        rgb.push(color.r, color.g, color.b);
      }
      geometry.deleteAttribute("uv");
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
      geometry.computeVertexNormals();
      fruitParts.push(geometry);
      fruitAnchors?.push(node);
      stalk(node, center.clone().addScaledVector(radial, -radius), 0.0012, 3);
    }
  }
  function fitted(samples: THREE.Vector3[]) {
    crownPoints.push(...samples);
    if (medium) lobes.push(fitCanopyLobe(samples, 1.04, true));
  }

  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.065 },
        { center: [0, 0.5, 0], radius: 0.043 },
        { center: [0.008, 1.2, 0], radius: 0.031 },
        { center: [0, 1.9, 0.008], radius: 0.02 },
        { center: [0, 2.4, 0], radius: 0.008 }
      ],
      0.19,
      low ? 3 : 5,
      low ? 5 : medium ? 8 : 12
    )
  );
  let clusterIndex = 0;
  // Opposite primary branches alternate their plane up the upright stem.
  for (let level = 0; level < 7; level++) {
    const height = 0.55 + level * 0.25;
    const reach = 0.95 - level * 0.085;
    const heading = level * Math.PI * 0.5 + 0.25;
    for (const sign of [-1, 1]) {
      const angle = heading + (sign < 0 ? Math.PI : 0);
      const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const side = new THREE.Vector3(-out.z, 0, out.x);
      const at = (t: number) =>
        out
          .clone()
          .multiplyScalar(reach * t)
          .add(new THREE.Vector3(0, height + 0.2 * t - 0.13 * t * t, 0));
      if (low) branch(at(0), at(1), 0.018 - level * 0.0013);
      else for (let j = 0; j < 3; j++) branch(at(j / 3), at((j + 1) / 3), (0.018 - level * 0.0013) * (1 - j * 0.28));
      const samples: THREE.Vector3[] = [];
      for (let n = 0; n < 8; n++) {
        const t = 0.12 + n * 0.11;
        const node = at(t);
        leafPair(node, angle + Math.PI * 0.5, 0.14 + random() * 0.055, n, samples);
        if (n >= 1 && n <= 5) cherries(node, out, side, clusterIndex++);
      }
      // Short secondary laterals carry additional opposite leaf pairs, without random leaf clouds.
      for (const n of [2, 5])
        for (const turn of [-1, 1]) {
          const start = at(0.12 + n * 0.11);
          const heading = angle + turn * 1.05;
          const direction = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
          const length = (0.3 + random() * 0.07) * (1 - level * 0.045);
          const tip = start
            .clone()
            .addScaledVector(direction, length)
            .addScaledVector(up, (random() - 0.35) * 0.18);
          if (!low) branch(start, tip, 0.005);
          for (let j = 0; j < 6; j++) {
            const node = start.clone().lerp(tip, 0.18 + j * 0.15);
            leafPair(node, heading + Math.PI * 0.5, 0.13 + random() * 0.045, j, samples);
          }
        }
      fitted(samples);
    }
  }
  const terminal: THREE.Vector3[] = [];
  for (let i = 0; i < 4; i++) leafPair(new THREE.Vector3(0, 2.19 + i * 0.065, 0), i * Math.PI * 0.5, 0.13, i, terminal);
  fitted(terminal);
  if (low) {
    for (const upper of [false, true])
      for (const east of [false, true])
        for (const north of [false, true]) {
          const points = crownPoints.filter(p => p.y >= 1.45 === upper && p.x >= 0 === east && p.z >= 0 === north);
          if (points.length) lobes.push(fitCanopyLobe(points, 1.13));
        }
  }
  const bark = mergeGeometries(wood)!;
  for (const part of wood) part.dispose();
  const foliage = reduced
    ? createCanopyLobes(lobes, { hue: 0.3, saturation: 0.5, lightness: 0.25 }, 95303)
    : new THREE.BufferGeometry();
  if (!reduced) {
    foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    foliage.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  }
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafMaterial = new THREE.MeshPhongMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    shininess: 12,
    specular: 0x172414
  });
  const stem = new THREE.Mesh(bark, barkMaterial);
  const crown = new THREE.Mesh(foliage, leafMaterial);
  stem.name = "arabica-coffee-upright-stem-opposite-laterals-and-petioles";
  crown.name = reduced ? "arabica-coffee-fitted-layered-crown" : "arabica-coffee-opposite-glossy-leaf-pairs";
  const group = new THREE.Group();
  group.name = "arabica-coffee";
  group.userData.treeQuality = quality;
  group.add(stem, crown);
  const pickables: THREE.Mesh[] = [stem, crown];
  if (fruitParts.length) {
    const fruitGeometry = mergeFruitParts(fruitParts, fruitAnchors);
    for (const part of fruitParts) part.dispose();
    const fruitMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(fruitGeometry, fruitMaterial);
    mesh.name = "arabica-coffee-red-cherries-at-lateral-nodes";
    group.add(mesh);
    pickables.push(mesh);
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
