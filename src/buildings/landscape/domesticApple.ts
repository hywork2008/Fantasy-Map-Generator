import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";
import {
  addFlowers,
  blendFoliage,
  type FoliageTint,
  type LeafShoot,
  positionHash,
  type TreeAppearanceOptions,
  tintFoliage,
  winterTwigs
} from "./treeSeasonLayers";

const AUTUMN: FoliageTint = { hue: 0.115, hueJitter: 0.07, saturation: 0.58, lightnessScale: 1.3 };
/** Young leaves opening with the blossom. */
const FLUSH: FoliageTint = { hue: 0.24, hueJitter: 0.03, saturation: 0.5, lightnessScale: 1.22 };
const BLOSSOM_HEART = new THREE.Color(0xfffcf8);
const BLOSSOM_RIM = new THREE.Color(0xf7d0da);
/** Mixed petals and young leaves seen from afar. */
const BLOSSOM_DISTANT = new THREE.Color(0xf4e2e7);

/**
 * Illustrative free-standing Malus domestica, with spreading scaffold limbs and fruiting spurs.
 * Every appearance shares one skeleton; seasons only add or drop leaves, blossom, fruit and twigs.
 */
export function createDomesticApple(
  quality: TreeQuality = "ultra",
  options: TreeAppearanceOptions = {}
): CityStructureMeshes {
  const low = quality === "low";
  const medium = quality === "medium";
  const reduced = low || medium;
  const appearance = options.appearance ?? "fruit";
  const bare = appearance === "bare";
  const blooming = appearance === "bloom";
  // Summer leaf shows small green fruit at close range; harvested and blossoming trees carry none.
  const fruitStage = appearance === "fruit" ? "ripe" : appearance === "leaf" && !reduced ? "unripe" : undefined;
  let seed = 43237;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const fruits: THREE.BufferGeometry[] = [];
  const lobes: CanopyLobe[] = [];
  const crownPoints: THREE.Vector3[] = [];
  const shoots: LeafShoot[] = [];
  const spurs: THREE.Vector3[] = [];
  const positions: number[] = [],
    normals: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const crownCenter = new THREE.Vector3(0, 4.3, 0);

  function timber(geometry: THREE.BufferGeometry) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position");
    const rgb: number[] = [];
    for (let i = 0; i < p.count; i++) {
      const furrow = Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 17 + p.getY(i) * 0.7);
      const color = new THREE.Color().setHSL(0.085, 0.16, 0.28 + furrow * 0.035);
      rgb.push(color.r, color.g, color.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    wood.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number) {
    const geometry = new THREE.CylinderGeometry(
      radius * 0.48,
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
      const n = face.clone().lerp(p.clone().sub(crownCenter).normalize(), 0.55).addScaledVector(up, 0.25).normalize();
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  function spray(center: THREE.Vector3, angle: number) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i < 128; i++) {
      const theta = random() * Math.PI * 2;
      const r = Math.sqrt(random());
      const p = center
        .clone()
        .add(new THREE.Vector3(Math.cos(theta) * r * 0.64, (random() - 0.5) * 1.05, Math.sin(theta) * r * 0.6));
      const yaw = angle + (random() - 0.5) * 3.6;
      const blade = new THREE.Vector3(Math.cos(yaw), (random() - 0.4) * 1.8, Math.sin(yaw)).normalize();
      const side = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      const length = 0.075 + random() * 0.035;
      const width = length * (0.53 + random() * 0.1);
      const color = new THREE.Color().setHSL(0.265 + random() * 0.025, 0.46, 0.27 + random() * 0.12);
      points.push(p);
      // All tiers consume identical samples, preserving subsequent branches and fruit attachments.
      // Blossoming trees carry half the leaves, the young flush opening with the flowers.
      if (reduced || (quality === "high" && i % 4) || (blooming && i % 2)) continue;
      const scale = quality === "high" ? 2 : 1;
      const steps = quality === "high" ? 4 : 8;
      const ridge = p.clone().addScaledVector(up, 0.014 * scale);
      for (const sign of [-1, 1]) {
        let previous = p.clone().addScaledVector(blade, -length * scale);
        for (let j = 1; j <= steps; j++) {
          const t = j / steps;
          const tooth = j % 2 ? 1.12 : 0.87;
          const next = p
            .clone()
            .addScaledVector(blade, (2 * t - 1) * length * scale)
            .addScaledVector(side, sign * Math.sin(Math.PI * t) ** 0.8 * tooth * width * scale);
          if (sign === 1) triangle(next, ridge, previous, color);
          else triangle(previous, ridge, next, color);
          previous = next;
        }
      }
    }
    crownPoints.push(...points);
    if (medium) lobes.push(fitCanopyLobe(points, 1.06));
    return points;
  }
  function apple(attachment: THREE.Vector3, ripeRadius: number, tint: number, index: number) {
    spurs.push(attachment);
    if (!fruitStage) return;
    const radius = fruitStage === "ripe" ? ripeRadius : ripeRadius * 0.55;
    const center = attachment.clone().addScaledVector(up, -radius * 1.25 - 0.035);
    if (!low && (!medium || index % 2 === 0)) {
      const geometry = new THREE.SphereGeometry(
        1,
        medium ? 5 : quality === "high" ? 8 : 12,
        medium ? 3 : quality === "high" ? 5 : 8
      );
      const p = geometry.getAttribute("position");
      const rgb: number[] = [];
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i),
          y = p.getY(i),
          z = p.getZ(i);
        const rib = 1 + Math.cos(Math.atan2(z, x) * 5) * 0.035 * Math.abs(y);
        // Broad shoulders and a depressed stem socket distinguish apples from plain red spheres.
        p.setXYZ(
          i,
          center.x + x * radius * rib * (1 + y * 0.08),
          center.y + y * radius * (0.88 - Math.abs(y) ** 8 * 0.12),
          center.z + z * radius * rib * (1 + y * 0.08)
        );
        const blush = THREE.MathUtils.smoothstep(x + z * 0.4 + tint * 0.5, -0.7, 0.9);
        const color =
          fruitStage === "ripe"
            ? new THREE.Color().setHSL(0.085 - blush * 0.075, 0.66, 0.35 + tint * 0.04)
            : new THREE.Color().setHSL(0.21 + tint * 0.02, 0.5, 0.33 + blush * 0.04);
        rgb.push(color.r, color.g, color.b);
      }
      geometry.deleteAttribute("uv");
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
      geometry.computeVertexNormals();
      fruits.push(geometry);
    }
    // Stems belong to the shared high/ultra timber, independently of fruit tessellation.
    if (!reduced) branch(attachment, center.clone().addScaledVector(up, radius * 0.73), 0.006);
  }

  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 0.25 },
        { center: [0.06, 0.9, 0.03], radius: 0.2 },
        { center: [-0.04, 1.9, 0.06], radius: 0.16 },
        { center: [0.1, 2.7, 0], radius: 0.07 }
      ],
      0.55,
      low ? 3 : 5,
      low ? 5 : medium ? 8 : 12
    )
  );
  let fruitIndex = 0;
  for (let i = 0; i < 6; i++) {
    const angle = i * 2.39996 + 0.25;
    const start = new THREE.Vector3(0, 1.7 + i * 0.15, 0.04);
    const elbow = new THREE.Vector3(Math.cos(angle - 0.13) * 1.15, 2.8 + (i % 3) * 0.26, Math.sin(angle - 0.13) * 1.15);
    const end = new THREE.Vector3(Math.cos(angle) * 2.35, 3.35 + (i % 3) * 0.32, Math.sin(angle) * 2.35);
    branch(start, elbow, 0.15 - i * 0.009);
    branch(elbow, end, 0.085 - i * 0.004);
    for (let j = 0; j < 4; j++) {
      const a = elbow.clone().lerp(end, 0.15 + j * 0.25);
      const yaw = angle + (j % 2 ? -0.6 : 0.6);
      const tip = a
        .clone()
        .add(
          new THREE.Vector3(
            Math.cos(yaw) * (j < 2 ? 0.4 : 0.65),
            0.95 + (j % 2) * 0.48,
            Math.sin(yaw) * (j < 2 ? 0.4 : 0.65)
          )
        );
      if (!low || bare) branch(a, tip, 0.042 - j * 0.004);
      for (let k = 0; k < 2; k++) {
        const b = a.clone().lerp(tip, 0.6 + k * 0.35);
        const shoot = b
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(yaw + (k ? -0.75 : 0.75)) * 0.42,
              0.12 + random() * 0.27,
              Math.sin(yaw + (k ? -0.75 : 0.75)) * 0.42
            )
          );
        if (!reduced || (bare && medium)) branch(b, shoot, 0.014);
        shoots.push({ base: b, tip: shoot, points: spray(shoot, yaw) });
        // Short lateral fruiting wood joins the shoot, placing fruit below the leaves.
        const spur = b
          .clone()
          .lerp(shoot, 0.72)
          .add(new THREE.Vector3(0.08 * Math.cos(yaw), -0.12, 0.08 * Math.sin(yaw)));
        if (!reduced) branch(b.clone().lerp(shoot, 0.48), spur, 0.009);
        apple(spur, 0.055 + random() * 0.012, random(), fruitIndex++);
      }
    }
  }
  if (bare) {
    // Winter twigs run from each shoot to the leaf positions, so leafy and bare branch tips coincide.
    const twigs = quality === "ultra" ? 5 : quality === "high" ? 3 : medium ? 2 : 0;
    for (const shoot of shoots)
      for (const [from, to] of winterTwigs(shoot, twigs)) branch(from, to, medium ? 0.012 : 0.007);
  }
  if (low && !bare) {
    for (const upper of [false, true])
      for (const east of [false, true])
        for (const north of [false, true]) {
          const points = crownPoints.filter(p => p.y >= 4.7 === upper && p.x >= 0 === east && p.z >= 0 === north);
          if (points.length) {
            const lobe = fitCanopyLobe(points, 1.02);
            lobes.push(lobe);
          }
        }
  }
  const bark = mergeGeometries(wood)!;
  for (const part of wood) part.dispose();
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const stem = new THREE.Mesh(bark, barkMaterial);
  stem.name = "apple-short-bole-and-spreading-fruiting-branches";
  const group = new THREE.Group();
  group.name = "domestic-apple";
  group.userData.treeQuality = quality;
  group.userData.treeAppearance = appearance;
  group.add(stem);
  const pickables: THREE.Mesh[] = [stem];
  if (!bare) {
    const foliage = reduced
      ? createCanopyLobes(lobes, { hue: 0.277, saturation: 0.46, lightness: 0.33 }, 43237)
      : new THREE.BufferGeometry();
    if (!reduced) {
      foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      foliage.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
      foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    }
    if (options.autumnPalette) tintFoliage(foliage, AUTUMN);
    else if (blooming) {
      tintFoliage(foliage, FLUSH);
      if (reduced) blendFoliage(foliage, BLOSSOM_DISTANT, low ? 0.55 : 0.4);
    }
    const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const crown = new THREE.Mesh(foliage, leafMaterial);
    crown.name = reduced ? "apple-fitted-spreading-crown" : "apple-folded-serrated-leaves";
    group.add(crown);
    pickables.push(crown);
  }
  if (blooming && !low) {
    // Flower clusters open on the fruiting spurs and on short spurs throughout the crown, so the
    // whole crown reads pink-white; reduced tiers keep fewer, larger flat flowers.
    const flowers = { positions: [] as number[], normals: [] as number[], colors: [] as number[] };
    const perCluster = quality === "ultra" ? 3 : quality === "high" ? 2 : 1;
    const every = quality === "ultra" ? 4 : quality === "high" ? 7 : 24;
    const sites = [...spurs, ...shoots.flatMap(shoot => shoot.points.filter((_, i) => i % every === 0))];
    const centers: THREE.Vector3[] = [];
    for (const site of sites)
      for (let k = 0; k < perCluster; k++) {
        const angle = (k / perCluster) * Math.PI * 2 + positionHash(site.x, site.y, site.z) * 6;
        const spread = perCluster > 1 ? 0.05 : 0;
        // Flowers sit just outside the leaves around them, where they are seen.
        const outward = site.clone().sub(crownCenter).normalize().multiplyScalar(0.06);
        centers.push(
          site
            .clone()
            .add(outward)
            .add(new THREE.Vector3(Math.cos(angle) * spread, 0.03 + k * 0.006, Math.sin(angle) * spread))
        );
      }
    addFlowers(
      flowers,
      centers,
      crownCenter,
      medium ? 0.1 : 0.045,
      BLOSSOM_HEART,
      BLOSSOM_RIM,
      quality === "ultra" ? 2 : 1
    );
    const blossom = new THREE.BufferGeometry();
    blossom.setAttribute("position", new THREE.Float32BufferAttribute(flowers.positions, 3));
    blossom.setAttribute("normal", new THREE.Float32BufferAttribute(flowers.normals, 3));
    blossom.setAttribute("color", new THREE.Float32BufferAttribute(flowers.colors, 3));
    const blossomMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(blossom, blossomMaterial);
    mesh.name = "apple-pink-white-blossom-clusters";
    group.add(mesh);
    pickables.push(mesh);
  }
  if (fruits.length) {
    const fruitGeometry = mergeGeometries(fruits)!;
    for (const part of fruits) part.dispose();
    const fruitMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
    const fruit = new THREE.Mesh(fruitGeometry, fruitMaterial);
    fruit.name = fruitStage === "ripe" ? "apple-blushed-fruit-with-stem-sockets" : "apple-small-green-fruitlets";
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
