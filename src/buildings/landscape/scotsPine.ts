import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";

/** Mature woodland Pinus sylvestris: orange upper bark and an irregular crown of paired needle shoots. */
export function createScotsPine(quality: TreeQuality = "ultra"): CityStructureMeshes {
  const low = quality === "low";
  const medium = quality === "medium";
  const reduced = low || medium;
  let seed = 43213;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const up = new THREE.Vector3(0, 1, 0);
  const wood: THREE.BufferGeometry[] = [];
  const lobes: CanopyLobe[] = [];
  const crownPoints: THREE.Vector3[] = [];
  const positions: number[] = [],
    colors: number[] = [];
  function timber(geometry: THREE.BufferGeometry) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position");
    const rgb: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const angle = Math.atan2(p.getZ(i), p.getX(i));
      const plate = Math.sin(angle * 9 + p.getY(i) * 2) * Math.cos(p.getY(i) * 3.5);
      const color = new THREE.Color(0x594738).lerp(
        new THREE.Color(0xc77b46),
        THREE.MathUtils.smoothstep(p.getY(i), 8, 13)
      );
      color.multiplyScalar(0.84 + plate * 0.14);
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
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  function shoot(a: THREE.Vector3, b: THREE.Vector3) {
    const axis = b.clone().sub(a).normalize();
    const side = new THREE.Vector3(-axis.z, 0, axis.x).normalize();
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    const cross = new THREE.Vector3().crossVectors(axis, side).normalize();
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 196; i++) {
      const t = random();
      const angle = random() * Math.PI * 2;
      const radial = side.clone().multiplyScalar(Math.cos(angle)).addScaledVector(cross, Math.sin(angle));
      const base = a.clone().lerp(b, t).addScaledVector(radial, 0.025);
      const reach = 0.3 + random() * 0.22;
      const forward = 0.25 + random() * 0.35;
      const color = new THREE.Color().setHSL(0.38 + random() * 0.025, 0.27 + random() * 0.06, 0.22 + random() * 0.12);
      for (const sign of [-1, 1]) {
        // Two needles emerge from one fascicle, with a small twist along each blade.
        const direction = radial
          .clone()
          .addScaledVector(axis, forward)
          .addScaledVector(side, sign * 0.13)
          .normalize();
        const tip = base.clone().addScaledVector(direction, reach);
        points.push(base, tip);
        if (reduced || (quality === "high" && i % 4)) continue;
        const scale = quality === "high" ? 2 : 1;
        const end = base.clone().addScaledVector(direction, reach * scale);
        const middle = base.clone().lerp(end, 0.55);
        const width = 0.018 * scale;
        const left = middle
          .clone()
          .addScaledVector(side, width)
          .addScaledVector(cross, width * sign);
        const right = middle
          .clone()
          .addScaledVector(side, -width)
          .addScaledVector(cross, -width * sign);
        triangle(base, left, end, color);
        triangle(base, end, right, color);
      }
    }
    crownPoints.push(...points);
    if (medium) lobes.push(fitCanopyLobe(points, 1.1, true));
  }
  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.47 },
        { center: [0.12, 7, 0.03], radius: 0.29 },
        { center: [-0.12, 12, 0.12], radius: 0.2 },
        { center: [0.22, 17, 0], radius: 0.1 },
        { center: [-0.1, 20, 0.12], radius: 0.012 }
      ],
      0.95,
      low ? 3 : 5,
      low ? 6 : medium ? 9 : 16
    )
  );
  for (let i = 0; i < 3; i++) {
    const angle = i * 2.39996;
    branch(
      new THREE.Vector3(0, 7 + i * 1.1, 0),
      new THREE.Vector3(Math.cos(angle) * 0.4, 7.05 + i * 1.1, Math.sin(angle) * 0.4),
      0.055
    );
  }
  for (let i = 0; i < 10; i++) {
    const t = i / 10;
    const angle = i * 2.39996;
    const reach = 3.8 * Math.sin(0.8 + t * 1.8);
    const start = new THREE.Vector3(0, 11.5 + t * 6, 0);
    const elbow = new THREE.Vector3(
      Math.cos(angle - 0.15) * reach * 0.6,
      12.4 + t * 5.8,
      Math.sin(angle - 0.15) * reach * 0.6
    );
    const end = new THREE.Vector3(Math.cos(angle) * reach, 14 + t * 5.3, Math.sin(angle) * reach);
    if (!low || i % 2 === 0) {
      branch(start, elbow, 0.15 * (1 - t * 0.5));
      if (!low) branch(elbow, end, 0.075);
    }
    for (let j = 0; j < 4; j++) {
      const a = elbow.clone().lerp(end, 0.1 + j * 0.27);
      const yaw = angle + (j % 2 ? -0.65 : 0.65);
      const tip = a
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(yaw) * (0.8 + random() * 0.4),
            0.35 + random() * 0.5,
            Math.sin(yaw) * (0.8 + random() * 0.4)
          )
        );
      if (!reduced) branch(a, tip, 0.025);
      shoot(a, tip);
    }
  }
  for (let i = 0; i < 6; i++) {
    const angle = i * 2.39996;
    const start = new THREE.Vector3(0, 18.6, 0);
    const end = new THREE.Vector3(Math.cos(angle) * 1.3, 20 + (i % 2) * 0.25, Math.sin(angle) * 1.3);
    if (!low) branch(start, end, 0.06);
    shoot(start.clone().lerp(end, 0.55), end);
  }
  if (low) {
    for (const upper of [false, true])
      for (const east of [false, true])
        for (const north of [false, true]) {
          const points = crownPoints.filter(p => p.y >= 17 === upper && p.x >= 0 === east && p.z >= 0 === north);
          if (points.length) {
            const lobe = fitCanopyLobe(points, 1.15);
            lobe.radius.x *= 1.1;
            lobe.radius.z *= 1.1;
            lobes.push(lobe);
          }
        }
  }
  const bark = mergeGeometries(wood)!;
  for (const part of wood) part.dispose();
  const foliage = reduced
    ? createCanopyLobes(lobes, { hue: 0.39, saturation: 0.3, lightness: 0.285 }, 43213)
    : new THREE.BufferGeometry();
  if (!reduced) {
    foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    foliage.computeVertexNormals();
  }
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const foliageMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const stem = new THREE.Mesh(bark, barkMaterial);
  const crown = new THREE.Mesh(foliage, foliageMaterial);
  stem.name = "scots-pine-fissured-bole-orange-upper-bark-and-irregular-limbs";
  crown.name = reduced ? "scots-pine-fitted-needle-shoots" : "scots-pine-paired-blue-green-needles";
  const group = new THREE.Group();
  group.name = "scots-pine";
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
