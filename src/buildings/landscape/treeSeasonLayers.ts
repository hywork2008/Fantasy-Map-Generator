import * as THREE from "three";
import type { TreeAppearance } from "./treePhenology";

/** Seasonal look passed to a tree factory; omitted fields keep the static default model. */
export interface TreeAppearanceOptions {
  appearance?: TreeAppearance;
  /** Foliage in autumn colours, also over fruit or a harvested crown (treePhenology.ts). */
  autumnPalette?: boolean;
}

/** Target colours of turning leaves; lightness scales the summer leaf so per-leaf variation survives. */
export interface FoliageTint {
  hue: number;
  hueJitter: number;
  saturation: number;
  lightnessScale: number;
}

/** Stable per-position noise in [0, 1); seasonal layers never draw from a generator's random stream. */
export function positionHash(x: number, y: number, z: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Recolour foliage in place, one hue per triangle so a leaf or lobe facet stays uniform. Works on
 * the full leaf geometry and on fitted canopy lobes alike, keeping tier switches consistent.
 */
export function tintFoliage(
  geometry: THREE.BufferGeometry,
  tint: FoliageTint,
  /** Leaves only: vertices for which this is false (berries, flowers in a shared crown) keep their colour. */
  isLeaf: (color: THREE.Color) => boolean = () => true
): void {
  const color = geometry.getAttribute("color");
  const position = geometry.getAttribute("position");
  if (!color) return;
  const index = geometry.index;
  const hsl = { h: 0, s: 0, l: 0 };
  const rgb = new THREE.Color();
  const jitter = new Float32Array(color.count);
  const triangles = index ? index.count / 3 : color.count / 3;
  for (let t = 0; t < triangles; t++) {
    const first = index ? index.getX(t * 3) : t * 3;
    const noise = positionHash(position.getX(first), position.getY(first), position.getZ(first));
    for (let k = 0; k < 3; k++) jitter[index ? index.getX(t * 3 + k) : t * 3 + k] = noise;
  }
  for (let i = 0; i < color.count; i++) {
    rgb.setRGB(color.getX(i), color.getY(i), color.getZ(i));
    if (!isLeaf(rgb)) continue;
    rgb.getHSL(hsl);
    rgb.setHSL(
      tint.hue + (jitter[i] - 0.5) * tint.hueJitter,
      tint.saturation,
      Math.min(0.72, hsl.l * tint.lightnessScale)
    );
    color.setXYZ(i, rgb.r, rgb.g, rgb.b);
  }
  color.needsUpdate = true;
}

/**
 * Pale the whole crown toward blossom colour: the distant reading of a tree in flower. Uniform,
 * because speckling the few large vertices of fitted lobes smears into grey gradients.
 */
export function blendFoliage(geometry: THREE.BufferGeometry, blossom: THREE.Color, amount: number): void {
  const color = geometry.getAttribute("color");
  if (!color) return;
  const rgb = new THREE.Color();
  for (let i = 0; i < color.count; i++) {
    rgb.setRGB(color.getX(i), color.getY(i), color.getZ(i)).lerp(blossom, amount);
    color.setXYZ(i, rgb.r, rgb.g, rgb.b);
  }
  color.needsUpdate = true;
}

/**
 * Five-petal flowers facing outward from a crown centre, white at the heart and tinted at the rim.
 * `petalSegments` 1 gives a flat pentagon for reduced tiers.
 */
export function addFlowers(
  out: { positions: number[]; normals: number[]; colors: number[] },
  centers: readonly THREE.Vector3[],
  facing: THREE.Vector3,
  radius: number,
  heart: THREE.Color,
  rim: THREE.Color,
  petalSegments: 1 | 2
): void {
  const up = new THREE.Vector3(0, 1, 0);
  for (const center of centers) {
    const n = center.clone().sub(facing).normalize().lerp(up, 0.45).normalize();
    const u = new THREE.Vector3().crossVectors(n, Math.abs(n.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    const v = new THREE.Vector3().crossVectors(n, u);
    const turn = positionHash(center.x, center.y, center.z) * Math.PI * 2;
    const push = (p: THREE.Vector3, c: THREE.Color) => {
      out.positions.push(p.x, p.y, p.z);
      out.normals.push(n.x, n.y, n.z);
      out.colors.push(c.r, c.g, c.b);
    };
    const rimPoint = (angle: number, r: number) =>
      center
        .clone()
        .addScaledVector(u, Math.cos(angle) * r)
        .addScaledVector(v, Math.sin(angle) * r);
    for (let k = 0; k < 5; k++) {
      const a = turn + (k * Math.PI * 2) / 5;
      if (petalSegments === 1) {
        push(center, heart);
        push(rimPoint(a, radius), rim);
        push(rimPoint(a + (Math.PI * 2) / 5, radius), rim);
        continue;
      }
      // A rounded petal: two triangles from the heart to a widened tip, slightly cupped.
      const tip = rimPoint(a, radius).addScaledVector(n, radius * 0.18);
      const left = rimPoint(a - 0.42, radius * 0.72).addScaledVector(n, radius * 0.08);
      const right = rimPoint(a + 0.42, radius * 0.72).addScaledVector(n, radius * 0.08);
      push(center, heart);
      push(left, rim);
      push(tip, rim);
      push(center, heart);
      push(tip, rim);
      push(right, rim);
    }
  }
}

/** A leafy shoot: where it leaves its parent, its tip and the leaf positions it carries. */
export interface LeafShoot {
  base: THREE.Vector3;
  tip: THREE.Vector3;
  points: readonly THREE.Vector3[];
}

/**
 * Winter twigs of one shoot as [from, to] segments. Twigs leave the shoot progressively towards
 * its tip and end at the outermost leaf positions, so a bare crown fans outward like the leafy
 * one instead of bursting from a point.
 */
export function winterTwigs(shoot: LeafShoot, count: number): [THREE.Vector3, THREE.Vector3][] {
  if (count <= 0 || !shoot.points.length) return [];
  const axis = shoot.tip.clone().sub(shoot.base);
  const length = axis.length() || 1;
  axis.divideScalar(length);
  const reach = (p: THREE.Vector3) => p.clone().sub(shoot.base).dot(axis);
  const outer = [...shoot.points].sort((a, b) => reach(b) - reach(a)).slice(0, Math.ceil(shoot.points.length / 2));
  const twigs: [THREE.Vector3, THREE.Vector3][] = [];
  for (let k = 0; k < count; k++) {
    const target = outer[Math.floor(((k + 0.5) * outer.length) / count)];
    const from = shoot.base.clone().lerp(shoot.tip, 0.45 + (0.55 * (k + 1)) / count);
    if (reach(target) > reach(from)) twigs.push([from, target]);
  }
  return twigs;
}

/** Winter twigs per leafy shoot by tier: low keeps only its limbs. */
export const WINTER_TWIGS: Record<"low" | "medium" | "high" | "ultra", number> = {
  low: 0,
  medium: 2,
  high: 3,
  ultra: 5
};

/** Open tapered cylinders for limbs a distant bare tree keeps in place of its foliage lobes. */
export function limbGeometry(
  limbs: readonly [THREE.Vector3, THREE.Vector3, number][],
  sides = 4
): THREE.BufferGeometry[] {
  const up = new THREE.Vector3(0, 1, 0);
  return limbs.map(([a, b, radius]) => {
    const geometry = new THREE.CylinderGeometry(radius * 0.35, radius, a.distanceTo(b), sides, 1, true);
    geometry.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, b.clone().sub(a).normalize()));
    geometry.translate(...a.clone().add(b).multiplyScalar(0.5).toArray());
    geometry.deleteAttribute("uv");
    return geometry;
  });
}
