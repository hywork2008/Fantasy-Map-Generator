import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";

export type SacredGardenSpecies =
  | "mediterranean_cypress"
  | "oriental_evergreen"
  | "sacred_bodhi_and_fig"
  | "peaceful_willow";

/**
 * Traditional funerary and temple-garden trees: Italian cypress, Chinese arborvitae,
 * sacred fig and weeping willow. Meter scale; deterministic and texture-free.
 */
export function createSacredGardenTree(
  species: SacredGardenSpecies,
  quality: TreeQuality = "ultra"
): CityStructureMeshes {
  const cypress = species === "mediterranean_cypress",
    arborvitae = species === "oriental_evergreen",
    fig = species === "sacred_bodhi_and_fig";
  const reduced = quality === "low" || quality === "medium";
  const lobes: CanopyLobe[] = [];
  let points: THREE.Vector3[] = [],
    lowPoints: THREE.Vector3[] = [];
  let strands = 0;
  const cypressBands = new Map<string, THREE.Vector3[]>();
  const finishSpray = () => {
    if (!points.length) return;
    if (quality === "medium") {
      const lobe = fitCanopyLobe(points, fig ? 0.9 : arborvitae ? 0.85 : 0.75, true);
      if (!fig && !arborvitae && !cypress) {
        lobe.radius.x *= 0.8;
        lobe.radius.z *= 0.8;
      }
      lobes.push(lobe);
    } else if (quality === "low") lowPoints.push(...points);
    points = [];
  };
  const finishBranch = () => {
    if (quality !== "low" || !lowPoints.length) return;
    const lobe = fitCanopyLobe(lowPoints, fig ? 0.95 : 0.9, true);
    if (!fig && !arborvitae && !cypress) {
      lobe.radius.x *= 0.85;
      lobe.radius.z *= 0.85;
    }
    lobes.push(lobe);
    lowPoints = [];
  };
  let seed = cypress ? 43403 : arborvitae ? 43411 : fig ? 43427 : 43441;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const positions: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  // Cypress and arborvitae bark is fibrous red-brown; fig bark smooth pale grey; willow bark deeply ridged.
  const bark = (p: THREE.Vector3) => {
    const around = Math.atan2(p.z, p.x);
    if (fig) return Math.sin(around * 9 + p.y * 0.5) > 0.6 ? 0x77756c : 0x9e9b90;
    if (cypress || arborvitae) return Math.sin(around * 15 + p.y * 0.8) > 0.4 ? 0x5a3a28 : 0x7d5a42;
    return Math.sin(around * 11 + p.y * 1.5) * Math.cos(p.y * 7) > 0.3 ? 0x3b3229 : 0x5f5345;
  };
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
  function branch(a: THREE.Vector3, b: THREE.Vector3, bottom: number, top = bottom * 0.4, sides = 6, root = false) {
    if (reduced && !root && bottom < (quality === "low" ? 0.07 : 0.045)) return;
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
  /** Short, tight upward scale-leaf sprays that pack the narrow cypress column. */
  function scaleSpray(p: THREE.Vector3, outward: THREE.Vector3, visible: boolean) {
    const color = new THREE.Color().setHSL(0.3 + random() * 0.04, 0.35, 0.13 + random() * 0.08);
    const rise = new THREE.Vector3()
      .copy(up)
      .addScaledVector(outward, 0.35)
      .normalize()
      .multiplyScalar(0.3 + random() * 0.15);
    if (quality !== "ultra" && !visible) return;
    const side = new THREE.Vector3(-outward.z, 0, outward.x).multiplyScalar(quality === "ultra" ? 0.09 : 0.18);
    const tip = p.clone().add(rise),
      mid = p.clone().addScaledVector(rise, 0.45);
    triangle(p, mid.clone().add(side), tip, color);
    triangle(p, tip, mid.clone().sub(side), color);
    triangle(p, mid.clone().addScaledVector(outward, 0.07), tip, color);
  }
  /** A flat, vertical fan of arborvitae foliage, held edge-on to the trunk. */
  function fan(base: THREE.Vector3, outward: THREE.Vector3, size: number) {
    const color = new THREE.Color().setHSL(0.27 + random() * 0.05, 0.45, 0.2 + random() * 0.1);
    const plane = new THREE.Vector3().copy(up).addScaledVector(outward, 0.6).normalize();
    for (let i = 0; i < 7; i++) {
      const theta = (i / 6 - 0.5) * 1.6;
      const direction = plane
        .clone()
        .applyAxisAngle(new THREE.Vector3(-outward.z, 0, outward.x).normalize().cross(plane).normalize(), theta);
      const tip = base.clone().addScaledVector(direction, size * (0.7 + random() * 0.3));
      const width = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(-outward.z, 0, outward.x));
      if (width.lengthSq() < 1e-8) width.set(0.05, 0, 0);
      width.normalize().multiplyScalar(size * 0.11);
      const mid = base.clone().lerp(tip, 0.5);
      if (quality !== "ultra" && i % 2 !== 0) continue;
      if (quality !== "ultra") width.multiplyScalar(1.75);
      triangle(base, mid.clone().add(width), tip, color);
      triangle(base, tip, mid.clone().sub(width), color);
    }
  }
  /** Heart-shaped sacred fig leaf with its long drip tip, hanging from a slender petiole. */
  function figLeaf(p: THREE.Vector3, visible: boolean) {
    const heading = random() * Math.PI * 2;
    const down = new THREE.Vector3(Math.cos(heading) * 0.6, -0.8 + random() * 0.6, Math.sin(heading) * 0.6).normalize();
    const side = new THREE.Vector3(-Math.sin(heading), 0, Math.cos(heading));
    const size = 0.17 + random() * 0.05;
    const color = new THREE.Color().setHSL(0.25 + random() * 0.05, 0.45 + random() * 0.1, 0.2 + random() * 0.12);
    if (quality !== "ultra" && !visible) return;
    if (quality !== "ultra") side.multiplyScalar(3);
    const stalk = p.clone().addScaledVector(down, 0.06);
    const shoulderL = stalk
        .clone()
        .addScaledVector(down, size * 0.35)
        .addScaledVector(side, size * 0.55),
      shoulderR = stalk
        .clone()
        .addScaledVector(down, size * 0.35)
        .addScaledVector(side, -size * 0.55);
    const belly = stalk.clone().addScaledVector(down, size * 0.9),
      tip = stalk.clone().addScaledVector(down, size * 1.65);
    const notch = stalk.clone().addScaledVector(down, size * 0.1);
    triangle(notch, shoulderL, belly, color);
    triangle(notch, belly, shoulderR, color);
    triangle(shoulderL, belly.clone().addScaledVector(side, size * 0.2), belly, color);
    triangle(shoulderR, belly, belly.clone().addScaledVector(side, -size * 0.2), color);
    triangle(
      belly.clone().addScaledVector(side, size * 0.12),
      tip,
      belly.clone().addScaledVector(side, -size * 0.12),
      color
    );
  }
  /** One pendulous willow strand: a thin hanging whip clothed in narrow lance leaves. */
  function strand(start: THREE.Vector3, outward: THREE.Vector3, length: number) {
    let p = start.clone();
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const q = p
        .clone()
        .addScaledVector(outward, (length / steps) * (0.35 - t * 0.3))
        .addScaledVector(up, -(length / steps) * (0.6 + t * 0.4));
      if (i < 4) branch(p, q, 0.012, 0.008, 3);
      for (let k = 0; k < 9; k++) {
        const color = new THREE.Color().setHSL(0.2 + random() * 0.04, 0.5, 0.3 + random() * 0.12);
        const theta = random() * Math.PI * 2;
        const base = p.clone().lerp(q, k / 9);
        const leaf = new THREE.Vector3(Math.cos(theta) * 0.4, -1, Math.sin(theta) * 0.4)
          .normalize()
          .multiplyScalar(0.14 + random() * 0.05);
        const width = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta)).multiplyScalar(0.024);
        if (quality !== "ultra" && k % 3 !== 0) continue;
        if (quality !== "ultra") width.multiplyScalar(3);
        const mid = base.clone().addScaledVector(leaf, 0.5);
        triangle(base, mid.clone().add(width), base.clone().add(leaf), color);
        triangle(base, base.clone().add(leaf), mid.clone().sub(width), color);
      }
      p = q;
    }
    if (quality === "medium" && ++strands % 3 === 0) finishSpray();
  }
  if (cypress) {
    const height = 14;
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.34 },
          { center: [0, 1, 0], radius: 0.24 },
          { center: [0, 8, 0], radius: 0.13 },
          { center: [0, height - 0.4, 0], radius: 0.02 }
        ],
        0.6,
        5,
        quality === "low" ? 6 : 16
      )
    );
    // Steeply ascending branchlets hug the trunk; the crown is a slim spindle, widest below the middle.
    for (let i = 0; i < 2600; i++) {
      const t = random() ** 0.85,
        y = 0.9 + t * (height - 0.9);
      const envelope = 1.05 * Math.sin(Math.PI * Math.min(1, (y - 0.6) / (height - 0.3)) * 0.92 + 0.12) ** 0.9;
      const angle = random() * Math.PI * 2,
        r = envelope * (0.55 + 0.45 * Math.sqrt(random()));
      const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      scaleSpray(new THREE.Vector3(Math.cos(angle) * r, y, Math.sin(angle) * r), outward, i % 2 === 0);
      if (reduced && points.length) {
        const key = quality === "low" ? `${Math.floor(y)}` : `${Math.floor(y)}:${Math.floor((angle * 3) / Math.PI)}`;
        const cloud = cypressBands.get(key) ?? [];
        cloud.push(...points);
        cypressBands.set(key, cloud);
        points = [];
      }
      if (i % 40 === 0)
        branch(
          new THREE.Vector3(0, y - 0.4, 0),
          new THREE.Vector3(Math.cos(angle) * r * 0.8, y, Math.sin(angle) * r * 0.8),
          0.03,
          0.01,
          4
        );
    }
    // Round grey-brown cones sit close in the foliage.
    const cone = new THREE.Color(0x6e6450);
    for (let i = 0; i < 22; i++) {
      const angle = random() * Math.PI * 2,
        y = 2 + random() * 9;
      const p = new THREE.Vector3(Math.cos(angle) * 0.85, y, Math.sin(angle) * 0.85);
      if (reduced) continue;
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2;
        triangle(
          p.clone().addScaledVector(up, 0.05),
          p.clone().add(new THREE.Vector3(Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05)),
          p.clone().add(new THREE.Vector3(Math.cos(a + Math.PI / 2) * 0.05, 0, Math.sin(a + Math.PI / 2) * 0.05)),
          cone
        );
      }
    }
    for (const cloud of cypressBands.values()) {
      const lobe = fitCanopyLobe(cloud, quality === "low" ? 0.82 : 1, quality === "medium");
      if (quality === "low") lobe.radius.y *= 1.55;
      lobes.push(lobe);
    }
  } else if (arborvitae) {
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.42 },
          { center: [0.05, 0.7, 0], radius: 0.32 },
          { center: [0.1, 1.4, 0.05], radius: 0.28 }
        ],
        0.7,
        6,
        quality === "low" ? 6 : 16
      )
    );
    // Old temple arborvitae fork into several upright, slightly twisting leaders.
    const fork = new THREE.Vector3(0.1, 1.4, 0.05);
    for (let s = 0; s < 4; s++) {
      const angle = s * 1.57 + 0.4;
      const lean = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const tall = s === 0 ? 9 : 6.8 + random() * 1.4;
      const middle = fork
        .clone()
        .addScaledVector(lean, 0.6)
        .setY(tall * 0.5);
      const top = fork
        .clone()
        .addScaledVector(lean, s === 0 ? 0.2 : 0.9)
        .setY(tall);
      branch(fork, middle, s === 0 ? 0.24 : 0.18, 0.13, 7);
      branch(middle, top, 0.13, 0.02, 6);
      // Short side branches carry the vertical fans in an irregular, ovoid-conical mass.
      for (let i = 0; i < 26; i++) {
        const t = 0.15 + (i / 26) * 0.85;
        const from = t < 0.5 ? fork.clone().lerp(middle, t / 0.5) : middle.clone().lerp(top, (t - 0.5) / 0.5);
        const theta = i * 2.39996 + s;
        const outward = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
        const reach = (1.7 * Math.sin(Math.PI * Math.min(1, t * 1.05)) + 0.3) * (s === 0 ? 1 : 0.8);
        const tip = from.clone().addScaledVector(outward, reach).addScaledVector(up, 0.5);
        branch(from, tip, 0.035, 0.01, 4);
        for (let k = 0; k < 9; k++) {
          const p = from
            .clone()
            .lerp(tip, 0.3 + random() * 0.7)
            .add(new THREE.Vector3((random() - 0.5) * 0.5, (random() - 0.5) * 0.4, (random() - 0.5) * 0.5));
          fan(p, outward, 0.45 + random() * 0.2);
        }
        finishSpray();
        if (i === 8 || i === 17) finishBranch();
      }
      for (let k = 0; k < 10; k++)
        fan(
          top.clone().add(new THREE.Vector3((random() - 0.5) * 0.4, -random() * 0.6, (random() - 0.5) * 0.4)),
          new THREE.Vector3(Math.cos(k), 0, Math.sin(k)),
          0.4
        );
      finishSpray();
      finishBranch();
    }
  } else if (fig) {
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.85 },
          { center: [0, 0.8, 0], radius: 0.62 },
          { center: [0.1, 2.6, 0.05], radius: 0.52 },
          { center: [0.15, 3.6, 0], radius: 0.48 }
        ],
        1.3,
        8,
        quality === "low" ? 6 : 16
      )
    );
    // A short fluted bole spreads into massive, wide-arching limbs and a broad dome.
    const crown = new THREE.Vector3(0.15, 3.6, 0);
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7 + random() * 0.3;
      const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const reach = 4.5 + random() * 1.8;
      const elbow = crown
        .clone()
        .addScaledVector(out, reach * 0.45)
        .addScaledVector(up, 2.4 + random());
      const tip = crown
        .clone()
        .addScaledVector(out, reach)
        .addScaledVector(up, 4 + random() * 1.5);
      branch(crown, elbow, 0.32, 0.2, 8);
      branch(elbow, tip, 0.2, 0.06, 7);
      // A few aerial roots drop from the lower limbs, as on old temple figs.
      if (i % 2 === 0) {
        const drop = crown.clone().lerp(elbow, 0.75);
        branch(drop, drop.clone().setY(-0.2), 0.05, 0.035, 5, true);
      }
      for (let k = 0; k < 7; k++) {
        const theta = angle + (random() - 0.5) * 2.2;
        const from = elbow.clone().lerp(tip, k / 7);
        const twig = from
          .clone()
          .add(
            new THREE.Vector3(Math.cos(theta) * (1 + random()), 0.5 + random() * 0.8, Math.sin(theta) * (1 + random()))
          );
        branch(from, twig, 0.06, 0.015, 5);
        for (let l = 0; l < 140; l++) {
          const r = Math.sqrt(random()) * 1.35,
            phi = random() * Math.PI * 2;
          figLeaf(
            twig.clone().add(new THREE.Vector3(Math.cos(phi) * r, (random() - 0.4) * 1, Math.sin(phi) * r)),
            l % 3 === 0
          );
        }
        finishSpray();
      }
      for (let l = 0; l < 190; l++) {
        const r = Math.sqrt(random()) * 1.6,
          phi = random() * Math.PI * 2;
        figLeaf(
          tip.clone().add(new THREE.Vector3(Math.cos(phi) * r, (random() - 0.3) * 1.1, Math.sin(phi) * r)),
          l % 3 === 0
        );
      }
      finishSpray();
      finishBranch();
    }
  } else {
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.55 },
          { center: [0.05, 0.6, 0], radius: 0.42 },
          { center: [0.15, 2.2, 0.05], radius: 0.38 }
        ],
        1,
        6,
        quality === "low" ? 6 : 16
      )
    );
    // Short stout trunk, ascending main limbs, and curtains of whips hanging almost to the ground.
    const crown = new THREE.Vector3(0.15, 2.2, 0.05);
    for (let i = 0; i < 6; i++) {
      strands = 0;
      const angle = (i * Math.PI * 2) / 6 + random() * 0.4;
      const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const elbow = crown
        .clone()
        .addScaledVector(out, 1.4)
        .addScaledVector(up, 2.6 + random() * 0.8);
      const tip = elbow
        .clone()
        .addScaledVector(out, 2 + random() * 0.8)
        .addScaledVector(up, 2 + random() * 0.8);
      branch(crown, elbow, 0.26, 0.17, 7);
      branch(elbow, tip, 0.17, 0.05, 6);
      for (let k = 0; k < 26; k++) {
        const t = 0.15 + (k / 16) * 0.85;
        const from = elbow.clone().lerp(tip, t);
        const theta = angle + (random() - 0.5) * 2.6;
        const outward = new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta));
        const arch = from
          .clone()
          .addScaledVector(outward, 0.45 + random() * 0.35)
          .addScaledVector(up, 0.25);
        branch(from, arch, 0.03, 0.012, 4);
        strand(arch, outward, Math.min(arch.y - 0.6, 3.6 + random() * 2));
        strand(arch, outward.clone().applyAxisAngle(up, 0.5), Math.min(arch.y - 0.8, 3 + random() * 2));
        if (quality === "low" && k === 12) {
          finishSpray();
          finishBranch();
        }
      }
      strand(tip, out, 4.5);
      finishSpray();
      finishBranch();
    }
  }
  const barkGeometry = mergeGeometries(wood)!;
  for (const geometry of wood) geometry.dispose();
  const foliage = reduced
    ? createCanopyLobes(
        lobes,
        cypress
          ? { hue: 0.32, saturation: 0.35, lightness: 0.17 }
          : arborvitae
            ? { hue: 0.295, saturation: 0.45, lightness: 0.25 }
            : fig
              ? { hue: 0.275, saturation: 0.48, lightness: 0.25 }
              : { hue: 0.22, saturation: 0.5, lightness: 0.35 },
        cypress ? 43403 : arborvitae ? 43411 : fig ? 43427 : 43441
      )
    : new THREE.BufferGeometry();
  if (!reduced) {
    foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    foliage.computeVertexNormals();
  }
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(barkGeometry, barkMaterial),
    crown = new THREE.Mesh(foliage, leafMaterial);
  const label = cypress ? "cypress" : arborvitae ? "arborvitae" : fig ? "sacred-fig" : "weeping-willow";
  trunk.name = `${label}-trunk-and-branches`;
  crown.name = `${label}-foliage`;
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
