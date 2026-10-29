import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";

/** Open-upland trees: a berry-laden moorland rowan and a fire-hardy Canary pine of volcanic slopes. */
export function createUplandTree(
  species: "rowan" | "canary_pine",
  quality: TreeQuality = "ultra"
): CityStructureMeshes {
  const rowan = species === "rowan";
  const reduced = quality === "low" || quality === "medium";
  const lobes: CanopyLobe[] = [],
    fruitLobes: CanopyLobe[] = [];
  let points: THREE.Vector3[] = [],
    lowPoints: THREE.Vector3[] = [];
  const finishSpray = () => {
    if (!points.length) return;
    if (quality === "medium") lobes.push(fitCanopyLobe(points, rowan ? 0.9 : 0.75, true));
    else if (quality === "low") lowPoints.push(...points);
    points = [];
  };
  const finishBand = () => {
    if (quality !== "low") return;
    if (lowPoints.length) {
      const lobe = fitCanopyLobe(lowPoints, rowan ? 0.95 : 1, true);
      if (!rowan) lobe.radius.y *= 0.55;
      lobes.push(lobe);
    }
    lowPoints = [];
  };
  let seed = rowan ? 43331 : 43357;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const positions: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  // Rowan bark is smooth silvery grey-brown with lenticel bands; pine bark is thick, plated and russet.
  const bark = (p: THREE.Vector3) =>
    rowan
      ? Math.sin(p.y * 37) > 0.8
        ? 0x5e5850
        : 0x8a8178
      : Math.sin(p.y * 5.5 + Math.atan2(p.z, p.x) * 3) * Math.sin(Math.atan2(p.z, p.x) * 7 - p.y * 2) > 0.2
        ? 0x3c2a20
        : 0x7a4a33;
  function timber(geometry: THREE.BufferGeometry) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const p = flat.getAttribute("position"),
      rgb: number[] = [],
      v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      const c = new THREE.Color(bark(v.fromBufferAttribute(p, i)));
      rgb.push(c.r, c.g, c.b);
    }
    flat.setAttribute("color", new THREE.Float32BufferAttribute(rgb, 3));
    wood.push(flat);
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, bottom: number, top = bottom * 0.4, sides = 6) {
    if (reduced && bottom < (quality === "low" ? (rowan ? 0.045 : 0.08) : rowan ? 0.025 : 0.045)) return;
    const geometry = new THREE.CylinderGeometry(
      top,
      bottom,
      a.distanceTo(b),
      reduced ? (quality === "low" ? 3 : 4) : sides,
      1,
      reduced
    );
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    timber(geometry);
  }
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    if (reduced) {
      points.push(a, b, c);
      return;
    }
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  /** One pinnate rowan leaf: a rachis with paired, toothed oblong leaflets and a terminal leaflet. */
  function pinnate(base: THREE.Vector3, direction: THREE.Vector3) {
    const d = direction.clone().normalize(),
      side = new THREE.Vector3(-d.z, 0, d.x);
    if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
    side.normalize();
    const length = 0.34 + random() * 0.08;
    const color = new THREE.Color().setHSL(0.24 + random() * 0.04, 0.42 + random() * 0.1, 0.22 + random() * 0.1);
    for (let i = 0; i <= 6; i++) {
      if (quality !== "ultra" && i % 2 !== 0) continue;
      const p = base.clone().addScaledVector(d, (length * i) / 6);
      for (const s of i === 6 ? [0] : [-1, 1]) {
        const out = s === 0 ? d.clone() : side.clone().multiplyScalar(s).addScaledVector(d, 0.35).normalize();
        const tip = p.clone().addScaledVector(out, 0.11).addScaledVector(up, 0.01);
        const across = new THREE.Vector3()
          .crossVectors(out, up)
          .normalize()
          .multiplyScalar(quality === "ultra" ? 0.024 : 0.045);
        const mid = p.clone().lerp(tip, 0.5);
        triangle(p, mid.clone().add(across), tip, color);
        triangle(p, tip, mid.clone().sub(across), color);
      }
    }
  }
  /** Flat-topped corymbs of scarlet rowan berries. */
  function berries(center: THREE.Vector3) {
    const color = new THREE.Color();
    const cloud: THREE.Vector3[] = [];
    for (let i = 0; i < 26; i++) {
      const angle = random() * Math.PI * 2,
        r = Math.sqrt(random()) * 0.14;
      const p = center.clone().add(new THREE.Vector3(Math.cos(angle) * r, -random() * 0.05, Math.sin(angle) * r));
      color.setHSL(0.01 + random() * 0.025, 0.8, 0.42 + random() * 0.08);
      if (quality !== "ultra" && i % 2 !== 0) continue;
      if (reduced) {
        cloud.push(
          p,
          p.clone().add(new THREE.Vector3(0.022, -0.02, 0)),
          p.clone().add(new THREE.Vector3(-0.01, -0.02, 0.02)),
          p.clone().add(new THREE.Vector3(-0.01, -0.02, -0.02))
        );
        continue;
      }
      triangle(
        p,
        p.clone().add(new THREE.Vector3(0.022, -0.02, 0)),
        p.clone().add(new THREE.Vector3(-0.01, -0.02, 0.02)),
        color
      );
      triangle(
        p,
        p.clone().add(new THREE.Vector3(-0.01, -0.02, 0.02)),
        p.clone().add(new THREE.Vector3(-0.01, -0.02, -0.02)),
        color
      );
    }
    if (quality === "medium") fruitLobes.push(fitCanopyLobe(cloud, 1, true));
    else if (quality === "low") {
      // One flat corymb diamond retains the actual fruit distribution without a red canopy mass.
      const { center, radius, rotationY } = fitCanopyLobe(cloud, 0.85, true);
      const vertices = [
        new THREE.Vector3(-radius.x, 0, 0),
        new THREE.Vector3(0, 0, radius.z),
        new THREE.Vector3(radius.x, 0, 0),
        new THREE.Vector3(0, 0, -radius.z)
      ];
      color.setHSL(0.025, 0.8, 0.45);
      for (const index of [0, 1, 2, 0, 2, 3]) {
        const p = vertices[index]
          .clone()
          .applyAxisAngle(up, rotationY ?? 0)
          .add(center);
        positions.push(p.x, p.y, p.z);
        colors.push(color.r, color.g, color.b);
      }
    }
  }
  /** A drooping tuft of long, slender pine needles fanning from a shoot tip. */
  function tuft(tip: THREE.Vector3, direction: THREE.Vector3, count = 70) {
    const d = direction.clone().normalize();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const theta = (i / count) * Math.PI * 2 + random() * 0.3,
        spread = 0.5 + random() * 0.5;
      const radial = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
      const length = 0.55 + random() * 0.2;
      // Needles leave the shoot forward and outward, then sag under their own length.
      const end = tip
        .clone()
        .addScaledVector(d, length * 0.4)
        .addScaledVector(radial, length * spread)
        .addScaledVector(up, -length * (0.35 + random() * 0.4));
      const width = radial.clone().cross(up).normalize().multiplyScalar(0.012);
      color.setHSL(0.27 + random() * 0.05, 0.38, 0.22 + random() * 0.1);
      if (quality !== "ultra" && i % 3 !== 0) continue;
      if (quality !== "ultra") width.multiplyScalar(3);
      triangle(tip.clone().add(width), end, tip.clone().sub(width), color);
    }
  }
  if (rowan) {
    const height = 9.5;
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.24 },
          { center: [0.03, 1.2, 0], radius: 0.16 },
          { center: [0.08, 3, 0.04], radius: 0.13 }
        ],
        0.6,
        5,
        quality === "low" ? 6 : 16
      )
    );
    // Ascending limbs from a short clean stem make a light, open, oval crown.
    const fork = new THREE.Vector3(0.08, 3, 0.04);
    branch(fork, new THREE.Vector3(0.15, height, -0.05), 0.12, 0.02);
    for (let i = 0; i < 14; i++) {
      const t = i / 14,
        angle = i * 2.39996;
      const from = fork.clone().lerp(new THREE.Vector3(0.15, height, -0.05), t * 0.75);
      const reach = 2.6 * Math.sin(0.45 + t * 2.4);
      const tip = from
        .clone()
        .add(new THREE.Vector3(Math.cos(angle) * reach, 1.2 + random() * 0.8, Math.sin(angle) * reach));
      branch(from, tip, 0.07 * (1 - t * 0.6), 0.012);
      for (let k = 0; k < 4; k++) {
        const a = from.clone().lerp(tip, 0.4 + k * 0.18),
          theta = angle + (random() - 0.5) * 2;
        const twig = a
          .clone()
          .add(new THREE.Vector3(Math.cos(theta) * 0.8, 0.15 + random() * 0.3, Math.sin(theta) * 0.8));
        branch(a, twig, 0.018, 0.006, 4);
        for (let l = 0; l < 12; l++) {
          const phi = random() * Math.PI * 2;
          pinnate(
            twig.clone().add(new THREE.Vector3((random() - 0.5) * 0.4, (random() - 0.5) * 0.3, (random() - 0.5) * 0.4)),
            new THREE.Vector3(Math.cos(phi), 0.2 - random() * 0.4, Math.sin(phi))
          );
        }
        finishSpray();
        if (k % 2 === 1) berries(twig.clone().addScaledVector(up, -0.05));
      }
      for (let l = 0; l < 14; l++) {
        const phi = random() * Math.PI * 2;
        pinnate(tip, new THREE.Vector3(Math.cos(phi), 0.3, Math.sin(phi)));
      }
      finishSpray();
      berries(tip.clone().addScaledVector(up, -0.08));
      finishBand();
    }
  } else {
    const height = 15.5;
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.55 },
          { center: [0, 1, 0], radius: 0.4 },
          { center: [0.1, 6, 0.05], radius: 0.3 },
          { center: [0.05, 12, -0.05], radius: 0.17 },
          { center: [0, height, 0], radius: 0.02 }
        ],
        0.9,
        6,
        quality === "low" ? 6 : 16
      )
    );
    // Epicormic tufts sprouting straight from the trunk, the species' answer to wildfire.
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.39996,
        y = 1.6 + i * 0.5;
      const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const a = new THREE.Vector3(0.05, y, 0).addScaledVector(out, 0.32);
      tuft(a.clone().addScaledVector(out, 0.1), out.clone().setY(0.4), 30);
      finishSpray();
      if (i % 4 === 3) finishBand();
    }
    // Irregular upturned limbs in loose tiers carry clustered needle tufts; an open, uneven crown.
    for (let level = 0; level < 9; level++) {
      const t = level / 9,
        y = 6.5 + t * (height - 7);
      for (let arm = 0; arm < 4; arm++) {
        const angle = arm * 1.571 + level * 0.9 + random() * 0.5;
        const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        const reach = 3.6 * (1 - t * 0.7) + random() * 0.8;
        const start = new THREE.Vector3(0.05, y, 0);
        const elbow = start
          .clone()
          .addScaledVector(out, reach * 0.6)
          .addScaledVector(up, -0.2);
        const tip = start.clone().addScaledVector(out, reach).addScaledVector(up, 0.7);
        branch(start, elbow, 0.11 * (1 - t * 0.6), 0.06);
        branch(elbow, tip, 0.06, 0.02);
        for (let k = 0; k < 6; k++) {
          const theta = angle + (random() - 0.5) * 1.8;
          const a = start
            .clone()
            .lerp(elbow, 0.5)
            .lerp(tip, k / 6);
          const shoot = a
            .clone()
            .add(new THREE.Vector3(Math.cos(theta) * 0.7, 0.3 + random() * 0.3, Math.sin(theta) * 0.7));
          branch(a, shoot, 0.025, 0.012, 4);
          tuft(shoot, shoot.clone().sub(a));
          tuft(a.clone().lerp(shoot, 0.5), shoot.clone().sub(a), 50);
          if (k === 2) finishSpray();
        }
        tuft(tip, tip.clone().sub(elbow), 90);
        finishSpray();
        // Glossy brown cones hang beneath the outer shoots.
        if (arm % 2 === 0 && !reduced) {
          const geometry = new THREE.ConeGeometry(0.06, 0.18, 6);
          geometry.rotateX(Math.PI);
          geometry.translate(tip.x, tip.y - 0.2, tip.z);
          const flat = geometry.toNonIndexed();
          geometry.dispose();
          const p = flat.getAttribute("position"),
            cone = new THREE.Color(0x6a4524);
          for (let j = 0; j < p.count; j += 3)
            triangle(
              new THREE.Vector3().fromBufferAttribute(p, j),
              new THREE.Vector3().fromBufferAttribute(p, j + 1),
              new THREE.Vector3().fromBufferAttribute(p, j + 2),
              cone
            );
          flat.dispose();
        }
      }
      finishBand();
    }
    tuft(new THREE.Vector3(0, height, 0), up, 90);
    finishSpray();
    finishBand();
  }
  const barkGeometry = mergeGeometries(wood)!;
  for (const geometry of wood) geometry.dispose();
  let foliage: THREE.BufferGeometry;
  if (reduced) {
    const green = createCanopyLobes(
      lobes,
      rowan ? { hue: 0.26, saturation: 0.45, lightness: 0.26 } : { hue: 0.29, saturation: 0.38, lightness: 0.24 },
      rowan ? 43331 : 43357
    );
    const parts = [green];
    if (fruitLobes.length)
      parts.push(createCanopyLobes(fruitLobes, { hue: 0.025, saturation: 0.8, lightness: 0.45 }, 43332));
    if (positions.length) {
      const fruit = new THREE.BufferGeometry();
      fruit.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      fruit.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
      fruit.computeVertexNormals();
      parts.push(fruit);
    }
    if (parts.length > 1) {
      foliage = mergeGeometries(parts)!;
      for (const part of parts) part.dispose();
    } else foliage = green;
  } else {
    foliage = new THREE.BufferGeometry();
    foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    foliage.computeVertexNormals();
  }
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(barkGeometry, barkMaterial),
    crown = new THREE.Mesh(foliage, leafMaterial);
  trunk.name = rowan ? "rowan-smooth-stem-and-ascending-limbs" : "canary-pine-plated-trunk-and-upturned-limbs";
  crown.name = rowan ? "rowan-pinnate-leaves-and-berries" : "canary-pine-drooping-needle-tufts-and-cones";
  const group = new THREE.Group();
  group.name = species.replaceAll("_", "-");
  group.userData.treeQuality = quality;
  group.add(trunk, crown);
  return {
    group,
    pickables: [trunk, crown],
    dispose() {
      barkGeometry.dispose();
      foliage.dispose();
      barkMaterial.dispose();
      leafMaterial.dispose();
    }
  };
}
