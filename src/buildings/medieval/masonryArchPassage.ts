import * as THREE from "three";
import type { ModelKit, Surface } from "./modelKit";

/** Deep masonry opening with its own piers and vault, shared by kiln passages. */
export function addMasonryArchPassage(
  k: ModelKit,
  o: {
    name: string;
    x: number;
    z: number;
    bottom: number;
    spring: number;
    rise: number;
    opening: number;
    outerWidth: number;
    top: number;
    depth: number;
    surface?: Surface;
  }
) {
  const r = o.opening / 2,
    half = o.outerWidth / 2,
    surface = o.surface ?? "stone";
  for (const side of [-1, 1])
    k.box(
      `${o.name}-pier`,
      [o.x + (side * (half + r)) / 2, (o.bottom + o.top) / 2, o.z + o.depth / 2],
      [half - r, o.top - o.bottom, o.depth],
      surface
    );
  const arch = new THREE.Shape();
  arch.moveTo(-half, o.top);
  arch.lineTo(half, o.top);
  arch.lineTo(half, o.spring);
  arch.lineTo(r, o.spring);
  for (let i = 1; i <= 32; i++) {
    const a = (i * Math.PI) / 32;
    arch.lineTo(Math.cos(a) * r, o.spring + Math.sin(a) * o.rise);
  }
  arch.lineTo(-half, o.spring);
  arch.closePath();
  k.add(
    `${o.name}-vault`,
    new THREE.ExtrudeGeometry(arch, { depth: o.depth, bevelEnabled: false }),
    surface
  ).position.set(o.x, 0, o.z);
}
