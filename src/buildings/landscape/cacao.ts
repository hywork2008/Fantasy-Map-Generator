import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";

/** Illustrative Theobroma cacao: a low five-branched fan, large entire leaves and cauliflorous ridged pods. */
export function createCacao(quality: TreeQuality = "ultra"): CityStructureMeshes {
  const low = quality === "low";
  const medium = quality === "medium";
  const reduced = low || medium;
  let seed = 83171;
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
  const crownCenter = new THREE.Vector3(0, 3.2, 0);

  function timber(geometry: THREE.BufferGeometry) {
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
    for (let i = 0; i < 120; i++) {
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(theta) * r * 0.55, (random() - 0.5) * 0.9, Math.sin(theta) * r * 0.55));
      const yaw = angle + (random() - 0.5) * 3.7;
      const blade = new THREE.Vector3(Math.cos(yaw), (random() - 0.4) * 1.4, Math.sin(yaw)).normalize();
      const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      const length = 0.14 + random() * 0.06;
      const width = length * (0.36 + random() * 0.09);
      const tint = random();
      const color = new THREE.Color().setHSL(
        i % 19 === 0 ? 0.035 : 0.28 + tint * 0.02,
        i % 19 === 0 ? 0.38 : 0.5,
        0.22 + tint * 0.09
      );
      samples.push(p);
      // Every tier consumes every leaf sample so later branches and fruit stay fixed.
      if (reduced || (quality === "high" && i % 3)) continue;
      const scale = quality === "high" ? Math.sqrt(3) : 1;
      const steps = quality === "high" ? 4 : 6;
      const ridge = p.clone().addScaledVector(up, 0.014 * scale);
      for (const sign of [-1, 1]) {
        let previous = p.clone().addScaledVector(blade, -length * scale);
        for (let j = 1; j <= steps; j++) {
          const t = j / steps;
          const edge = Math.sin(Math.PI * t) ** 0.78;
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
  function pod(surface: THREE.Vector3, direction: THREE.Vector3, length: number, index: number) {
    // The proximal pole joins a short stalk on old wood, never a leafy twig tip.
    const axis = direction.clone().normalize();
    const pole = surface.clone().addScaledVector(axis, 0.055);
    const center = pole.clone().addScaledVector(axis, length * 0.5);
    if (!low && (!medium || index % 2 === 0)) {
      const geometry = new THREE.SphereGeometry(
        1,
        medium ? 10 : quality === "high" ? 20 : 40,
        medium ? 4 : quality === "high" ? 7 : 12
      );
      const position = geometry.getAttribute("position");
      const rgb: number[] = [];
      const rotation = new THREE.Quaternion().setFromUnitVectors(up, axis);
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i),
          y = position.getY(i),
          z = position.getZ(i);
        const azimuth = Math.atan2(z, x);
        const ridge = Math.cos(azimuth * 10);
        const ribs = 1 + ridge * 0.075 + Math.cos(azimuth * 5) * 0.035;
        const radius = length * 0.21 * ribs * (1 + y * 0.12);
        const point = new THREE.Vector3(x * radius, y * length * 0.5, z * radius).applyQuaternion(rotation).add(center);
        position.setXYZ(i, point.x, point.y, point.z);
        // A yellow-orange pod example; this is not a cultivar or ripening simulation.
        const color = new THREE.Color().setHSL(0.105 + (index % 3) * 0.012, 0.73, 0.43 + ridge * 0.045);
        rgb.push(color.r, color.g, color.b);
      }
      geometry.deleteAttribute("uv");
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
      geometry.computeVertexNormals();
      fruitParts.push(geometry);
    }
    if (!low && (!medium || index % 2 === 0)) branch(surface, pole, 0.012);
  }

  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.25 },
        { center: [0, 0.6, 0], radius: 0.19 },
        { center: [0, 1.25, 0], radius: 0.155 },
        { center: [0, 1.7, 0], radius: 0.14 }
      ],
      0.55,
      low ? 3 : 5,
      low ? 5 : medium ? 8 : 12
    )
  );
  // Six pods emerge from the bole below the first fan of lateral branches.
  for (let i = 0; i < 6; i++) {
    const angle = i * 2.39996 + 0.7;
    const y = 0.7 + i * 0.14;
    const radius = (y <= 1.25 ? 0.19 - (y - 0.6) * (0.035 / 0.65) : 0.155 - (y - 1.25) * (0.015 / 0.45)) * 0.9;
    const surface = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
    pod(surface, new THREE.Vector3(Math.cos(angle) * 0.65, -0.76, Math.sin(angle) * 0.65), 0.24 + (i % 3) * 0.035, i);
  }
  // One low jorquette carries five spreading main branches, with pods on their older wood.
  for (let i = 0; i < 5; i++) {
    const yaw = (i * Math.PI * 2) / 5 + 0.2;
    const start = new THREE.Vector3(0, 1.65, 0);
    const elbow = new THREE.Vector3(Math.cos(yaw - 0.08) * 0.85, 1.95 + (i % 2) * 0.12, Math.sin(yaw - 0.08) * 0.85);
    const end = new THREE.Vector3(Math.cos(yaw) * 1.65, 2.55 + (i % 3) * 0.18, Math.sin(yaw) * 1.65);
    branch(start, elbow, 0.12);
    branch(elbow, end, 0.072);
    for (let j = 0; j < 2; j++) {
      const t = 0.45 + j * 0.43;
      const tangent = elbow.clone().sub(start).normalize();
      const underside = up.clone().negate().addScaledVector(tangent, tangent.y).normalize();
      const attachment = start
        .clone()
        .lerp(elbow, t)
        .addScaledVector(underside, 0.12 * (1 - 0.55 * t) * 0.9);
      pod(
        attachment,
        new THREE.Vector3(Math.cos(yaw) * 0.32, -1, Math.sin(yaw) * 0.32),
        0.25 + (i % 3) * 0.025,
        6 + i * 2 + j
      );
    }
    for (let j = 0; j < 3; j++) {
      const a = elbow.clone().lerp(end, 0.1 + j * 0.4);
      const angle = yaw + (j % 2 ? -0.8 : 0.8);
      const tip = a.clone().add(new THREE.Vector3(Math.cos(angle) * 0.6, 0.55 + (j % 2) * 0.28, Math.sin(angle) * 0.6));
      if (!low) branch(a, tip, 0.035 - j * 0.004);
      for (let k = 0; k < 2; k++) {
        const b = a.clone().lerp(tip, 0.4 + k * 0.5);
        const shootYaw = angle + (k ? -0.65 : 0.65);
        const shoot = b
          .clone()
          .add(new THREE.Vector3(Math.cos(shootYaw) * 0.32, 0.18 + random() * 0.25, Math.sin(shootYaw) * 0.32));
        if (!reduced) branch(b, shoot, 0.014);
        spray(shoot, shootYaw);
      }
    }
    const inner = elbow
      .clone()
      .multiplyScalar(0.65)
      .add(new THREE.Vector3(0, 2, 0));
    if (!low) branch(elbow, inner, 0.03);
    spray(inner, yaw);
  }
  if (low) {
    for (const upper of [false, true])
      for (const east of [false, true])
        for (const north of [false, true]) {
          const points = crownPoints.filter(p => p.y >= 3.3 === upper && p.x >= 0 === east && p.z >= 0 === north);
          if (points.length) lobes.push(fitCanopyLobe(points, 1.12));
        }
  }
  const bark = mergeGeometries(wood)!;
  for (const part of wood) part.dispose();
  const foliage = reduced
    ? createCanopyLobes(lobes, { hue: 0.285, saturation: 0.5, lightness: 0.28 }, 83171)
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
  stem.name = "cacao-bole-five-jorquette-branches-and-pod-stalks";
  crown.name = reduced ? "cacao-fitted-evergreen-crown" : "cacao-large-entire-pointed-leaves-and-copper-flush";
  const group = new THREE.Group();
  group.name = "cacao";
  group.userData.treeQuality = quality;
  group.add(stem, crown);
  const pickables: THREE.Mesh[] = [stem, crown];
  if (fruitParts.length) {
    const fruitGeometry = mergeGeometries(fruitParts)!;
    for (const part of fruitParts) part.dispose();
    const fruitMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh(fruitGeometry, fruitMaterial);
    mesh.name = "cacao-ridged-cauliflorous-pods";
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
