import * as THREE from "three";
import { ModelKit, type Position } from "./modelKit";

export interface TimberLadderOptions {
  foot: Position;
  head: Position;
  width: number;
  rungs: number;
}

/** A reusable fitted ladder with its own contact shoes; no assembly-wide stretching. */
export function createTimberLadder(options: TimberLadderOptions) {
  const { foot, head, width, rungs } = options;
  if (
    ![...foot, ...head, width, rungs].every(Number.isFinite) ||
    head[1] <= foot[1] ||
    foot[1] <= 0 ||
    width <= 0.2 ||
    !Number.isInteger(rungs) ||
    rungs < 2
  )
    throw new Error("Invalid timber ladder dimensions");
  const k = new ModelKit("timber-ladder-high"),
    start = new THREE.Vector3(...foot),
    end = new THREE.Vector3(...head);
  const slope = end.clone().sub(start),
    across = new THREE.Vector3(-slope.z, 0, slope.x);
  if (across.lengthSq() < 1e-8) across.set(1, 0, 0);
  else across.normalize();
  const up = slope.clone().normalize(),
    normal = new THREE.Vector3().crossVectors(across, up).normalize();
  const point = (t: number, u: number): Position =>
    start.clone().addScaledVector(slope, t).addScaledVector(across, u).toArray() as Position;
  for (const side of [-1, 1]) {
    const u = (side * width) / 2;
    const rail = k.beam("ladder-stile", point(0, u), point(1, u), 0.12, "wood");
    rail.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, up, normal));
    const p = point(0, u);
    const shoe = k.box("ladder-contact-shoe", [p[0], foot[1] / 2, p[2]], [0.2, foot[1], 0.32], "oak");
    shoe.rotation.y = Math.atan2(-across.z, across.x);
    const grain = new THREE.Vector3(...point(0.12, u + side * 0.035)).addScaledVector(normal, 0.063),
      tip = new THREE.Vector3(...point(0.92, u + side * 0.035)).addScaledVector(normal, 0.063);
    k.beam("ladder-stile-grain", grain.toArray() as Position, tip.toArray() as Position, 0.006, "oak");
  }
  for (let i = 0; i < rungs; i++) {
    const t = (i + 0.65) / (rungs + 0.3);
    k.beam("ladder-through-rung", point(t, -width / 2 - 0.045), point(t, width / 2 + 0.045), 0.075, "wood", true);
    for (const side of [-1, 1]) {
      const p = new THREE.Vector3(...point(t, (side * width) / 2));
      k.beam(
        "ladder-rung-wedge",
        p.clone().addScaledVector(normal, -0.065).toArray() as Position,
        p.clone().addScaledVector(normal, 0.065).toArray() as Position,
        0.026,
        "oak",
        true
      );
    }
  }
  return k.finish();
}
