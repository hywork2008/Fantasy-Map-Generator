import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { buildFruitLayer, type FruitSite, type FruitSpec, mergeFruitParts } from "./fruitLayer";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";
import { type LeafShoot, type TreeAppearanceOptions, WINTER_TWIGS, winterTwigs } from "./treeSeasonLayers";

/** Ripe burs split into four valves on two or three glossy nuts, browning as they open. */
const SPLIT_BURS: FruitSpec = {
  shape: "bur",
  sizeMeters: 0.066,
  widthRatio: 1,
  stalkMeters: 0.04,
  stalkColor: 0x6d5a34,
  cluster: { count: 1, spread: 0 },
  palettes: { unripe: [0x8f7230], ripe: [0x8f7230, 0x9a7b36, 0x84672a] }
};

/** Illustrative Castanea sativa: a broad orchard crown, long toothed simple leaves and prickly green burs. */
export function createSweetChestnut(
  quality: TreeQuality = "ultra",
  options: TreeAppearanceOptions = {}
): CityStructureMeshes {
  const low = quality === "low";
  const medium = quality === "medium";
  const reduced = low || medium;
  // Bare winter trees keep the leafy skeleton; the registry drops leaves and fruit (seasonalLooks.ts).
  const bare = options.appearance === "bare";
  // Ripe burs are drawn by the shared fruit layer at the same attachments as the green ones.
  const ripe = options.appearance === "fruit";
  const ripeSites: FruitSite[] = [];
  const shoots: LeafShoot[] = [];
  let seed = 74039;
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
  const crownCenter = new THREE.Vector3(0, 6.8, 0);

  function timber(geometry: THREE.BufferGeometry, into = wood) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position");
    const rgb: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const grain = Math.sin(p.getY(i) * 1.8 + Math.atan2(p.getZ(i), p.getX(i)) * 15);
      const color = new THREE.Color().setHSL(0.083, 0.1, 0.29 + grain * 0.055);
      rgb.push(color.r, color.g, color.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    into.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number, into = wood) {
    const geometry = new THREE.CylinderGeometry(
      radius * 0.45,
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
      const n = face.clone().lerp(p.clone().sub(crownCenter).normalize(), 0.48).addScaledVector(up, 0.25).normalize();
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  function spray(center: THREE.Vector3, angle: number) {
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i < 144; i++) {
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(theta) * r * 0.75, (random() - 0.5) * 1.25, Math.sin(theta) * r * 0.72));
      const yaw = angle + (random() - 0.5) * 3.7;
      const blade = new THREE.Vector3(Math.cos(yaw), (random() - 0.4) * 1.4, Math.sin(yaw)).normalize();
      const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      const length = 0.095 + random() * 0.045;
      const width = length * (0.3 + random() * 0.03);
      const color = new THREE.Color().setHSL(0.255 + random() * 0.03, 0.48, 0.23 + random() * 0.11);
      samples.push(p);
      // Every tier consumes every leaf sample so later branches and fruit stay fixed.
      if (reduced || (quality === "high" && i % 4)) continue;
      const scale = quality === "high" ? 2 : 1;
      const steps = quality === "high" ? 6 : 8;
      const ridge = p.clone().addScaledVector(up, 0.014 * scale);
      for (const sign of [-1, 1]) {
        let previous = p.clone().addScaledVector(blade, -length * scale);
        for (let j = 1; j <= steps; j++) {
          const t = j / steps;
          const edge = Math.sin(Math.PI * t) ** 0.65 * (j % 2 ? 1.18 : 0.8);
          const next = p
            .clone()
            .addScaledVector(blade, (2 * t - 1) * length * scale)
            .addScaledVector(side, sign * edge * width * scale);
          if (sign === 1) triangle(next, ridge, previous, color);
          else triangle(previous, ridge, next, color);
          previous = next;
        }
      }
    }
    crownPoints.push(...samples);
    if (medium) lobes.push(fitCanopyLobe(samples, 1.1));
    return samples;
  }
  function fruit(attachment: THREE.Vector3, radius: number, tint: number, index: number) {
    const center = attachment.clone().addScaledVector(up, -radius - 0.045);
    if (ripe) {
      if (!low && (!medium || index % 2 === 0))
        ripeSites.push({
          position: attachment,
          hang: new THREE.Vector3(0, -1, 0),
          order: (index * 0.618034) % 1,
          kind: "spur",
          scale: radius / 0.031
        });
      return;
    }
    if (!low && (!medium || index % 2 === 0)) {
      const indexedShell = new THREE.SphereGeometry(
        radius,
        medium ? 5 : quality === "high" ? 6 : 8,
        medium ? 3 : quality === "high" ? 4 : 6
      );
      const shell = indexedShell.toNonIndexed();
      indexedShell.dispose();
      shell.translate(...center.toArray());
      shell.deleteAttribute("uv");
      const shellColor = new THREE.Color().setHSL(0.19 + tint * 0.025, 0.5, 0.35);
      const rgb: number[] = [];
      for (let i = 0; i < shell.getAttribute("position").count; i++) rgb.push(shellColor.r, shellColor.g, shellColor.b);
      shell.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
      fruitParts.push(shell);
      fruitAnchors?.push(attachment);
      // Deterministic spherical sampling keeps thin spines in one merged fruit mesh.
      const count = medium ? 8 : quality === "high" ? 32 : 72;
      const spines: number[] = [],
        spineColors: number[] = [];
      for (let i = 0; i < count; i++) {
        const y = 1 - ((i + 0.5) * 2) / count;
        const angle = i * 2.399963;
        const direction = new THREE.Vector3(
          Math.cos(angle) * Math.sqrt(1 - y * y),
          y,
          Math.sin(angle) * Math.sqrt(1 - y * y)
        );
        const tangent = new THREE.Vector3()
          .crossVectors(direction, Math.abs(y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up)
          .normalize();
        const bitangent = direction.clone().cross(tangent).normalize();
        const base = center.clone().addScaledVector(direction, radius * 0.94);
        const tip = center.clone().addScaledVector(direction, radius * 1.48);
        const corners = [0, 1, 2].map(j =>
          base
            .clone()
            .addScaledVector(tangent, Math.cos((j * Math.PI * 2) / 3) * radius * 0.065)
            .addScaledVector(bitangent, Math.sin((j * Math.PI * 2) / 3) * radius * 0.065)
        );
        for (let j = 0; j < 3; j++) {
          for (const point of [corners[j], corners[(j + 1) % 3], tip]) {
            spines.push(...point.toArray());
            spineColors.push(shellColor.r * 1.1, shellColor.g * 1.1, shellColor.b * 0.8);
          }
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(spines, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(spineColors, 3));
      geometry.computeVertexNormals();
      fruitParts.push(geometry);
      fruitAnchors?.push(attachment);
    }
    if (!reduced && !bare) stalk(attachment, center.clone().addScaledVector(up, radius), 0.005);
  }

  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.46 },
        { center: [0.08, 1.2, -0.02], radius: 0.38 },
        { center: [-0.08, 2.5, 0.06], radius: 0.3 },
        { center: [0.03, 4, 0.02], radius: 0.18 },
        { center: [0.08, 6, 0], radius: 0.07 },
        { center: [0, 7.6, 0.05], radius: 0.015 }
      ],
      0.95,
      low ? 3 : 6,
      low ? 5 : medium ? 8 : 12
    )
  );
  let fruitIndex = 0;
  for (let i = 0; i < 6; i++) {
    const yaw = i * 2.39996 + 0.3;
    const start = new THREE.Vector3(0, 2.2 + i * 0.23, 0);
    const elbow = new THREE.Vector3(Math.cos(yaw - 0.12) * 1.35, 4.1 + (i % 2) * 0.45, Math.sin(yaw - 0.12) * 1.35);
    const end = new THREE.Vector3(Math.cos(yaw) * 2.7, 5.6 + (i % 3) * 0.45, Math.sin(yaw) * 2.7);
    branch(start, elbow, 0.22 - i * 0.012);
    branch(elbow, end, 0.13 - i * 0.007);
    for (let j = 0; j < 3; j++) {
      const a = elbow.clone().lerp(end, 0.18 + j * 0.37);
      const angle = yaw + (j % 2 ? -0.85 : 0.85);
      const tip = a
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * 0.85, 1.05 + (j % 2) * 0.5, Math.sin(angle) * 0.85));
      if (!low || bare) branch(a, tip, 0.065 - j * 0.008);
      for (let k = 0; k < 2; k++) {
        const b = a.clone().lerp(tip, 0.45 + k * 0.45);
        const shootYaw = angle + (k ? -0.65 : 0.65);
        const shoot = b
          .clone()
          .add(new THREE.Vector3(Math.cos(shootYaw) * 0.55, 0.25 + random() * 0.45, Math.sin(shootYaw) * 0.55));
        if (!reduced || (bare && medium)) branch(b, shoot, 0.023);
        shoots.push({ base: b, tip: shoot, points: spray(shoot, shootYaw) });
        const attachment = b.clone().lerp(shoot, 0.86);
        fruit(attachment, 0.027 + random() * 0.007, random(), fruitIndex++);
      }
    }
  }
  // Interior leaders fill the broad crown above the main forks.
  for (let i = 0; i < 6; i++) {
    const yaw = i * 2.39996;
    const tip = new THREE.Vector3(Math.cos(yaw) * 0.9, 7.4 + (i % 2) * 0.6, Math.sin(yaw) * 0.9);
    if (!low || bare) branch(new THREE.Vector3(0, 5.1, 0), tip, 0.055);
    shoots.push({ base: new THREE.Vector3(0, 5.1, 0), tip, points: spray(tip, yaw) });
  }
  if (bare)
    for (const shoot of shoots)
      for (const [from, to] of winterTwigs(shoot, WINTER_TWIGS[quality])) branch(from, to, medium ? 0.014 : 0.008);
  if (low) {
    for (const upper of [false, true])
      for (const east of [false, true])
        for (const north of [false, true]) {
          const points = crownPoints.filter(p => p.y >= 6.6 === upper && p.x >= 0 === east && p.z >= 0 === north);
          if (points.length) lobes.push(fitCanopyLobe(points, 1.12));
        }
  }
  const bark = mergeGeometries(wood)!;
  for (const part of wood) part.dispose();
  const foliage = reduced
    ? createCanopyLobes(lobes, { hue: 0.267, saturation: 0.5, lightness: 0.28 }, 74039)
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
  stem.name = "sweet-chestnut-fissured-bole-and-spreading-boughs";
  crown.name = reduced ? "sweet-chestnut-fitted-broad-crown" : "sweet-chestnut-long-serrated-simple-leaves";
  const group = new THREE.Group();
  group.name = "sweet-chestnut";
  group.userData.treeQuality = quality;
  group.add(stem, crown);
  const pickables: THREE.Mesh[] = [stem, crown];
  const splitBurs = ripe ? buildFruitLayer(ripeSites, SPLIT_BURS, quality) : undefined;
  if (fruitParts.length || splitBurs) {
    const fruitGeometry = splitBurs ?? mergeFruitParts(fruitParts, fruitAnchors);
    for (const part of fruitParts) part.dispose();
    const fruitMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(fruitGeometry, fruitMaterial);
    mesh.name = splitBurs ? "sweet-chestnut-split-burs-and-nuts" : "sweet-chestnut-green-spiny-burs";
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
