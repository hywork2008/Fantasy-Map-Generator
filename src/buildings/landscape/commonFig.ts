import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";

/** Ficus carica: low stout forks, spreading crown, palmate leaves and axillary figs. */
export function createCommonFig(quality: TreeQuality = "ultra"): CityStructureMeshes {
  const low = quality === "low";
  const medium = quality === "medium";
  const reduced = low || medium;
  let seed = 43301;
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
      const shade = 0.43 + Math.sin(p.getY(i) * 1.2 + p.getX(i) * 0.8) * 0.018;
      const color = new THREE.Color().setHSL(0.13, 0.075, shade);
      rgb.push(color.r, color.g, color.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    wood.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const geometry = new THREE.CylinderGeometry(
      radius * 0.58,
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
  // Concave triangulation preserves the sinuses; a fan would fill the gaps between lobes.
  function leafTemplate(fiveLobes: boolean) {
    const left = fiveLobes
      ? [
          [0, 0],
          [-0.35, -0.08],
          [-0.7, 0.04],
          [-0.86, 0.19],
          [-0.7, 0.32],
          [-0.42, 0.34],
          [-0.87, 0.48],
          [-0.96, 0.65],
          [-0.78, 0.8],
          [-0.48, 0.68],
          [-0.25, 0.48],
          [-0.29, 0.85],
          [-0.15, 1.08],
          [0, 1.2]
        ]
      : [
          [0, 0],
          [-0.36, -0.05],
          [-0.49, 0.28],
          [-0.87, 0.48],
          [-0.96, 0.65],
          [-0.78, 0.8],
          [-0.48, 0.68],
          [-0.25, 0.48],
          [-0.29, 0.85],
          [-0.15, 1.08],
          [0, 1.2]
        ];
    const outline = [
      ...left,
      ...left
        .slice(1, -1)
        .reverse()
        .map(([x, y]) => [-x, y])
    ].map(([x, y]) => new THREE.Vector2(x, y));
    return { outline, faces: THREE.ShapeUtils.triangulateShape(outline, []) };
  }
  const templates = [leafTemplate(false), leafTemplate(true)];
  function leaf(
    base: THREE.Vector3,
    yaw: number,
    length: number,
    width: number,
    pitch: number,
    tint: number,
    fiveLobes: boolean
  ) {
    const blade = new THREE.Vector3(Math.cos(yaw), pitch, Math.sin(yaw)).normalize();
    const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
    const template = templates[fiveLobes ? 1 : 0];
    const points = template.outline.map(({ x, y }) =>
      base
        .clone()
        .addScaledVector(blade, y * length)
        .addScaledVector(side, x * width)
        .addScaledVector(up, Math.sin((Math.PI * Math.max(0, y)) / 1.2) * 0.022 * (1 - Math.abs(x)))
    );
    const color = new THREE.Color().setHSL(0.27 + tint * 0.018, 0.47, 0.27 + tint * 0.105);
    for (const face of template.faces) {
      const [a, b, c] = face.map(index => points[index]);
      const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (normal.y < 0) normal.negate();
      const vertices = b.clone().sub(a).cross(c.clone().sub(a)).y < 0 ? [c, b, a] : [a, b, c];
      for (const p of vertices) {
        const n = normal
          .clone()
          .lerp(p.clone().sub(crownCenter).normalize(), 0.45)
          .addScaledVector(up, 0.2)
          .normalize();
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
        colors.push(color.r, color.g, color.b);
      }
    }
  }
  function spray(center: THREE.Vector3, yaw: number) {
    const samples: THREE.Vector3[] = [];
    for (let i = 0; i < 96; i++) {
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(theta) * r * 0.8, (random() - 0.5) * 1.15, Math.sin(theta) * r * 0.75));
      const angle = yaw + (random() - 0.5) * 4;
      const length = 0.16 + random() * 0.055;
      const width = length * (0.68 + random() * 0.15);
      const pitch = (random() - 0.4) * 1.2;
      const tint = random();
      samples.push(p);
      // All tiers consume every sample, preserving the later boughs, petioles and fruit nodes.
      if (reduced || (quality === "high" && i % 5)) continue;
      const scale = quality === "high" ? Math.sqrt(5) : 1;
      leaf(p, angle, length * scale, width * scale, pitch, tint, i % 3 !== 0);
    }
    crownPoints.push(...samples);
    if (medium) lobes.push(fitCanopyLobe(samples, 1.08));
  }
  function fig(node: THREE.Vector3, direction: THREE.Vector3, radius: number, tint: number, index: number) {
    const center = node.clone().addScaledVector(direction, 0.055).addScaledVector(up, -0.045);
    if (!low && (!medium || index % 2 === 0)) {
      const geometry = new THREE.SphereGeometry(
        1,
        medium ? 5 : quality === "high" ? 8 : 12,
        medium ? 4 : quality === "high" ? 5 : 9
      );
      const p = geometry.getAttribute("position");
      const rgb: number[] = [];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        const neck = 1 - THREE.MathUtils.smoothstep(y, 0.05, 0.95) * 0.45;
        const eye = THREE.MathUtils.smoothstep(-y, 0.91, 1);
        p.setXYZ(
          i,
          center.x + x * radius * neck,
          center.y + y * radius * (1.13 - eye * 0.09),
          center.z + z * radius * neck
        );
        const color = new THREE.Color().setHSL(
          tint < 0.4 ? 0.22 + tint * 0.06 : 0.86 + tint * 0.04,
          0.34,
          0.3 + tint * 0.035 - eye * 0.11
        );
        rgb.push(color.r, color.g, color.b);
      }
      geometry.deleteAttribute("uv");
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
      geometry.computeVertexNormals();
      fruitParts.push(geometry);
    }
    if (!reduced) branch(node, center.clone().addScaledVector(up, radius * 1.1), 0.007);
  }

  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.32 },
        { center: [0.06, 0.55, 0], radius: 0.26 },
        { center: [-0.04, 1.05, 0.06], radius: 0.16 }
      ],
      0.7,
      low ? 3 : 5,
      low ? 5 : medium ? 8 : 14
    )
  );
  let fruitIndex = 0;
  for (let i = 0; i < 5; i++) {
    const yaw = i * 2.39996 + 0.45;
    const start = new THREE.Vector3(0, 0.65 + i * 0.075, 0);
    const elbow = new THREE.Vector3(Math.cos(yaw - 0.12) * 1.2, 1.6 + (i % 2) * 0.2, Math.sin(yaw - 0.12) * 1.2);
    const end = new THREE.Vector3(Math.cos(yaw) * 2.6, 2.6 + (i % 3) * 0.23, Math.sin(yaw) * 2.6);
    branch(start, elbow, 0.23 - i * 0.014);
    branch(elbow, end, 0.14 - i * 0.008);
    for (let j = 0; j < 3; j++) {
      const a = elbow.clone().lerp(end, 0.15 + j * 0.4);
      const angle = yaw + (j % 2 ? -0.65 : 0.65);
      const tip = a
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * 0.55, 0.6 + (j % 2) * 0.38, Math.sin(angle) * 0.55));
      if (!low) branch(a, tip, 0.065 - j * 0.008);
      for (let k = 0; k < 2; k++) {
        const b = a.clone().lerp(tip, 0.25 + k * 0.5);
        const shootYaw = angle + (k ? -0.6 : 0.6);
        const shoot = b
          .clone()
          .add(new THREE.Vector3(Math.cos(shootYaw) * 0.58, 0.35 + random() * 0.3, Math.sin(shootYaw) * 0.58));
        if (!reduced) branch(b, shoot, 0.025);
        spray(shoot, shootYaw);
        for (let n = 0; n < 3; n++) {
          const node = b.clone().lerp(shoot, 0.25 + n * 0.32);
          const leafYaw = shootYaw + (n % 2 ? -0.95 : 0.95);
          const direction = new THREE.Vector3(Math.cos(leafYaw), 0, Math.sin(leafYaw));
          const petiole = node.clone().addScaledVector(direction, 0.11).addScaledVector(up, 0.035);
          const radius = 0.034 + random() * 0.009;
          const tint = random();
          if (!reduced) {
            branch(node, petiole, 0.006);
            leaf(petiole, leafYaw, 0.2, 0.15, 0.15, tint, n % 2 === 0);
          }
          fig(node, direction, radius, tint, fruitIndex++);
        }
      }
    }
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
    ? createCanopyLobes(lobes, { hue: 0.278, saturation: 0.47, lightness: 0.32 }, 43301)
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
  stem.name = "fig-smooth-grey-bole-and-low-stout-boughs";
  crown.name = reduced ? "fig-fitted-broad-crown" : "fig-folded-three-and-five-lobed-leaves";
  const group = new THREE.Group();
  group.name = "common-fig";
  group.userData.treeQuality = quality;
  group.add(stem, crown);
  const pickables: THREE.Mesh[] = [stem, crown];
  if (fruitParts.length) {
    const fruitGeometry = mergeGeometries(fruitParts)!;
    for (const part of fruitParts) part.dispose();
    const fruitMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    const fruit = new THREE.Mesh(fruitGeometry, fruitMaterial);
    fruit.name = "fig-axillary-green-and-violet-syconia";
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
