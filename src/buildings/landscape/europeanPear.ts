import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { mergeFruitParts } from "./fruitLayer";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";
import { type LeafShoot, type TreeAppearanceOptions, WINTER_TWIGS, winterTwigs } from "./treeSeasonLayers";

/** Free-standing cultivated Pyrus communis: upright leaders, glossy leaves and necked fruit on spurs. */
export function createEuropeanPear(
  quality: TreeQuality = "ultra",
  options: TreeAppearanceOptions = {}
): CityStructureMeshes {
  const low = quality === "low";
  const medium = quality === "medium";
  const reduced = low || medium;
  // Bare winter trees keep the leafy skeleton; the registry drops leaves and fruit (seasonalLooks.ts).
  const bare = options.appearance === "bare";
  const shoots: LeafShoot[] = [];
  let seed = 43261;
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
  const crownCenter = new THREE.Vector3(0, 5.7, 0);

  function timber(geometry: THREE.BufferGeometry, into = wood) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position");
    const rgb: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const fissure = Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 14 + p.getY(i) * 1.4);
      const color = new THREE.Color().setHSL(0.075, 0.15, 0.245 + fissure * 0.03);
      rgb.push(color.r, color.g, color.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    into.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number, into = wood) {
    const geometry = new THREE.CylinderGeometry(
      radius * 0.43,
      radius,
      a.distanceTo(b),
      low ? 4 : medium ? 5 : 8,
      1,
      true
    );
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    timber(geometry, into);
  }
  /** Fruit stalks join the fruit parts when a season is drawn, so harvest takes them with the fruit. */
  function stalk(anchor: THREE.Vector3, end: THREE.Vector3, radius: number) {
    branch(anchor, end, radius, fruitAnchors ? fruitParts : wood);
    fruitAnchors?.push(anchor);
  }
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    const face = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const p of [a, b, c]) {
      const n = face.clone().lerp(p.clone().sub(crownCenter).normalize(), 0.48).addScaledVector(up, 0.28).normalize();
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  function spray(center: THREE.Vector3, angle: number) {
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i < 112; i++) {
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(theta) * r * 0.62, (random() - 0.5) * 1.25, Math.sin(theta) * r * 0.58));
      const yaw = angle + (random() - 0.5) * 3.4;
      const blade = new THREE.Vector3(Math.cos(yaw), (random() - 0.35) * 1.5, Math.sin(yaw)).normalize();
      const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      const length = 0.065 + random() * 0.025;
      const width = length * (0.62 + random() * 0.1);
      const color = new THREE.Color().setHSL(0.285 + random() * 0.02, 0.5, 0.215 + random() * 0.12);
      samples.push(p);
      // Consume every sample at every tier so skeletons and fruit attachments stay fixed.
      if (reduced || (quality === "high" && i % 4)) continue;
      const scale = quality === "high" ? 2 : 1;
      const steps = quality === "high" ? 4 : 7;
      const ridge = p.clone().addScaledVector(up, 0.012 * scale);
      for (const sign of [-1, 1]) {
        let previous = p.clone().addScaledVector(blade, -length * scale);
        for (let j = 1; j <= steps; j++) {
          const t = j / steps;
          const tooth = j % 2 ? 1.035 : 0.97;
          const next = p
            .clone()
            .addScaledVector(blade, (2 * t - 1) * length * scale)
            .addScaledVector(side, sign * Math.sin(Math.PI * t) ** 0.72 * tooth * width * scale);
          if (sign === 1) triangle(next, ridge, previous, color);
          else triangle(previous, ridge, next, color);
          previous = next;
        }
      }
    }
    crownPoints.push(...samples);
    if (medium) lobes.push(fitCanopyLobe(samples, 1.07));
    return samples;
  }
  function pear(attachment: THREE.Vector3, radius: number, tint: number, index: number) {
    const center = attachment.clone().add(new THREE.Vector3(0, -radius * 1.65 - 0.045, 0));
    if (!low && (!medium || index % 2 === 0)) {
      const geometry = new THREE.SphereGeometry(
        1,
        medium ? 5 : quality === "high" ? 8 : 12,
        medium ? 4 : quality === "high" ? 7 : 10
      );
      const p = geometry.getAttribute("position");
      const rgb: number[] = [];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        // A full lower body narrows into an elongated neck below the stalk.
        const neck = 1 - THREE.MathUtils.smoothstep(y, -0.15, 0.85) * 0.68;
        const rib = 1 + Math.cos(Math.atan2(z, x) * 5) * 0.018;
        p.setXYZ(
          i,
          center.x + x * radius * neck * rib,
          center.y + y * radius * 1.5,
          center.z + z * radius * neck * rib
        );
        const russet = 0.5 + Math.sin(x * 31 + z * 23 + y * 41) * 0.5;
        const color = new THREE.Color().setHSL(
          0.18 - tint * 0.055 - russet * 0.015,
          0.5,
          0.34 + tint * 0.09 - russet * 0.025
        );
        rgb.push(color.r, color.g, color.b);
      }
      geometry.deleteAttribute("uv");
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
      geometry.computeVertexNormals();
      fruitParts.push(geometry);
      fruitAnchors?.push(attachment);
    }
    if (!reduced && !bare) stalk(attachment, center.clone().addScaledVector(up, radius * 1.49), 0.005);
  }

  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.26 },
        { center: [0.06, 1.8, -0.03], radius: 0.19 },
        { center: [-0.08, 3.7, 0.08], radius: 0.14 },
        { center: [0.09, 5.6, 0], radius: 0.085 },
        { center: [0, 7.5, 0.03], radius: 0.03 },
        { center: [0.1, 8.5, 0], radius: 0.006 }
      ],
      0.58,
      low ? 3 : 5,
      low ? 5 : medium ? 8 : 12
    )
  );

  let fruitIndex = 0;
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const angle = i * 2.39996 + 0.6;
    const reach = 2.2 - t * 1.3;
    const start = new THREE.Vector3(0, 1.9 + t * 4.7, 0.03);
    const elbow = new THREE.Vector3(
      Math.cos(angle - 0.12) * reach * 0.55,
      3.1 + t * 3.95,
      Math.sin(angle - 0.12) * reach * 0.55
    );
    const end = new THREE.Vector3(Math.cos(angle) * reach, 4.6 + t * 3.25, Math.sin(angle) * reach);
    if (!low || i % 2 === 0 || bare) {
      branch(start, elbow, 0.105 * (1 - t * 0.55));
      branch(elbow, end, 0.055 * (1 - t * 0.5));
    }
    for (let j = 0; j < 3; j++) {
      const a = elbow.clone().lerp(end, 0.2 + j * 0.34);
      const yaw = angle + (j % 2 ? -0.8 : 0.8);
      const shoot = a.clone().add(new THREE.Vector3(Math.cos(yaw) * 0.55, 0.25 + random() * 0.4, Math.sin(yaw) * 0.55));
      if (!low || (bare && i % 2 === 0)) branch(a, shoot, 0.022 * (1 - t * 0.4));
      shoots.push({ base: a, tip: shoot, points: spray(shoot, yaw) });
      for (let k = 0; k < 2; k++) {
        const b = a.clone().lerp(shoot, 0.55 + k * 0.33);
        const spur = b
          .clone()
          .add(new THREE.Vector3(Math.cos(yaw + k * 1.4) * 0.11, -0.08, Math.sin(yaw + k * 1.4) * 0.11));
        if (!reduced) branch(b, spur, 0.008);
        pear(spur, 0.043 + random() * 0.01, random(), fruitIndex++);
      }
    }
  }
  if (bare)
    for (const shoot of shoots)
      for (const [from, to] of winterTwigs(shoot, WINTER_TWIGS[quality])) branch(from, to, medium ? 0.01 : 0.006);
  if (low) {
    // Height bands retain the tapering upright crown rather than an apple-like spreading bowl.
    for (let band = 0; band < 3; band++)
      for (const east of [false, true])
        for (const north of [false, true]) {
          const points = crownPoints.filter(
            p => Math.min(2, Math.floor((p.y - 3) / 2)) === band && p.x >= 0 === east && p.z >= 0 === north
          );
          if (points.length) {
            const lobe = fitCanopyLobe(points, 1.08);
            lobes.push(lobe);
          }
        }
  }
  const bark = mergeGeometries(wood)!;
  for (const part of wood) part.dispose();
  const foliage = reduced
    ? createCanopyLobes(lobes, { hue: 0.295, saturation: 0.5, lightness: 0.29 }, 43261)
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
    shininess: 22,
    specular: 0x172014
  });
  const stem = new THREE.Mesh(bark, barkMaterial);
  const crown = new THREE.Mesh(foliage, leafMaterial);
  stem.name = "pear-bole-and-ascending-scaffold-branches";
  crown.name = reduced ? "pear-fitted-upright-crown" : "pear-folded-glossy-oval-leaves";
  const group = new THREE.Group();
  group.name = "european-pear";
  group.userData.treeQuality = quality;
  group.add(stem, crown);
  const pickables: THREE.Mesh[] = [stem, crown];
  if (fruitParts.length) {
    const fruitGeometry = mergeFruitParts(fruitParts, fruitAnchors);
    for (const part of fruitParts) part.dispose();
    const fruitMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    const fruit = new THREE.Mesh(fruitGeometry, fruitMaterial);
    fruit.name = "pear-yellow-green-necked-fruit";
    group.add(fruit);
    pickables.push(fruit);
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
