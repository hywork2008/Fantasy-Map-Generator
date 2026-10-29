import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";

/** Cultivated Prunus domestica: ascending forks, toothed obovate leaves and bloomed purple drupes. */
export function createEuropeanPlum(quality: TreeQuality = "ultra"): CityStructureMeshes {
  const low = quality === "low";
  const medium = quality === "medium";
  const reduced = low || medium;
  let seed = 43283;
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
  const crownCenter = new THREE.Vector3(0, 4.1, 0);

  function timber(geometry: THREE.BufferGeometry) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position");
    const rgb: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const grain = Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 13 + p.getY(i) * 0.55);
      const color = new THREE.Color().setHSL(0.065, 0.22, 0.23 + grain * 0.025);
      rgb.push(color.r, color.g, color.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    wood.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const geometry = new THREE.CylinderGeometry(
      radius * 0.46,
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
      const n = face.clone().lerp(p.clone().sub(crownCenter).normalize(), 0.53).addScaledVector(up, 0.25).normalize();
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  function spray(center: THREE.Vector3, angle: number) {
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) {
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(theta) * r * 0.57, (random() - 0.5) * 1.05, Math.sin(theta) * r * 0.54));
      const yaw = angle + (random() - 0.5) * 3.4;
      const blade = new THREE.Vector3(Math.cos(yaw), (random() - 0.4) * 1.5, Math.sin(yaw)).normalize();
      const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      const length = 0.065 + random() * 0.025;
      const width = length * (0.51 + random() * 0.08);
      const color = new THREE.Color().setHSL(0.26 + random() * 0.025, 0.48, 0.27 + random() * 0.11);
      samples.push(p);
      // Identical samples at every tier keep later forks, spurs and fruits stationary.
      if (reduced || (quality === "high" && i % 3)) continue;
      const scale = quality === "high" ? Math.sqrt(3) : 1;
      const steps = quality === "high" ? 4 : 7;
      const ridge = p.clone().addScaledVector(up, 0.013 * scale);
      for (const sign of [-1, 1]) {
        let previous = p.clone().addScaledVector(blade, -length * scale);
        for (let j = 1; j <= steps; j++) {
          const t = j / steps;
          // The blade widens beyond the middle from a wedge-shaped base to a short pointed tip.
          const edge = Math.sin(Math.PI * t) ** 0.75 * (0.74 + t * 0.36) * (j % 2 ? 1.1 : 0.91);
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
    if (medium) lobes.push(fitCanopyLobe(samples, 1.08));
  }
  function plum(attachment: THREE.Vector3, radius: number, tint: number, index: number) {
    const center = attachment.clone().addScaledVector(up, -radius * 1.25 - 0.035);
    if (!low && (!medium || index % 2 === 0)) {
      const geometry = new THREE.SphereGeometry(
        1,
        medium ? 5 : quality === "high" ? 8 : 12,
        medium ? 4 : quality === "high" ? 6 : 9
      );
      const p = geometry.getAttribute("position");
      const rgb: number[] = [];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        // A shallow one-sided suture and an oval body, without an apple socket or a pear neck.
        const seam = z > 0 ? Math.exp(-x * x * 200) : 0;
        p.setXYZ(i, center.x + x * radius, center.y + y * radius * 1.18, center.z + z * radius * (0.94 - seam * 0.065));
        const bloom = 0.5 + Math.sin(x * 17 + z * 11 + y * 19) * 0.5;
        const color = new THREE.Color().setHSL(
          0.69 + tint * 0.035,
          0.36 - bloom * 0.1,
          0.31 + bloom * 0.065 - seam * 0.035
        );
        rgb.push(color.r, color.g, color.b);
      }
      geometry.deleteAttribute("uv");
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
      geometry.computeVertexNormals();
      fruitParts.push(geometry);
    }
    if (!reduced) branch(attachment, center.clone().addScaledVector(up, radius * 1.17), 0.004);
  }

  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.22 },
        { center: [-0.05, 0.9, 0.04], radius: 0.17 },
        { center: [0.04, 1.65, -0.02], radius: 0.14 },
        { center: [0, 2.05, 0], radius: 0.06 }
      ],
      0.48,
      low ? 3 : 5,
      low ? 5 : medium ? 8 : 12
    )
  );
  let fruitIndex = 0;
  for (let i = 0; i < 5; i++) {
    const angle = i * 2.39996 + 0.8;
    const start = new THREE.Vector3(0.02, 1.45 + i * 0.12, 0);
    const elbow = new THREE.Vector3(Math.cos(angle - 0.14) * 0.72, 2.55 + (i % 2) * 0.2, Math.sin(angle - 0.14) * 0.72);
    const end = new THREE.Vector3(Math.cos(angle) * 1.7, 3.65 + (i % 3) * 0.24, Math.sin(angle) * 1.7);
    branch(start, elbow, 0.12 - i * 0.008);
    branch(elbow, end, 0.065 - i * 0.004);
    for (let j = 0; j < 4; j++) {
      const a = elbow.clone().lerp(end, 0.12 + j * 0.29);
      const yaw = angle + (j % 2 ? -0.7 : 0.7);
      const tip = a.clone().add(new THREE.Vector3(Math.cos(yaw) * 0.4, 0.75 + (j % 2) * 0.28, Math.sin(yaw) * 0.4));
      if (!low) branch(a, tip, 0.036 - j * 0.003);
      for (let k = 0; k < 2; k++) {
        const b = a.clone().lerp(tip, 0.55 + k * 0.4);
        const shoot = b
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(yaw + (k ? -0.6 : 0.6)) * 0.34,
              0.15 + random() * 0.24,
              Math.sin(yaw + (k ? -0.6 : 0.6)) * 0.34
            )
          );
        if (!reduced) branch(b, shoot, 0.013);
        spray(shoot, yaw);
        for (let f = 0; f < 2; f++) {
          const junction = b.clone().lerp(shoot, 0.5 + f * 0.37);
          const spur = junction
            .clone()
            .add(new THREE.Vector3(Math.cos(yaw + f) * 0.08, -0.075, Math.sin(yaw + f) * 0.08));
          if (!reduced) branch(junction, spur, 0.006);
          plum(spur, 0.033 + random() * 0.009, random(), fruitIndex++);
        }
      }
    }
  }
  if (low) {
    for (const upper of [false, true])
      for (const east of [false, true])
        for (const north of [false, true]) {
          const points = crownPoints.filter(p => p.y >= 4.4 === upper && p.x >= 0 === east && p.z >= 0 === north);
          if (points.length) lobes.push(fitCanopyLobe(points, 1.04));
        }
  }
  const bark = mergeGeometries(wood)!;
  for (const part of wood) part.dispose();
  const foliage = reduced
    ? createCanopyLobes(lobes, { hue: 0.272, saturation: 0.48, lightness: 0.325 }, 43283)
    : new THREE.BufferGeometry();
  if (!reduced) {
    foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    foliage.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
    foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  }
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const stem = new THREE.Mesh(bark, barkMaterial);
  const crown = new THREE.Mesh(foliage, leafMaterial);
  stem.name = "plum-dark-bole-and-ascending-forks";
  crown.name = reduced ? "plum-fitted-compact-crown" : "plum-folded-toothed-obovate-leaves";
  const group = new THREE.Group();
  group.name = "european-plum";
  group.userData.treeQuality = quality;
  group.add(stem, crown);
  const pickables: THREE.Mesh[] = [stem, crown];
  if (fruitParts.length) {
    const fruitGeometry = mergeGeometries(fruitParts)!;
    for (const part of fruitParts) part.dispose();
    const fruitMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    const fruit = new THREE.Mesh(fruitGeometry, fruitMaterial);
    fruit.name = "plum-purple-bloomed-oval-drupes";
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
