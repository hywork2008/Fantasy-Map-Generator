import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { createMedievalContainerModel } from "../props/medievalContainers";
import { checkedHarborCraneDimensions, type HarborCraneDimensions } from "./harborCraneDimensions";
import { ModelKit, type Position } from "./modelKit";

function shaft(k: ModelKit, name: string, p: Position, radius: number, length: number, iron = false) {
  const mesh = k.cylinder(name, p, radius, length, iron ? "iron" : "oak", radius, 32);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function foundation() {
  const k = new ModelKit("harbor-crane-foundation-high");
  // Same reserved 6.2 x 4 m envelope as Low and the CE site contract.
  for (let row = 0; row < 2; row++)
    for (let i = -1; i < 8; i++) {
      const x0 = Math.max(-3.7, -3.7 + i * 0.775 + row * 0.3875);
      const x1 = Math.min(2.5, -3.7 + (i + 1) * 0.775 + row * 0.3875);
      if (x1 - x0 < 0.02) continue;
      k.box("dressed-foundation-course", [(x0 + x1) / 2, 0.0575 + row * 0.12, 0], [x1 - x0 - 0.008, 0.115, 4], "stone");
    }
  for (const z of [-1.5, 0, 1.5]) {
    k.box("foundation-sleeper", [-0.6, 0.36, z], [5.5, 0.24, 0.3], "oak");
    for (const x of [-2.9, 1.6]) {
      k.box("sleeper-anchor-strap", [x, 0.49, z], [0.22, 0.035, 0.34], "iron");
      for (const dz of [-0.1, 0.1])
        k.cylinder("foundation-anchor-head", [x, 0.52, z + dz], 0.045, 0.035, "iron", 0.045, 10);
    }
  }
  for (let i = 0; i < 22; i++)
    k.box("operator-platform-board", [-3.19 + i * 0.25, 0.52, 0], [0.24, 0.08, 3.5], i % 4 ? "wood" : "oak");
  k.cylinder("fixed-pivot-socket", [0, 0.64, 0], 0.62, 0.17, "stone", 0.62, 48);
  k.ring("pivot-thrust-ring", [0, 0.735, 0], 0.47, 0.065, "iron");
  return k.finish();
}

function frame(d: HarborCraneDimensions) {
  const k = new ModelKit("harbor-crane-frame-high");
  const top = d.pulleyHeight,
    end = d.reach,
    mastTop = top + 0.65;
  k.box("rotating-mast", [0, (mastTop + 0.72) / 2, 0], [0.44, mastTop - 0.72, 0.44], "oak");
  k.cylinder("mast-pivot-pin", [0, 0.73, 0], 0.17, 0.65, "iron", 0.17, 24);
  for (const z of [-1.12, 1.12]) {
    k.box("rotating-frame-sill", [-1.2, 0.68, z], [3.4, 0.22, 0.24], "oak");
    k.beam("back-mast-stay", [-2.8, 0.78, z], [0, top - 0.25, z * 0.12], 0.22, "oak");
    k.beam("frame-cross-tie", [-2.8, 0.79, z], [0.2, 0.79, -z], 0.14, "oak");
  }
  for (const y of [0.95, top * 0.6, mastTop - 0.18]) {
    k.box("mast-iron-collar", [0, y, 0], [0.49, 0.1, 0.49], "iron");
    for (const z of [-0.255, 0.255]) shaft(k, "collar-bolt", [0, y, z], 0.045, 0.04, true);
  }
  // Paired side trusses share end pins, with actual gaps between the timbers.
  for (const z of [-0.31, 0.31]) {
    k.beam("upper-jib-chord", [0, mastTop, z], [end + 0.12, top + 0.09, z], 0.19, "oak");
    k.beam("compression-jib-strut", [0, 1.2, z], [end - 0.15, top - 0.15, z], 0.22, "oak");
    const bays = Math.max(3, Math.ceil(end / 1.4));
    for (let i = 1; i < bays; i++) {
      const t = i / bays;
      const x = (end - 0.15) * t;
      const lower = 1.2 + (top - 1.35) * t;
      const upper = mastTop + ((top + 0.09 - mastTop) * x) / (end + 0.12);
      k.beam("jib-truss-upright", [x, lower, z], [x, upper, z], 0.1, "wood");
      const nextX = ((end - 0.15) * (i + 1)) / bays;
      const nextLower = 1.2 + ((top - 1.35) * (i + 1)) / bays;
      k.beam("jib-diagonal-web", [x, upper, z], [nextX, nextLower, z], 0.09, "wood");
    }
  }
  for (const t of [0.08, 0.4, 0.72, 1]) {
    const x = (end - 0.15) * t;
    const y = mastTop + ((top + 0.09 - mastTop) * x) / (end + 0.12);
    k.beam("jib-transverse-tie", [x, y, -0.4], [x, y, 0.4], 0.12, "oak");
    shaft(k, "jib-through-bolt", [x, y, 0], 0.04, 0.91, true);
  }
  k.box("slewing-handle-socket", [0, 1.05, 0.32], [0.65, 0.17, 0.18], "iron");
  k.beam("slewing-push-bar", [-0.2, 1.05, 0.4], [-2.7, 1.05, 0.4], 0.1, "wood");
  return k.finish();
}

function drive(treadwheel: boolean) {
  const k = new ModelKit(treadwheel ? "treadwheel-drive-high" : "hand-winch-drive-high");
  const x = treadwheel ? -1.8 : -1.6,
    y = treadwheel ? 2.8 : 1.6;
  for (const z of [-1.05, 1.05]) {
    k.box("drive-bearing-post", [x, (y + 0.68) / 2, z], [0.23, y - 0.68, 0.25], "oak");
    k.box("split-bearing-block", [x, y, z], [0.55, 0.32, 0.36], "wood");
    k.box("bearing-cap-strap", [x, y + 0.18, z], [0.59, 0.035, 0.38], "iron");
    for (const dx of [-0.21, 0.21])
      k.cylinder("bearing-cap-bolt", [x + dx, y + 0.22, z], 0.035, 0.06, "iron", 0.035, 10);
    k.beam("bearing-post-knee", [x - 0.65, 0.7, z], [x, y - 0.3, z], 0.14, "oak");
  }
  shaft(k, "drive-axle", [x, y, treadwheel ? 0.3 : 0], 0.13, treadwheel ? 3.2 : 2.48);
  const drumZ = treadwheel ? 1.45 : 0;
  shaft(k, "winding-drum", [x, y, drumZ], 0.25, treadwheel ? 0.45 : 0.9);
  for (const z of [-1, 1]) shaft(k, "drum-flange", [x, y, drumZ + z * (treadwheel ? 0.26 : 0.48)], 0.33, 0.06);
  if (treadwheel) {
    for (const z of [-0.75, 0.75]) {
      for (const radius of [1.52, 1.67]) {
        const mesh = k.add("laminated-treadwheel-rim", new THREE.TorusGeometry(radius, 0.075, 8, 96), "oak");
        mesh.position.set(x, y, z);
      }
      shaft(k, "wheel-hub", [x, y, z], 0.29, 0.25);
      for (let i = 0; i < 12; i++) {
        const a = (i * Math.PI) / 6;
        k.beam(
          "mortised-wheel-spoke",
          [x + Math.cos(a) * 0.22, y + Math.sin(a) * 0.22, z],
          [x + Math.cos(a) * 1.61, y + Math.sin(a) * 1.61, z],
          0.11,
          "wood"
        );
        shaft(k, "rim-joint-peg", [x + Math.cos(a) * 1.6, y + Math.sin(a) * 1.6, z], 0.035, 0.18, true);
      }
    }
    for (let i = 0; i < 48; i++) {
      const a = (i * Math.PI) / 24;
      const plank = k.box(
        "walkable-wheel-tread",
        [x + Math.cos(a) * 1.59, y + Math.sin(a) * 1.59, 0],
        [0.215, 0.075, 1.58],
        i % 5 ? "wood" : "oak"
      );
      plank.rotation.z = a + Math.PI / 2;
    }
  } else {
    for (const z of [-1.25, 1.25]) {
      shaft(k, "crank-axle-collar", [x, y, z], 0.18, 0.09, true);
      k.beam("winch-crank-arm", [x, y, z], [x, y + 0.52, z], 0.085, "iron");
      shaft(k, "free-turning-crank-grip", [x, y + 0.52, z + Math.sign(z) * 0.14], 0.065, 0.28);
    }
  }
  const ratchetZ = treadwheel ? -0.94 : -0.72;
  shaft(k, "ratchet-disc", [x, y, ratchetZ], 0.34, 0.065, true);
  for (let i = 0; i < 20; i++) {
    const a = (i * Math.PI) / 10;
    const tooth = k.box(
      "ratchet-tooth",
      [x + Math.cos(a) * 0.355, y + Math.sin(a) * 0.355, ratchetZ],
      [0.09, 0.07, 0.08],
      "iron"
    );
    tooth.rotation.z = a;
  }
  k.beam("ratchet-pawl", [x - 0.42, y + 0.42, ratchetZ], [x - 0.08, y + 0.34, ratchetZ], 0.07, "iron");
  k.beam("pawl-support-bracket", [x, y + 0.18, ratchetZ], [x - 0.42, y + 0.42, ratchetZ], 0.1, "oak");
  shaft(k, "pawl-pivot", [x - 0.42, y + 0.42, ratchetZ], 0.055, 0.16, true);
  return k.finish();
}

function tackle(treadwheel: boolean, d: HarborCraneDimensions) {
  const k = new ModelKit("harbor-crane-tackle-high");
  const x = treadwheel ? -1.8 : -1.6,
    y = treadwheel ? 2.8 : 1.6;
  // Wind outside the treadwheel: the rising rope must not pass through its treads.
  const mastTop = d.pulleyHeight + 0.65;
  const guide = new THREE.Vector3(0, mastTop, treadwheel ? 1.65 : 0.4);
  const phase = Math.atan2(guide.y - y, guide.x - x) - Math.acos(0.275 / Math.hypot(guide.x - x, guide.y - y));
  const winding: Position[] = Array.from({ length: 241 }, (_, i) => {
    const a = phase + (i / 240 - 1) * Math.PI * 16;
    const z = treadwheel ? 1.25 + (i / 240) * 0.4 : -0.4 + (i / 240) * 0.8;
    return [x + Math.cos(a) * 0.275, y + Math.sin(a) * 0.275, z];
  });
  k.add(
    "wound-drum-rope",
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(winding.map(p => new THREE.Vector3(...p))), 240, 0.018, 6, false),
    "cloth"
  );
  k.beam("fairlead-outrigger", [0, mastTop - 0.15, 0], [0, mastTop - 0.15, guide.z], 0.14, "oak");
  k.beam("fairlead-outrigger-knee", [0, mastTop - 1, 0], [0, mastTop - 0.15, guide.z], 0.1, "oak");
  // The final falling line stays exactly at (reach, 0); finite sheaves sit behind it.
  const radius = 0.22,
    cy = d.pulleyHeight;
  const h = new THREE.Vector3(d.reach, 0, -guide.z).normalize();
  const normal = new THREE.Vector3(-h.z, 0, h.x);
  const center = new THREE.Vector3(d.reach, cy, 0).addScaledVector(h, -radius);
  const incoming = guide.clone().sub(center);
  const tangentAngle = Math.atan2(incoming.y, incoming.dot(h)) - Math.acos(radius / incoming.length());
  const circlePoint = (angle: number) =>
    center
      .clone()
      .addScaledVector(h, Math.cos(angle) * radius)
      .add(new THREE.Vector3(0, Math.sin(angle) * radius, 0));
  const tangent = circlePoint(tangentAngle);
  for (const sign of [-1, 1]) {
    const c = center.clone().addScaledVector(normal, sign * 0.11);
    const mesh = k.ring("head-sheave-flange", c.toArray() as [number, number, number], radius, 0.035, "iron", true);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const cheek = center.clone().addScaledVector(normal, sign * 0.19);
    k.beam("head-block-cheek", [cheek.x, cheek.y - 0.29, cheek.z], [cheek.x, cheek.y + 0.29, cheek.z], 0.09, "oak");
  }
  const sheave = k.cylinder(
    "grooved-head-sheave",
    center.toArray() as [number, number, number],
    0.19,
    0.16,
    "wood",
    0.19,
    48
  );
  sheave.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  k.beam(
    "head-sheave-axle",
    center.clone().addScaledVector(normal, -0.28).toArray() as [number, number, number],
    center.clone().addScaledVector(normal, 0.28).toArray() as [number, number, number],
    0.12,
    "iron",
    true
  );
  // Round the mast guide turn, with a sheave coplanar to the incoming and outgoing rope.
  const start = new THREE.Vector3(...winding.at(-1)!);
  const u = guide.clone().sub(start).normalize(),
    v = tangent.clone().sub(guide).normalize();
  const guideNormal = new THREE.Vector3().crossVectors(u, v).normalize();
  const turn = Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1));
  const trim = 0.12 * Math.tan(turn / 2);
  const entry = guide.clone().addScaledVector(u, -trim),
    exit = guide.clone().addScaledVector(v, trim);
  const guideCenter = entry.clone().addScaledVector(new THREE.Vector3().crossVectors(guideNormal, u), 0.12);
  const roller = k.ring(
    "mast-fairlead-sheave",
    guideCenter.toArray() as [number, number, number],
    0.12,
    0.025,
    "iron",
    true
  );
  roller.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), guideNormal);
  k.beam(
    "fairlead-guide-axle",
    guideCenter.clone().addScaledVector(guideNormal, -0.16).toArray() as [number, number, number],
    guideCenter.clone().addScaledVector(guideNormal, 0.16).toArray() as [number, number, number],
    0.05,
    "iron",
    true
  );
  const radial = entry.clone().sub(guideCenter);
  const guideArc: Position[] = Array.from(
    { length: 13 },
    (_, i) =>
      guideCenter
        .clone()
        .add(radial.clone().applyAxisAngle(guideNormal, (turn * i) / 12))
        .toArray() as [number, number, number]
  );
  k.beam(
    "drum-to-fairlead-rope",
    start.toArray() as [number, number, number],
    entry.toArray() as [number, number, number],
    0.032,
    "cloth",
    true
  );
  k.tube("rope-around-mast-fairlead", guideArc, 0.016, "cloth");
  k.beam(
    "fairlead-to-head-rope",
    exit.toArray() as [number, number, number],
    tangent.toArray() as [number, number, number],
    0.032,
    "cloth",
    true
  );
  const bend: Position[] = Array.from(
    { length: 17 },
    (_, i) => circlePoint(tangentAngle * (1 - i / 16)).toArray() as [number, number, number]
  );
  k.tube("rope-around-head-sheave", bend, 0.016, "cloth");
  k.beam("vertical-hoist-rope", [d.reach, cy, 0], [d.reach, d.hookHeight, 0], 0.032, "cloth", true);
  k.ring("hook-swivel-eye", [d.reach, d.hookHeight - 0.04, 0], 0.08, 0.023, "iron", true);
  k.tube(
    "forged-cargo-hook",
    [
      [d.reach, d.hookHeight - 0.1, 0],
      [d.reach, d.hookHeight - 0.23, 0],
      [d.reach - 0.15, d.hookHeight - 0.36, 0],
      [d.reach - 0.27, d.hookHeight - 0.26, 0],
      [d.reach - 0.24, d.hookHeight - 0.18, 0]
    ],
    0.032,
    "iron"
  );
  return k.finish();
}

export function harborCranePartFactories(treadwheel: boolean, input?: HarborCraneDimensions): ModelPartFactory[] {
  const d = checkedHarborCraneDimensions(input),
    prefix = treadwheel ? "treadwheel-crane" : "winch-crane";
  const part = (role: string, create: ModelPartFactory["create"]): ModelPartFactory => ({
    id: `${prefix}:${role}`,
    role,
    quality: "high",
    author: DEFAULT_AUTHOR,
    create
  });
  return [
    part("foundation", foundation),
    part("frame", () => frame(d)),
    part("drive", () => drive(treadwheel)),
    part("tackle", () => tackle(treadwheel, d)),
    ...(d.showCargo
      ? [
          {
            ...part("cargo", () => {
              const k = new ModelKit("harbor-crane-cargo");
              k.attach(createMedievalContainerModel("crate", "closed"), [d.reach - 0.05, 0, 0]);
              return k.finish();
            }),
            quality: "low" as const,
            basedOn: ["container.crate-closed@default#codex-gpt-6.1-sol"]
          }
        ]
      : [])
  ];
}

export const assembleHarborCraneParts = (name: string, parts: readonly ModelPartFactory[]) =>
  compactModel(createModelAssembly(name, parts), { mergeEquivalentMaterials: true });

export const createHighHarborCrane = (treadwheel: boolean, input?: HarborCraneDimensions) =>
  assembleHarborCraneParts(
    treadwheel ? "treadwheel-crane-high" : "hand-winch-crane-high",
    harborCranePartFactories(treadwheel, input)
  );
