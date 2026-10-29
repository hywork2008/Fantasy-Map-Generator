import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { type CanopyLobe, createCanopyLobes, fitCanopyLobe } from "./canopyLobes";
import { createTreeBase } from "./treeBase";
import type { TreeQuality } from "./treeQuality";

/** A town-square kapok (Ceiba pentandra): plank buttresses, a tall clean bole and tiered horizontal limbs. */
export function createKapok(quality: TreeQuality = "ultra"): CityStructureMeshes {
  const reduced = quality === "low" || quality === "medium";
  const lobes: CanopyLobe[] = [];
  let limbPoints: THREE.Vector3[] = [];
  let seed = 43177;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const wood: THREE.BufferGeometry[] = [];
  const positions: number[] = [],
    colors: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  // Smooth grey bark with pale lichen patches and faint vertical streaks.
  const bark = (p: THREE.Vector3) =>
    Math.sin(p.x * 7 + p.y * 1.3) * Math.cos(p.z * 6 - p.y * 0.8) > 0.7
      ? 0xa9ab9c
      : Math.sin(Math.atan2(p.z, p.x) * 23) > 0.85
        ? 0x6f6c62
        : 0x8d8a7e;
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
  function branch(a: THREE.Vector3, b: THREE.Vector3, bottom: number, top = bottom * 0.4, sides = 7) {
    if (reduced && bottom < (quality === "low" ? 0.21 : 0.1)) return;
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
  /** A thin, sinuous plank buttress running from high on the bole down to a root at ground level. */
  function buttress(angle: number, height: number, reach: number) {
    const out = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)),
      side = new THREE.Vector3(-out.z, 0, out.x);
    const steps = quality === "low" ? 2 : quality === "medium" ? 4 : 8,
      edge: THREE.Vector3[] = [],
      foot: THREE.Vector3[] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Concave upper edge: steep against the trunk, flaring out low over the ground.
      const r = 0.7 + reach * t,
        y = height * (1 - t) ** 2.2;
      const wave = side.clone().multiplyScalar(Math.sin(t * Math.PI * 1.5) * 0.35 * t);
      edge.push(out.clone().multiplyScalar(r).add(wave).setY(y));
      foot.push(
        out
          .clone()
          .multiplyScalar(r)
          .add(wave)
          .setY(t === 1 ? 0 : -0.05)
      );
    }
    const thickness = 0.14;
    const p: number[] = [],
      index: number[] = [];
    for (const s of [-1, 1])
      for (const v of [...edge, ...foot]) {
        const w = v.clone().addScaledVector(side, s * thickness * (1 - (v.y / height) * 0.3));
        p.push(w.x, w.y, w.z);
      }
    const n = steps + 1,
      half = n * 2;
    for (let i = 0; i < steps; i++)
      for (const [o, flip] of [
        [0, false],
        [half, true]
      ] as const) {
        const a = o + i,
          b = o + i + 1,
          c = o + n + i,
          d = o + n + i + 1;
        index.push(...(flip ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
      }
    // Close the top edge between the two faces.
    for (let i = 0; i < steps; i++) index.push(i, i + 1, half + i, i + 1, half + i + 1, half + i);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    timber(geometry);
  }
  function triangle(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) {
    for (const v of [a, b, c]) {
      positions.push(v.x, v.y, v.z);
      colors.push(color.r, color.g, color.b);
    }
  }
  /** Palmately compound leaves: five to seven narrow leaflets spread like a hand, massed into flat layers. */
  function leafLayer(center: THREE.Vector3, radius: number, count: number) {
    const color = new THREE.Color();
    const clouds: THREE.Vector3[][] = [[], []];
    for (let i = 0; i < count; i++) {
      const angle = random() * Math.PI * 2,
        r = Math.sqrt(random()) * radius;
      const p = center
        .clone()
        .add(
          new THREE.Vector3(Math.cos(angle) * r, (random() - 0.4) * 0.9 * (1 - (r / radius) ** 2), Math.sin(angle) * r)
        );
      const heading = random() * Math.PI * 2,
        size = 0.32 + random() * 0.14;
      color.setHSL(0.24 + random() * 0.05, 0.4 + random() * 0.12, 0.2 + random() * 0.12);
      // Preserve the whole random stream before thinning compound leaves.
      if (quality !== "ultra" && i % 2 !== 0) continue;
      for (let j = 0; j < 6; j++) {
        const theta = heading + (j - 2.5) * 0.42;
        const tip = p
          .clone()
          .add(new THREE.Vector3(Math.cos(theta) * size, -0.04 * Math.abs(j - 2.5), Math.sin(theta) * size));
        const mid = p.clone().lerp(tip, 0.5);
        const side = new THREE.Vector3(-Math.sin(theta), 0, Math.cos(theta)).multiplyScalar(
          size * (quality === "ultra" ? 0.12 : 0.24)
        );
        const a = mid.clone().add(side),
          b = mid.clone().sub(side);
        if (reduced) clouds[quality === "medium" && p.x < center.x ? 0 : 1].push(p, a, tip, b);
        else {
          triangle(p, a, tip, color);
          triangle(p, tip, b, color);
        }
      }
    }
    for (const points of clouds) {
      if (!points.length) continue;
      if (quality === "medium") lobes.push(fitCanopyLobe(points, 0.9, true));
      else if (quality === "low") limbPoints.push(...points);
    }
  }
  const height = 15;
  timber(
    createTreeBase(
      [
        { center: [0, 0, 0], radius: 1.05 },
        { center: [0, 2.5, 0], radius: 0.82 },
        { center: [0.05, 7, 0.03], radius: 0.7 },
        { center: [0.1, 12, 0], radius: 0.6 },
        { center: [0.1, height, 0], radius: 0.5 }
      ],
      1.4,
      4,
      quality === "low" ? 6 : 16
    )
  );
  for (let i = 0; i < 7; i++)
    buttress((i * Math.PI * 2) / 7 + random() * 0.35, 2.6 + random() * 1.4, 2.2 + random() * 1.4);
  // Near-horizontal limbs in loose tiers carry flat-topped cloud layers of foliage.
  const top = new THREE.Vector3(0.1, height, 0);
  for (let i = 0; i < 11; i++) {
    limbPoints = [];
    const angle = i * 2.39996,
      tier = i / 11;
    const start = new THREE.Vector3(0.1, height - 3 + tier * 3.2, 0);
    const reach = 6.8 - tier * 2.4 + random() * 1.2;
    const elbow = start
      .clone()
      .add(new THREE.Vector3(Math.cos(angle) * reach * 0.55, 1 + random() * 0.6, Math.sin(angle) * reach * 0.55));
    const tip = start
      .clone()
      .add(new THREE.Vector3(Math.cos(angle) * reach, 1.4 + random() * 0.8, Math.sin(angle) * reach));
    branch(start, elbow, 0.34 - tier * 0.12, 0.2, 8);
    branch(elbow, tip, 0.2, 0.06, 6);
    for (let k = 0; k < 3; k++) {
      const theta = angle + (k - 1) * 0.8;
      const a = elbow.clone().lerp(tip, 0.25 + k * 0.3);
      const twig = a.clone().add(new THREE.Vector3(Math.cos(theta) * 1.6, 0.8, Math.sin(theta) * 1.6));
      branch(a, twig, 0.06, 0.02, 5);
      leafLayer(twig, 1.6, 55);
    }
    leafLayer(tip.clone().addScaledVector(up, 0.3), 2.1, 85);
    if (quality === "low") lobes.push(fitCanopyLobe(limbPoints, 1, true));
  }
  limbPoints = [];
  branch(top, top.clone().add(new THREE.Vector3(0.3, 2.4, -0.2)), 0.42, 0.15, 8);
  leafLayer(top.clone().add(new THREE.Vector3(0.3, 2.7, -0.2)), 3, 160);
  if (quality === "low") lobes.push(fitCanopyLobe(limbPoints, 1, true));
  const barkGeometry = mergeGeometries(wood)!;
  for (const geometry of wood) geometry.dispose();
  const foliage = reduced
    ? createCanopyLobes(lobes, { hue: 0.265, saturation: 0.44, lightness: 0.25 }, 43177)
    : new THREE.BufferGeometry();
  if (!reduced) {
    foliage.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    foliage.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    foliage.computeVertexNormals();
  }
  const barkMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const leafMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(barkGeometry, barkMaterial),
    crown = new THREE.Mesh(foliage, leafMaterial);
  trunk.name = "kapok-buttressed-bole-and-tiered-limbs";
  crown.name = "kapok-palmate-leaf-layers";
  const group = new THREE.Group();
  group.name = "kapok";
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
