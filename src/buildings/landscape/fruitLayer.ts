import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { TreeQuality } from "./treeQuality";
import { positionHash } from "./treeSeasonLayers";

const up = new THREE.Vector3(0, 1, 0);

/**
 * The shared fruit layer (docs/plan/bv-tree-seasonal-appearance.md §7): the skeleton gives
 * attachment sites, a species gives a fruit spec, and one geometry carries every fruit with its
 * stalk. Each fruit and its stalk form a group, so seasonal looks keep, drop or shrink them together.
 */
export interface FruitSite {
  /** Where the stalk leaves the wood. */
  position: THREE.Vector3;
  /** Unit direction from the attachment to the fruit. */
  hang: THREE.Vector3;
  /** Stable rank in [0, 1): a density keeps the sites below it, so remaining fruit never moves. */
  order: number;
  kind: "spur" | "node" | "axil" | "trunk" | "strand";
  /** Sites of one bunch share it; medium draws each bunch as one mass. */
  bunch?: number;
  /** Fruit size relative to the spec. */
  scale?: number;
}

export type FruitStage = "unripe" | "ripe" | "afterRipe";

export interface FruitSpec {
  /** Ellipsoidal drupes (olives, dates) or a chestnut bur split open on its nuts. */
  shape: "drupe" | "bur";
  /** Fruit length along the hang direction, in metres. */
  sizeMeters: number;
  /** Width over length. */
  widthRatio: number;
  stalkMeters: number;
  stalkColor: number;
  cluster: { count: number; spread: number };
  /** Colours drawn per fruit by a stable hash; afterRipe falls back to ripe. */
  palettes: { unripe: readonly number[]; ripe: readonly number[]; afterRipe?: readonly number[] };
}

/** A woody axis drawn in the fruit layer, such as a date bunch stalk, so harvest takes it away. */
export interface FruitAxis {
  from: THREE.Vector3;
  to: THREE.Vector3;
  radius: number;
}

/** Vertex range of one fruit (or cluster) with its stalk, in a non-indexed fruit geometry. */
export interface FruitGroup {
  start: number;
  count: number;
  anchor: [number, number, number];
}

export function fruitGroups(geometry: THREE.BufferGeometry): FruitGroup[] | undefined {
  return geometry.userData.fruitGroups as FruitGroup[] | undefined;
}

/**
 * Merge a generator's fruit parts. With `anchors` (one per part, the wood each part hangs from)
 * the parts become non-indexed and consecutive parts sharing an anchor form one group; without,
 * the merge is the plain one the static default model has always used.
 */
export function mergeFruitParts(
  parts: readonly THREE.BufferGeometry[],
  anchors?: readonly THREE.Vector3[]
): THREE.BufferGeometry {
  if (!anchors) return mergeGeometries([...parts])!;
  const flat = parts.map(part => (part.index ? part.toNonIndexed() : part));
  const merged = mergeGeometries(flat)!;
  for (let i = 0; i < flat.length; i++) if (flat[i] !== parts[i]) flat[i].dispose();
  const groups: FruitGroup[] = [];
  let start = 0;
  flat.forEach((part, i) => {
    const count = part.getAttribute("position").count;
    const last = groups[groups.length - 1];
    if (last && anchors[i] === anchors[i - 1]) last.count += count;
    else groups.push({ start, count, anchor: anchors[i].toArray() as [number, number, number] });
    start += count;
  });
  merged.userData.fruitGroups = groups;
  return merged;
}

interface Buffers {
  positions: number[];
  normals: number[];
  colors: number[];
}

const unitSpheres = new Map<string, { positions: Float32Array; normals: Float32Array }>();
/** A non-indexed unit sphere with smooth normals, built once per tessellation. */
function unitSphere(width: number, height: number) {
  const key = `${width}x${height}`;
  let sphere = unitSpheres.get(key);
  if (!sphere) {
    const indexed = new THREE.SphereGeometry(1, width, height);
    const flat = indexed.toNonIndexed();
    indexed.dispose();
    sphere = {
      positions: Float32Array.from(flat.getAttribute("position").array),
      normals: Float32Array.from(flat.getAttribute("normal").array)
    };
    flat.dispose();
    unitSpheres.set(key, sphere);
  }
  return sphere;
}

/** Ellipsoid with its +y pole toward `top`, radii (width, length, width) / 2 about `center`. */
function addEllipsoid(
  out: Buffers,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  length: number,
  width: number,
  segments: [number, number],
  color: THREE.Color,
  shade = 0.12
): void {
  const { positions, normals } = unitSphere(...segments);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const p = new THREE.Vector3(),
    n = new THREE.Vector3(),
    c = new THREE.Color();
  for (let i = 0; i < positions.length; i += 3) {
    p.set(positions[i] * width * 0.5, positions[i + 1] * length * 0.5, positions[i + 2] * width * 0.5);
    p.applyQuaternion(rotation).add(center);
    n.set(normals[i] / width, normals[i + 1] / length, normals[i + 2] / width)
      .applyQuaternion(rotation)
      .normalize();
    // The shoulder toward the stalk catches light; the far pole darkens slightly.
    c.copy(color).multiplyScalar(1 + positions[i + 1] * shade);
    out.positions.push(p.x, p.y, p.z);
    out.normals.push(n.x, n.y, n.z);
    out.colors.push(c.r, c.g, c.b);
  }
}

/** Open tapered prism from `a` to `b`, for stalks and bunch axes. */
function addRod(out: Buffers, a: THREE.Vector3, b: THREE.Vector3, radius: number, sides: number, color: THREE.Color) {
  const axis = b.clone().sub(a);
  const length = axis.length();
  if (length < 1e-6) return;
  axis.divideScalar(length);
  const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up);
  u.normalize();
  const v = new THREE.Vector3().crossVectors(axis, u);
  const ring = (center: THREE.Vector3, r: number, k: number) => {
    const angle = (k / sides) * Math.PI * 2;
    const normal = u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle));
    return { p: center.clone().addScaledVector(normal, r), n: normal };
  };
  for (let k = 0; k < sides; k++) {
    const a0 = ring(a, radius, k),
      a1 = ring(a, radius, k + 1),
      b0 = ring(b, radius * 0.6, k),
      b1 = ring(b, radius * 0.6, k + 1);
    for (const { p, n } of [a0, a1, b1, a0, b1, b0]) {
      out.positions.push(p.x, p.y, p.z);
      out.normals.push(n.x, n.y, n.z);
      out.colors.push(color.r, color.g, color.b);
    }
  }
}

/** Eight faces about `center`, stretched along `axis`: a fruit mass seen from afar. */
function addOctahedron(
  out: Buffers,
  center: THREE.Vector3,
  axis: THREE.Vector3,
  length: number,
  width: number,
  color: THREE.Color
) {
  const u = new THREE.Vector3().crossVectors(axis, Math.abs(axis.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up);
  u.normalize();
  const v = new THREE.Vector3().crossVectors(axis, u);
  const top = center.clone().addScaledVector(axis, length / 2),
    bottom = center.clone().addScaledVector(axis, -length / 2);
  const rim = [u, v, u.clone().negate(), v.clone().negate()].map(d => center.clone().addScaledVector(d, width / 2));
  const push = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    for (const p of [a, b, c]) {
      out.positions.push(p.x, p.y, p.z);
      out.normals.push(n.x, n.y, n.z);
      out.colors.push(color.r, color.g, color.b);
    }
  };
  for (let k = 0; k < 4; k++) {
    const a = rim[k],
      b = rim[(k + 1) % 4];
    push(top, b, a);
    push(bottom, a, b);
  }
}

const BUR_HUSK = new THREE.Color(0x8f7230);
const BUR_INSIDE = new THREE.Color(0xd9caa0);
const BUR_SPINE = new THREE.Color(0x7d6326);
const NUT = new THREE.Color(0x5c3115);
const NUT_TIP = new THREE.Color(0xc9b48a);

/**
 * A chestnut bur split open: four valves peel back from the stalk side into a bowl whose mouth
 * faces the hang direction, with two or three glossy nuts showing in it.
 */
function addOpenBur(
  out: Buffers,
  center: THREE.Vector3,
  hang: THREE.Vector3,
  radius: number,
  quality: TreeQuality,
  seed: number,
  husk: THREE.Color
): void {
  const ultra = quality === "ultra";
  const rows = ultra ? 4 : 2,
    columns = ultra ? 4 : 2;
  const u = new THREE.Vector3().crossVectors(hang, Math.abs(hang.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up);
  u.normalize();
  const v = new THREE.Vector3().crossVectors(hang, u);
  const turn = seed * Math.PI * 2;
  // Polar angle from the stalk pole, compressed so the valves end well short of closing again.
  const point = (theta: number, phi: number, r: number) => {
    const flare = theta / Math.PI;
    const t = theta * 0.55;
    const direction = hang
      .clone()
      .multiplyScalar(-Math.cos(t))
      .addScaledVector(u, Math.sin(t) * Math.cos(phi))
      .addScaledVector(v, Math.sin(t) * Math.sin(phi));
    return { p: center.clone().addScaledVector(direction, r * (1 + flare * flare * 0.7)), n: direction };
  };
  const push = (p: THREE.Vector3, n: THREE.Vector3, color: THREE.Color) => {
    out.positions.push(p.x, p.y, p.z);
    out.normals.push(n.x, n.y, n.z);
    out.colors.push(color.r, color.g, color.b);
  };
  const gap = 0.14;
  for (let valve = 0; valve < 4; valve++) {
    const phi0 = turn + (valve * Math.PI) / 2 + gap,
      phi1 = turn + ((valve + 1) * Math.PI) / 2 - gap;
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < columns; j++) {
        const th0 = (i / rows) * Math.PI,
          th1 = ((i + 1) / rows) * Math.PI;
        const ph0 = phi0 + ((phi1 - phi0) * j) / columns,
          ph1 = phi0 + ((phi1 - phi0) * (j + 1)) / columns;
        const a = point(th0, ph0, radius),
          b = point(th1, ph0, radius),
          c = point(th1, ph1, radius),
          d = point(th0, ph1, radius);
        // Outer husk, then the pale lining facing the nuts.
        for (const q of [a, c, b, a, d, c]) push(q.p, q.n, husk);
        for (const q of [a, b, c, a, c, d]) push(q.p, q.n.clone().negate(), BUR_INSIDE);
      }
    const spines = ultra ? 12 : 0;
    for (let s = 0; s < spines; s++) {
      const theta = ((s % 4) + 0.5) * (Math.PI / 4.5);
      const phi = phi0 + (phi1 - phi0) * ((Math.floor(s / 4) + 0.5) / Math.ceil(spines / 4));
      const base = point(theta, phi, radius);
      const tip = base.p.clone().addScaledVector(base.n, radius * 0.55);
      const side = new THREE.Vector3()
        .crossVectors(base.n, hang)
        .normalize()
        .multiplyScalar(radius * 0.09);
      push(base.p.clone().add(side), base.n, BUR_SPINE);
      push(tip, base.n, BUR_SPINE);
      push(base.p.clone().sub(side), base.n, BUR_SPINE);
    }
  }
  // Nuts sit side by side in the open mouth, flat faces together.
  const nuts = seed < 0.4 ? 2 : 3;
  for (let k = 0; k < nuts; k++) {
    const angle = turn + (k / nuts) * Math.PI * 2;
    const offset = u
      .clone()
      .multiplyScalar(Math.cos(angle))
      .addScaledVector(v, Math.sin(angle))
      .multiplyScalar(radius * 0.38);
    const nut = center
      .clone()
      .addScaledVector(hang, radius * 0.55)
      .add(offset);
    const before = out.positions.length;
    addEllipsoid(out, nut, hang.clone().negate(), radius * 0.95, radius * 0.72, ultra ? [8, 5] : [6, 3], NUT, 0.25);
    // A pale tuft at the point of each nut.
    for (let i = before / 3; i < out.positions.length / 3; i++) {
      const p = new THREE.Vector3(out.positions[i * 3], out.positions[i * 3 + 1], out.positions[i * 3 + 2]);
      if (p.clone().sub(nut).dot(hang) > radius * 0.4) {
        out.colors[i * 3] = NUT_TIP.r;
        out.colors[i * 3 + 1] = NUT_TIP.g;
        out.colors[i * 3 + 2] = NUT_TIP.b;
      }
    }
  }
}

/**
 * Build one fruit geometry for a tree. Ultra and high draw each fruit and its stalk, medium a
 * single mass per bunch (or per site), low nothing. Returns undefined when nothing is drawn.
 */
export function buildFruitLayer(
  sites: readonly FruitSite[],
  spec: FruitSpec,
  quality: TreeQuality,
  { stage = "ripe", density = 1, axes = [] }: { stage?: FruitStage; density?: number; axes?: readonly FruitAxis[] } = {}
): THREE.BufferGeometry | undefined {
  if (quality === "low") return undefined;
  const out: Buffers = { positions: [], normals: [], colors: [] };
  const groups: FruitGroup[] = [];
  const palette = (spec.palettes[stage] ?? spec.palettes.ripe).map(hex => new THREE.Color(hex));
  const stalk = new THREE.Color(spec.stalkColor);
  const detailed = quality !== "medium";
  for (const axis of axes) addRod(out, axis.from, axis.to, axis.radius, detailed ? 5 : 3, stalk);
  const kept = sites.filter(site => site.order < density);
  if (!detailed) {
    // Seen from afar, a bunch or cluster reads as one mass in the fruit colour.
    const bunches = new Map<number, FruitSite[]>();
    kept.forEach((site, i) => {
      const key = site.bunch ?? -1 - i;
      bunches.set(key, [...(bunches.get(key) ?? []), site]);
    });
    const length = spec.sizeMeters + spec.cluster.spread;
    for (const members of bunches.values()) {
      const start = out.positions.length / 3;
      const box = new THREE.Box3();
      for (const site of members)
        box.expandByPoint(site.position.clone().addScaledVector(site.hang, spec.stalkMeters + length * 0.5));
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const color = palette[0].clone().lerp(palette[palette.length - 1], 0.5);
      // A bunch hangs plumb as a whole; a lone cluster follows its own site.
      const bunch = members[0].bunch !== undefined;
      addOctahedron(
        out,
        center,
        bunch ? up : members[0].hang.clone().negate(),
        Math.max(length * 1.6, bunch ? size.y : 0),
        Math.max(length * 1.4, bunch ? Math.hypot(size.x, size.z) * 0.7 : 0),
        color
      );
      groups.push({
        start,
        count: out.positions.length / 3 - start,
        anchor: members[0].position.toArray() as [number, number, number]
      });
    }
  } else {
    const segments: [number, number] = quality === "ultra" ? [6, 4] : [6, 3];
    for (const site of kept) {
      const start = out.positions.length / 3;
      const scale = site.scale ?? 1;
      const length = spec.sizeMeters * scale,
        width = length * spec.widthRatio;
      const noise = positionHash(site.position.x, site.position.y, site.position.z);
      if (spec.shape === "bur") {
        const center = site.position.clone().addScaledVector(site.hang, spec.stalkMeters + length * 0.5);
        if (spec.stalkMeters > 0) addRod(out, site.position, center, 0.005, 3, stalk);
        addOpenBur(
          out,
          center,
          site.hang,
          length * 0.5,
          quality,
          noise,
          palette[Math.floor(noise * palette.length)] ?? BUR_HUSK
        );
      } else {
        const u = new THREE.Vector3().crossVectors(
          site.hang,
          Math.abs(site.hang.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up
        );
        u.normalize();
        const v = new THREE.Vector3().crossVectors(site.hang, u);
        for (let k = 0; k < spec.cluster.count; k++) {
          const angle = noise * Math.PI * 2 + (k / spec.cluster.count) * Math.PI * 2;
          const spread = spec.cluster.count > 1 ? spec.cluster.spread * (0.6 + 0.4 * positionHash(noise, k, 0.5)) : 0;
          const hang = site.hang
            .clone()
            .addScaledVector(u, Math.cos(angle) * spread * 4)
            .addScaledVector(v, Math.sin(angle) * spread * 4)
            .normalize();
          const top = site.position.clone().addScaledVector(hang, spec.stalkMeters);
          // Drupe stalks are a few millimetres thick: only ultra draws them, the fruit hangs the same.
          if (spec.stalkMeters > 0 && quality === "ultra")
            addRod(out, site.position, top, Math.max(0.0012, width * 0.08), 3, stalk);
          const pick = positionHash(site.position.z + k, site.position.x, site.position.y - k);
          addEllipsoid(
            out,
            top.clone().addScaledVector(hang, length * 0.5),
            hang.clone().negate(),
            length,
            width,
            segments,
            palette[Math.floor(pick * palette.length)]
          );
        }
      }
      groups.push({
        start,
        count: out.positions.length / 3 - start,
        anchor: site.position.toArray() as [number, number, number]
      });
    }
  }
  if (!out.positions.length) return undefined;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(out.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(out.normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(out.colors, 3));
  geometry.userData.fruitGroups = groups;
  return geometry;
}
