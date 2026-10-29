import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";

/** Salt-tolerant trees: a stilt-rooted red mangrove and a feathery, flowering tamarisk of dry scrub. */
export function createSaltTolerantTree(
  species: "red_mangrove" | "tamarisk",
  quality: TreeQuality = "ultra"
): CityStructureMeshes {
  const mangrove = species === "red_mangrove";
  const tier = mangrove ? "ultra" : quality;
  const reduced = tier === "low" || tier === "medium";
  const lobes: CanopyLobe[] = [],
    flowers: CanopyLobe[] = [];
  let lowPoints: THREE.Vector3[] = [],
    lowFlowers: THREE.Vector3[] = [];
  let seed = mangrove ? 43301 : 43319;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const positions: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  // Mangrove bark is grey-brown with pale lenticels; tamarisk stems are reddish brown.
  const bark = (p: THREE.Vector3) =>
    mangrove
      ? Math.sin(p.y * 31 + p.x * 17) * Math.cos(p.z * 27) > 0.75
        ? 0x9a927f
        : 0x5c5347
      : Math.sin(p.y * 15 + Math.atan2(p.z, p.x) * 5) > 0.5
        ? 0x4a2e22
        : 0x6e4332;
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
    if (reduced && bottom < (tier === "low" ? 0.07 : 0.035)) return;
    const geometry = new THREE.CylinderGeometry(
      top,
      bottom,
      a.distanceTo(b),
      reduced ? (tier === "low" ? 3 : 4) : sides,
      1,
      reduced
    );
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    timber(geometry);
  }
  /** A smooth curved limb or root through a quadratic Bezier, built from short tapered segments. */
  function arc(a: THREE.Vector3, control: THREE.Vector3, b: THREE.Vector3, bottom: number, top: number, steps = 6) {
    const curve = new THREE.QuadraticBezierCurve3(a, control, b);
    for (let i = 0; i < steps; i++) {
      const r0 = bottom + (top - bottom) * (i / steps),
        r1 = bottom + (top - bottom) * ((i + 1) / steps);
      branch(curve.getPoint(i / steps), curve.getPoint((i + 1) / steps), r0, r1, 6);
    }
  }
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  /** Thick, glossy elliptic mangrove leaves held in rosettes at the shoot tips. */
  function rosette(tip: THREE.Vector3, count: number) {
    for (let i = 0; i < count; i++) {
      const heading = (i / count) * Math.PI * 2 + random() * 0.4;
      const along = new THREE.Vector3(Math.cos(heading), 0.35 + random() * 0.3, Math.sin(heading))
        .normalize()
        .multiplyScalar(0.14 + random() * 0.05);
      const across = new THREE.Vector3(-Math.sin(heading), 0, Math.cos(heading)).multiplyScalar(0.05);
      const base = tip.clone().addScaledVector(along, 0.15),
        mid = base.clone().addScaledVector(along, 0.5),
        end = base.clone().add(along);
      const color = new THREE.Color().setHSL(0.3 + random() * 0.04, 0.45 + random() * 0.1, 0.18 + random() * 0.1);
      // A raised midrib keeps the leathery blade from reading as a flat card.
      const rib = mid.clone().addScaledVector(up, 0.015);
      triangle(base, mid.clone().add(across), rib, color);
      triangle(rib, mid.clone().add(across), end, color);
      triangle(base, rib, mid.clone().sub(across), color);
      triangle(rib, end, mid.clone().sub(across), color);
    }
  }
  /** Drooping plumes of scale-leaved tamarisk shoots, tipped with pink flower spikes. */
  function plume(start: THREE.Vector3, azimuth: number) {
    const foliage = new THREE.Color(),
      flower = new THREE.Color();
    const points: THREE.Vector3[] = [],
      pink: THREE.Vector3[] = [];
    for (let i = 0; i < 11; i++) {
      const theta = azimuth + (random() - 0.5) * 1.4;
      const length = 0.45 + random() * 0.45;
      let p = start
        .clone()
        .add(new THREE.Vector3((random() - 0.5) * 0.3, (random() - 0.5) * 0.2, (random() - 0.5) * 0.3));
      const direction = new THREE.Vector3(Math.cos(theta) * 0.7, 0.2 - random() * 0.9, Math.sin(theta) * 0.7)
        .normalize()
        .multiplyScalar(length / 5);
      const side = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta)).multiplyScalar(0.035);
      foliage.setHSL(0.24 + random() * 0.05, 0.18 + random() * 0.1, 0.36 + random() * 0.1);
      flower.setHSL(0.93 + random() * 0.04, 0.45, 0.68 + random() * 0.08);
      for (let j = 0; j < 5; j++) {
        const q = p
          .clone()
          .add(direction)
          .addScaledVector(up, -0.012 * j);
        const color = j >= 3 && i % 2 === 0 ? flower : foliage;
        if (tier === "ultra" || i % 3 !== 2) {
          const width = tier === "ultra" ? 1 : 1.375;
          const a = p.clone().addScaledVector(side, width),
            b = p.clone().addScaledVector(side, -width),
            c = p.clone().addScaledVector(up, 0.03 * width),
            d = p.clone().addScaledVector(up, -0.03 * width);
          if (reduced) (color === flower ? pink : points).push(a, q, b, c, q, d);
          else {
            triangle(a, q, b, color);
            triangle(c, q, d, color);
          }
        }
        p = q;
      }
    }
    if (tier === "medium") {
      lobes.push(fitCanopyLobe(points, 0.6, true));
      flowers.push(fitCanopyLobe(pink, 0.4, true));
    } else if (tier === "low") {
      lowPoints.push(...points);
      lowFlowers.push(...pink);
    }
  }
  if (mangrove) {
    // The bole rides above the mud on arching prop roots, which sink just below ground level.
    const crown = new THREE.Vector3(0, 2, 0);
    branch(new THREE.Vector3(0, 1.3, 0), crown, 0.24, 0.2, 8);
    for (let i = 0; i < 13; i++) {
      const angle = i * 2.39996 + random() * 0.2,
        out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const from = new THREE.Vector3(0, 1.3 + random() * 0.9, 0).addScaledVector(out, 0.15);
      const reach = 1.4 + random() * 1.4;
      const foot = out.clone().multiplyScalar(reach).setY(-0.35);
      const control = out
        .clone()
        .multiplyScalar(reach * 0.45)
        .setY(from.y + 0.6);
      arc(from, control, foot, 0.08, 0.05);
      // Some roots branch again where they near the mud.
      if (i % 3 === 0) {
        const knee = new THREE.QuadraticBezierCurve3(from, control, foot).getPoint(0.6);
        const second = foot
          .clone()
          .add(new THREE.Vector3(-out.z, 0, out.x).multiplyScalar(0.7))
          .addScaledVector(out, 0.4)
          .setY(-0.35);
        arc(
          knee,
          knee
            .clone()
            .lerp(second, 0.5)
            .setY(knee.y + 0.2),
          second,
          0.045,
          0.03,
          4
        );
      }
    }
    // Spreading limbs drop thin aerial roots and end in leaf rosettes with hanging propagules.
    for (let i = 0; i < 7; i++) {
      const angle = (i * Math.PI * 2) / 7 + random() * 0.4;
      const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const reach = 2.4 + random() * 1.2;
      const end = crown
        .clone()
        .addScaledVector(out, reach)
        .addScaledVector(up, 3 + random() * 1.8);
      const control = crown
        .clone()
        .addScaledVector(out, reach * 0.3)
        .addScaledVector(up, 2.4);
      arc(crown, control, end, 0.15, 0.05, 5);
      if (i % 2 === 0) {
        const drop = new THREE.QuadraticBezierCurve3(crown, control, end).getPoint(0.7);
        branch(drop, drop.clone().setY(-0.3), 0.03, 0.025, 5);
      }
      for (let k = 0; k < 6; k++) {
        const theta = angle + (random() - 0.5) * 2;
        const from = new THREE.QuadraticBezierCurve3(crown, control, end).getPoint(0.45 + k * 0.1);
        const tip = from
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(theta) * (0.8 + random()),
              0.4 + random() * 0.6,
              Math.sin(theta) * (0.8 + random())
            )
          );
        branch(from, tip, 0.035, 0.012, 5);
        for (let r = 0; r < 8; r++) {
          const cluster = tip
            .clone()
            .add(new THREE.Vector3((random() - 0.5) * 0.7, (random() - 0.3) * 0.4, (random() - 0.5) * 0.7));
          branch(tip, cluster, 0.012, 0.006, 4);
          rosette(cluster, 11);
          if (random() < 0.35) {
            const pod = new THREE.Color(0x56702e);
            const hang = cluster.clone().addScaledVector(up, -0.05),
              bottom = hang.clone().addScaledVector(up, -0.32);
            triangle(
              hang.clone().add(new THREE.Vector3(0.012, 0, 0)),
              bottom,
              hang.clone().add(new THREE.Vector3(-0.012, 0, 0)),
              pod
            );
            triangle(
              hang.clone().add(new THREE.Vector3(0, 0, 0.012)),
              bottom,
              hang.clone().add(new THREE.Vector3(0, 0, -0.012)),
              pod
            );
          }
        }
      }
      rosette(end, 12);
    }
  } else {
    timber(
      createTreeBase(
        [
          { center: [0, 0, 0], radius: 0.24 },
          { center: [0, 0.3, 0], radius: 0.18 },
          { center: [0.04, 0.5, 0.02], radius: 0.16 }
        ],
        0.5,
        5,
        tier === "low" ? 6 : 16
      )
    );
    // Many slender stems from one root crown arch outward into a loose, weeping dome.
    const crownBase = new THREE.Vector3(0.04, 0.5, 0.02);
    for (let s = 0; s < 8; s++) {
      lowPoints = [];
      lowFlowers = [];
      const angle = s * 2.39996 + random() * 0.3,
        out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const lean = 0.8 + random() * 1.5;
      const end = crownBase
        .clone()
        .addScaledVector(out, lean * 1.3)
        .addScaledVector(up, 3.2 + random() * 1.2 - lean * 0.3);
      const control = crownBase
        .clone()
        .addScaledVector(out, lean * 0.3)
        .addScaledVector(up, 2.6);
      arc(crownBase, control, end, s < 3 ? 0.11 : 0.08, 0.025, 5);
      const curve = new THREE.QuadraticBezierCurve3(crownBase, control, end);
      for (let k = 0; k < 6; k++) {
        const theta = angle + (random() - 0.5) * 2.2;
        const from = curve.getPoint(0.4 + k * 0.1);
        const tip = from
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(theta) * (0.6 + random() * 0.6),
              0.2 + random() * 0.5,
              Math.sin(theta) * (0.6 + random() * 0.6)
            )
          );
        branch(from, tip, 0.025, 0.006, 4);
        plume(tip, theta);
      }
      plume(end, angle);
      if (tier === "low") {
        lobes.push(fitCanopyLobe(lowPoints, 0.72, true));
        flowers.push(fitCanopyLobe(lowFlowers, 0.5, true));
      }
    }
  }
  const barkGeometry = mergeGeometries(wood)!;
  for (const geometry of wood) geometry.dispose();
  if (mangrove) {
    // Rescale the buried root tips so they reach the same 0.35 m depth as the other landscape trees.
    const p = barkGeometry.getAttribute("position");
    let depth = 0;
    for (let i = 0; i < p.count; i++) depth = Math.min(depth, p.getY(i));
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0) p.setY(i, (p.getY(i) * 0.35) / -depth);
    barkGeometry.computeVertexNormals();
  }
  let foliage: THREE.BufferGeometry;
  if (reduced) {
    const green = createCanopyLobes(lobes, { hue: 0.265, saturation: 0.23, lightness: 0.38 }, 43319);
    const pink = createCanopyLobes(flowers, { hue: 0.95, saturation: 0.4, lightness: 0.65 }, 43320);
    foliage = mergeGeometries([green, pink])!;
    green.dispose();
    pink.dispose();
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
  trunk.name = mangrove ? "mangrove-prop-roots-and-limbs" : "tamarisk-arching-stems";
  crown.name = mangrove ? "mangrove-leaf-rosettes-and-propagules" : "tamarisk-scale-leaf-plumes-and-flowers";
  const group = new THREE.Group();
  group.name = species.replaceAll("_", "-");
  if (!mangrove) group.userData.treeQuality = quality;
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
