import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";

/** Illustrative Citrus x limon: a compact evergreen crown, glossy leaves and nipple-tipped yellow fruit. */
export function createLemon(quality: TreeQuality = "ultra"): CityStructureMeshes {
  const low = quality === "low";
  const medium = quality === "medium";
  const reduced = low || medium;
  let seed = 43319;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const fruitParts: THREE.BufferGeometry[] = [];
  const lobes: CanopyLobe[] = [];
  const crownPoints: THREE.Vector3[] = [];
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const crownCenter = new THREE.Vector3(0, 2.65, 0);

  function timber(geometry: THREE.BufferGeometry) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position");
    const rgb: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const grain = Math.sin(p.getY(i) * 1.3 + Math.atan2(p.getZ(i), p.getX(i)) * 9);
      const color = new THREE.Color().setHSL(0.105, 0.12, 0.32 + grain * 0.025);
      rgb.push(color.r, color.g, color.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    wood.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
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
    timber(geometry);
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
    for (let i = 0; i < 192; i++) {
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(theta) * r * 0.48, (random() - 0.5) * 0.9, Math.sin(theta) * r * 0.46));
      const yaw = angle + (random() - 0.5) * 3.7;
      const blade = new THREE.Vector3(Math.cos(yaw), (random() - 0.4) * 1.4, Math.sin(yaw)).normalize();
      const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      const length = 0.055 + random() * 0.022;
      const width = length * (0.43 + random() * 0.08);
      const color = new THREE.Color().setHSL(0.275 + random() * 0.025, 0.5, 0.22 + random() * 0.105);
      samples.push(p);
      // Every tier consumes every leaf sample so later branches and fruit stay fixed.
      if (reduced || (quality === "high" && i % 4)) continue;
      const scale = quality === "high" ? 2 : 1;
      const steps = quality === "high" ? 4 : 7;
      const ridge = p.clone().addScaledVector(up, 0.01 * scale);
      for (const sign of [-1, 1]) {
        let previous = p.clone().addScaledVector(blade, -length * scale);
        for (let j = 1; j <= steps; j++) {
          const t = j / steps;
          const edge = Math.sin(Math.PI * t) ** 0.82 * (j % 2 ? 1.025 : 0.98);
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
  }
  function fruit(attachment: THREE.Vector3, radius: number, tint: number, index: number) {
    const center = attachment.clone().addScaledVector(up, -radius * 1.47 - 0.03);
    if (!low && (!medium || index % 2 === 0)) {
      const geometry = new THREE.SphereGeometry(
        1,
        medium ? 5 : quality === "high" ? 8 : 12,
        medium ? 4 : quality === "high" ? 6 : 10
      );
      const p = geometry.getAttribute("position");
      const rgb: number[] = [];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        const pole = Math.abs(y) ** 14;
        const pitting = Math.sin(x * 19 + y * 47 + z * 31);
        const rind = 1 + pitting * 0.012 * (1 - pole);
        // An elliptical body ends in a short stalk collar and a slightly longer apical nipple.
        p.setXYZ(
          i,
          center.x + x * radius * rind,
          center.y + y * radius * (1.25 + pole * (y > 0 ? 0.18 : 0.38)),
          center.z + z * radius * rind
        );
        const color = new THREE.Color().setHSL(0.14 + tint * 0.012, 0.8, 0.49 + pitting * 0.02);
        rgb.push(color.r, color.g, color.b);
      }
      geometry.deleteAttribute("uv");
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
      geometry.computeVertexNormals();
      fruitParts.push(geometry);
    }
    if (!reduced) branch(attachment, center.clone().addScaledVector(up, radius * 1.425), 0.005);
  }

  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.17 },
        { center: [0.04, 0.9, 0.02], radius: 0.13 },
        { center: [-0.06, 1.8, 0.05], radius: 0.08 },
        { center: [0.06, 2.7, 0], radius: 0.035 },
        { center: [0, 3.25, 0.03], radius: 0.007 }
      ],
      0.4,
      low ? 3 : 5,
      low ? 5 : medium ? 8 : 12
    )
  );
  let fruitIndex = 0;
  for (let i = 0; i < 4; i++) {
    const yaw = i * 2.39996 + 0.2;
    const start = new THREE.Vector3(0, 1 + i * 0.13, 0);
    const elbow = new THREE.Vector3(Math.cos(yaw - 0.1) * 0.55, 1.65 + (i % 2) * 0.16, Math.sin(yaw - 0.1) * 0.55);
    const end = new THREE.Vector3(Math.cos(yaw) * 1.05, 2.15 + (i % 3) * 0.2, Math.sin(yaw) * 1.05);
    branch(start, elbow, 0.078 - i * 0.005);
    branch(elbow, end, 0.043 - i * 0.003);
    for (let j = 0; j < 3; j++) {
      const a = elbow.clone().lerp(end, 0.15 + j * 0.38);
      const angle = yaw + (j % 2 ? -0.75 : 0.75);
      const tip = a
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * 0.32, 0.5 + (j % 2) * 0.23, Math.sin(angle) * 0.32));
      if (!low) branch(a, tip, 0.026 - j * 0.003);
      for (let k = 0; k < 2; k++) {
        const b = a.clone().lerp(tip, 0.45 + k * 0.45);
        const shootYaw = angle + (k ? -0.7 : 0.7);
        const shoot = b
          .clone()
          .add(new THREE.Vector3(Math.cos(shootYaw) * 0.32, 0.12 + random() * 0.25, Math.sin(shootYaw) * 0.32));
        if (!reduced) branch(b, shoot, 0.012);
        spray(shoot, shootYaw);
        const junction = b.clone().lerp(shoot, 0.75);
        const attachment = junction
          .clone()
          .add(new THREE.Vector3(Math.cos(shootYaw) * 0.09, -0.05, Math.sin(shootYaw) * 0.09));
        if (!reduced) {
          branch(junction, attachment, 0.006);
          if (j === 1 && k === 0)
            branch(b, b.clone().add(new THREE.Vector3(-Math.sin(yaw) * 0.055, 0.045, Math.cos(yaw) * 0.055)), 0.007);
        }
        fruit(attachment, 0.034 + random() * 0.009, random(), fruitIndex++);
      }
    }
  }
  // Interior leaders close the rounded evergreen crown instead of leaving an orchard bowl.
  for (let i = 0; i < 4; i++) {
    const yaw = i * 2.39996;
    const tip = new THREE.Vector3(Math.cos(yaw) * 0.4, 2.9 + (i % 2) * 0.24, Math.sin(yaw) * 0.4);
    const start = new THREE.Vector3(0, 2.35, 0);
    if (!low) branch(start, tip, 0.025);
    spray(tip, yaw);
    const attachment = start.clone().lerp(tip, 0.8);
    fruit(attachment, 0.034 + random() * 0.009, random(), fruitIndex++);
  }
  if (low) {
    for (const upper of [false, true])
      for (const east of [false, true])
        for (const north of [false, true]) {
          const points = crownPoints.filter(p => p.y >= 2.7 === upper && p.x >= 0 === east && p.z >= 0 === north);
          if (points.length) lobes.push(fitCanopyLobe(points, 1.12));
        }
  }
  const bark = mergeGeometries(wood)!;
  for (const part of wood) part.dispose();
  const foliage = reduced
    ? createCanopyLobes(lobes, { hue: 0.287, saturation: 0.5, lightness: 0.28 }, 43319)
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
    shininess: 24,
    specular: 0x172414
  });
  const stem = new THREE.Mesh(bark, barkMaterial);
  const crown = new THREE.Mesh(foliage, leafMaterial);
  stem.name = "lemon-short-bole-scaffolds-and-twig-thorns";
  crown.name = reduced ? "lemon-fitted-evergreen-crown" : "lemon-folded-glossy-elliptical-leaves";
  const group = new THREE.Group();
  group.name = "lemon";
  group.userData.treeQuality = quality;
  group.add(stem, crown);
  const pickables: THREE.Mesh[] = [stem, crown];
  if (fruitParts.length) {
    const fruitGeometry = mergeGeometries(fruitParts)!;
    for (const part of fruitParts) part.dispose();
    const fruitMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(fruitGeometry, fruitMaterial);
    mesh.name = "lemon-yellow-elliptical-fruit-with-apical-nipples";
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
