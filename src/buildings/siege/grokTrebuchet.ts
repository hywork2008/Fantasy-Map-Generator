import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { compactModel } from "../compactModel";
import { ModelKit, type Position, type Surface } from "../medieval/modelKit";
import { createTimberLadder } from "../medieval/timberLadder";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";

/**
 * Hinged-counterweight trebuchet in the cocked loading pose, in meters.
 * The short arm is up, so the stone-filled chest hangs clear of the sled, and the
 * sling lies in the trough. Proportions match the Codex study of the same engine.
 * The arm is a hewn spar: thick at the axle, tapered to the tip. No firing motion.
 */
export const GROK_TREBUCHET = {
  author: "Grok 4.7" as Author,
  name: "Trebuchet",
  length: 17,
  width: 6,
  height: 10,
  pivotHeight: 7.4,
  longArm: 9,
  shortArm: 2.5,
  armAngle: -Math.PI / 6,
  note: "Hinged-counterweight trebuchet, cocked for loading. Iron-shod oak sledges, braced A-frames, a hewn throwing arm bound with iron hoops, a planked ballast chest hung from the short-arm hinge, a leather sling in the launching trough, and a ratcheted twin-wheel windlass holding the arm down. Illustrative 13th-century engine; static model, without a firing simulation."
} as const;

const PIVOT_Y = GROK_TREBUCHET.pivotHeight;
const LONG = GROK_TREBUCHET.longArm;
const SHORT = GROK_TREBUCHET.shortArm;
const ANGLE = GROK_TREBUCHET.armAngle;
const AXIS = new THREE.Vector3(Math.cos(ANGLE), Math.sin(ANGLE), 0);
const RIGHT = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3().crossVectors(RIGHT, AXIS).normalize();
const ARM = { right: RIGHT, up: UP };
const SILL_Z = 1.78;
const WINCH_X = 2.05;
const WINCH_Y = 1.66;
const WHEEL_Z = 2.18;
const POUCH_X = 11.02;
const BED_TOP = 0.59;

const TINT: Partial<Record<Surface, number>> = {
  oak: 0x6b4428,
  wood: 0xb68848,
  dark: 0x342418,
  iron: 0x3a4144,
  stone: 0x918c81,
  leather: 0x623422,
  cloth: 0xc4b08a
};

type Section = { w: number; h: number };
type Frame = { right: THREE.Vector3; up: THREE.Vector3 };

function point(distance: number) {
  return new THREE.Vector3(0, PIVOT_Y, 0).addScaledVector(AXIS, distance);
}

function section(distance: number): Section {
  const d = THREE.MathUtils.clamp(distance, -SHORT, LONG);
  if (d <= 0) {
    const t = (d + SHORT) / SHORT;
    return { w: THREE.MathUtils.lerp(0.32, 0.5, t), h: THREE.MathUtils.lerp(0.4, 0.58, t) };
  }
  const t = d / LONG;
  const ease = t ** 1.15;
  return { w: THREE.MathUtils.lerp(0.5, 0.18, ease), h: THREE.MathUtils.lerp(0.58, 0.22, ease) };
}

function kit(name: string) {
  return new ModelKit(name, TINT);
}

function pushOutward(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  interior: THREE.Vector3
) {
  const normal = b.clone().sub(a).cross(c.clone().sub(a));
  const mid = a
    .clone()
    .add(b)
    .add(c)
    .multiplyScalar(1 / 3);
  const [p, q, r] = normal.dot(mid.sub(interior)) < 0 ? [a, c, b] : [a, b, c];
  positions.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
}

/** Hewn prism. `w` is along frame.right (or the beam's lateral axis); `h` is along frame.up. */
function spar(
  k: ModelKit,
  name: string,
  stations: readonly { at: THREE.Vector3; w: number; h: number }[],
  surface: Surface,
  sides = 6,
  frame?: Frame
) {
  const axis = stations[stations.length - 1].at.clone().sub(stations[0].at);
  axis.normalize();
  let right: THREE.Vector3;
  let up: THREE.Vector3;
  if (frame) {
    right = frame.right;
    up = frame.up;
  } else {
    const ref = Math.abs(axis.y) > 0.92 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    right = new THREE.Vector3().crossVectors(axis, ref).normalize();
    up = new THREE.Vector3().crossVectors(right, axis).normalize();
  }
  const rings = stations.map(({ at, w, h }) => {
    const ring: THREE.Vector3[] = [];
    for (let s = 0; s < sides; s++) {
      const ang = (s / sides) * Math.PI * 2 + Math.PI / sides;
      ring.push(
        at
          .clone()
          .addScaledVector(right, Math.cos(ang) * w * 0.5)
          .addScaledVector(up, Math.sin(ang) * h * 0.5)
      );
    }
    return ring;
  });
  const positions: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const n = (s + 1) % sides;
      const a0 = rings[i][s];
      const a1 = rings[i][n];
      const b0 = rings[i + 1][s];
      const b1 = rings[i + 1][n];
      const interior = stations[i].at.clone().lerp(stations[i + 1].at, 0.5);
      pushOutward(positions, a0, b0, a1, interior);
      pushOutward(positions, a1, b0, b1, interior);
    }
  }
  const cap = (ring: THREE.Vector3[], interior: THREE.Vector3) => {
    const c = ring.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / ring.length);
    for (let s = 0; s < sides; s++) pushOutward(positions, c, ring[s], ring[(s + 1) % sides], interior);
  };
  cap(rings[0], stations[1].at);
  cap(rings[rings.length - 1], stations[stations.length - 2].at);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return k.add(name, geometry, surface);
}

function beam(
  k: ModelKit,
  name: string,
  a: THREE.Vector3,
  b: THREE.Vector3,
  w: number,
  h: number,
  surface: Surface = "oak",
  sides = 6
) {
  return spar(
    k,
    name,
    [
      { at: a, w, h },
      { at: b, w, h }
    ],
    surface,
    sides
  );
}

function alongZ(mesh: THREE.Object3D) {
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function bolt(k: ModelKit, name: string, at: THREE.Vector3, dir: THREE.Vector3, length: number, radius = 0.028) {
  const unit = dir.clone().normalize();
  const shaft = k.cylinder(name, [at.x, at.y, at.z], radius, length, "iron", radius, 8);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unit);
  const head = k.cylinder(name, [at.x, at.y, at.z], radius * 1.85, 0.035, "iron", radius * 1.85, 8);
  head.quaternion.copy(shaft.quaternion);
  head.position.addScaledVector(unit, length * 0.5);
  return shaft;
}

function sag(a: THREE.Vector3, b: THREE.Vector3, drop: number, n = 8): Position[] {
  const points: Position[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    points.push([
      THREE.MathUtils.lerp(a.x, b.x, t),
      THREE.MathUtils.lerp(a.y, b.y, t) - Math.sin(Math.PI * t) * drop,
      THREE.MathUtils.lerp(a.z, b.z, t)
    ]);
  }
  return points;
}

function chassis() {
  const k = kit("trebuchet-chassis");
  for (const z of [-SILL_Z, SILL_Z]) {
    k.box("ground-sill", [-0.15, 0.28, z], [8.8, 0.4, 0.42], "dark");
    k.box("sill-iron-shoe", [-0.15, 0.04, z], [8.7, 0.08, 0.48], "iron");
    for (const x of [-4.45, 4.15]) k.box("sill-end-cap", [x, 0.28, z], [0.1, 0.44, 0.5], "iron");
    for (const x of [-3.7, 3.25]) {
      k.box("foot-strap", [x, 0.52, z], [0.62, 0.06, 0.5], "iron");
      for (const dx of [-0.2, 0.2])
        bolt(k, "foot-bolt", new THREE.Vector3(x + dx, 0.56, z), new THREE.Vector3(0, 1, 0), 0.16);
    }
  }
  // Transoms stay outside the bay the raised chest swings through.
  for (const x of [-4.2, 3.7]) {
    k.box("base-transom", [x, 0.32, 0], [0.34, 0.28, 3.95], "oak");
    k.box("transom-strap", [x, 0.48, 0], [0.4, 0.045, 4.05], "iron");
    for (const z of [-1.5, 1.5])
      bolt(k, "transom-bolt", new THREE.Vector3(x, 0.52, z), new THREE.Vector3(0, 1, 0), 0.14);
  }
  beam(
    k,
    "rear-sway-brace",
    new THREE.Vector3(-4.15, 0.36, -1.45),
    new THREE.Vector3(-3.55, 0.36, 1.45),
    0.16,
    0.16,
    "oak"
  );
  beam(
    k,
    "fore-sway-brace",
    new THREE.Vector3(3.45, 0.36, -1.45),
    new THREE.Vector3(4.05, 0.36, 1.45),
    0.16,
    0.16,
    "oak"
  );
  for (const z of [-2.72, 2.72]) {
    k.box("outrigger-sill", [0.15, 0.16, z], [8.2, 0.26, 0.28], "dark");
    k.box("outrigger-shoe", [0.15, 0.035, z], [8.05, 0.07, 0.34], "iron");
  }
  for (const x of [-3.7, 3.9])
    for (const z of [-2.72, -SILL_Z, SILL_Z, 2.72])
      k.cylinder("ground-stake", [x, 0.32, z], 0.04, 0.64, "iron", 0.04, 8);
  for (let i = 0; i < 7; i++)
    k.box("winch-deck-board", [1.05 + i * 0.36, 0.52, 0], [0.32, 0.06, 2.9], i % 2 ? "wood" : "oak");
  return k.finish();
}

function frames() {
  const k = kit("trebuchet-frames");
  for (const z of [-SILL_Z, SILL_Z]) {
    const rear = new THREE.Vector3(-3.7, 0.55, z);
    const fore = new THREE.Vector3(3.25, 0.55, z);
    const crown = new THREE.Vector3(0, 7.16, z);
    beam(k, "frame-leg", rear, crown, 0.3, 0.4, "oak");
    beam(k, "frame-leg", fore, crown, 0.3, 0.4, "oak");
    beam(k, "frame-tie", new THREE.Vector3(-2.35, 2.2, z), new THREE.Vector3(2.45, 2.2, z), 0.22, 0.26, "oak");
    beam(k, "frame-brace", new THREE.Vector3(-3.15, 0.7, z), new THREE.Vector3(-0.35, 4.7, z), 0.16, 0.2, "wood");
    beam(k, "frame-brace", new THREE.Vector3(2.7, 0.7, z), new THREE.Vector3(0.4, 4.55, z), 0.16, 0.2, "wood");
    k.box("bearing-block", [0, PIVOT_Y, z], [0.74, 0.66, 0.62], "dark");
    k.box("bearing-cap", [0, PIVOT_Y + 0.38, z], [0.82, 0.07, 0.7], "iron");
    for (const x of [-0.24, 0.24])
      bolt(k, "bearing-bolt", new THREE.Vector3(x, PIVOT_Y + 0.44, z), new THREE.Vector3(0, 1, 0), 0.18);
    k.box("bearing-cheek", [0, PIVOT_Y, z + Math.sign(z) * 0.34], [0.5, 0.5, 0.06], "iron");
  }
  for (const side of [-1, 1]) {
    const z = side * 2.72;
    beam(
      k,
      "outrigger-brace",
      new THREE.Vector3(-3.15, 0.4, z),
      new THREE.Vector3(-0.15, 6.15, side * SILL_Z),
      0.2,
      0.24,
      "oak"
    );
    beam(
      k,
      "outrigger-brace",
      new THREE.Vector3(3.9, 0.4, z),
      new THREE.Vector3(0.15, 6.25, side * (SILL_Z + 0.08)),
      0.2,
      0.24,
      "oak"
    );
    beam(
      k,
      "outrigger-strut",
      new THREE.Vector3(side * 0.15, 0.36, z),
      new THREE.Vector3(side * 0.15, 0.36, side * SILL_Z),
      0.16,
      0.16,
      "wood"
    );
  }
  // Crew ladder in the side bay, clear of the chest and of both sills.
  k.attach(
    createTimberLadder({ foot: [-3.05, 0.2, -1.28], head: [-0.45, 5.85, -1.28], width: 0.46, rungs: 11 }),
    [0, 0, 0]
  );
  return k.finish();
}

function throwingArm() {
  const k = kit("trebuchet-arm");
  const samples = [-SHORT - 0.18, -SHORT, -1.2, 0, 1.5, 3.3, 5.5, 7.5, LONG];
  spar(
    k,
    "throwing-arm",
    samples.map(distance => ({ at: point(distance), ...section(distance) })),
    "wood",
    12,
    ARM
  );
  for (const distance of [-1.85, -0.85, 1.15, 2.7, 4.3, 6.0, 7.7]) {
    const size = section(distance);
    const center = point(distance);
    spar(
      k,
      "arm-hoop",
      [
        { at: center.clone().addScaledVector(AXIS, -0.04), w: size.w + 0.06, h: size.h + 0.06 },
        { at: center.clone().addScaledVector(AXIS, 0.04), w: size.w + 0.06, h: size.h + 0.06 }
      ],
      "iron",
      12,
      ARM
    );
  }
  const pivot = point(0);
  for (const side of [-1, 1]) {
    alongZ(k.cylinder("axle-cheek", [pivot.x, pivot.y, side * 0.275], 0.38, 0.04, "iron", 0.38, 16));
  }
  alongZ(k.cylinder("main-axle", [0, PIVOT_Y, 0], 0.09, 4.3, "iron", 0.09, 16));
  for (const z of [-2.08, 2.08]) alongZ(k.cylinder("axle-collar", [0, PIVOT_Y, z], 0.15, 0.06, "iron", 0.15, 12));
  const tip = point(LONG);
  const fingerEnd = tip.clone().addScaledVector(AXIS, 0.18).addScaledVector(UP, 0.42);
  beam(k, "release-finger", tip.clone().addScaledVector(AXIS, 0.02), fingerEnd, 0.07, 0.08, "iron", 8);
  const ring = k.add("release-ring", new THREE.TorusGeometry(0.07, 0.016, 6, 14), "iron");
  ring.position.copy(tip).addScaledVector(RIGHT, 0.16);
  ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), AXIS);
  const fixed = k.add("retained-ring", new THREE.TorusGeometry(0.06, 0.015, 6, 14), "iron");
  fixed.position.copy(tip).addScaledVector(RIGHT, -0.14);
  fixed.quaternion.copy(ring.quaternion);
  const hookAt = point(6.05).addScaledVector(UP, -section(6.05).h * 0.5 - 0.04);
  const hook = k.add("draw-hook", new THREE.TorusGeometry(0.07, 0.016, 6, 12), "iron");
  hook.position.copy(hookAt);
  hook.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), RIGHT);
  return k.finish();
}

function counterweight() {
  const k = kit("trebuchet-counterweight");
  const heel = point(-SHORT);
  const cx = heel.x;
  const rim = heel.y - 1.5;
  const floor = rim - 1.56;
  const cy = (rim + floor) / 2;
  const sx = 1.66;
  const sz = 1.3;
  const sy = rim - floor;
  for (const x of [-1, 1])
    for (const z of [-1, 1])
      k.box("ballast-post", [cx + x * (sx / 2 - 0.06), cy, z * (sz / 2 - 0.06)], [0.12, sy, 0.12], "dark");
  // The liner stops below the rim so the stone pile is visible through the open top.
  const linerTop = rim - 0.58;
  k.box(
    "ballast-liner",
    [cx, (floor + 0.14 + linerTop) / 2, 0],
    [sx - 0.28, linerTop - floor - 0.14, sz - 0.28],
    "dark"
  );
  const plank = (name: string, at: Position, size: Position, surface: Surface) => k.box(name, at, size, surface);
  for (const side of [-1, 1]) {
    const z = side * (sz / 2 + 0.01);
    for (let i = 0; i < 6; i++) {
      const width = 0.22;
      plank(
        "ballast-plank",
        [cx - sx / 2 + 0.2 + width / 2 + i * 0.23, cy, z],
        [width, sy - 0.18, 0.04],
        i % 3 ? "wood" : "oak"
      );
    }
    const x = cx + side * (sx / 2 + 0.01);
    for (let i = 0; i < 5; i++) {
      const width = 0.2;
      plank(
        "ballast-plank",
        [x, cy, -sz / 2 + 0.2 + width / 2 + i * 0.21],
        [0.04, sy - 0.18, width],
        i % 2 ? "oak" : "wood"
      );
    }
  }
  for (let i = 0; i < 6; i++)
    plank("ballast-floor", [cx - 0.55 + i * 0.22, floor + 0.06, 0], [0.2, 0.08, sz - 0.28], i % 2 ? "oak" : "wood");
  for (const y of [floor + 0.38, cy, rim - 0.22]) {
    k.box("ballast-band", [cx, y, sz / 2 + 0.045], [sx + 0.04, 0.07, 0.03], "iron");
    k.box("ballast-band", [cx, y, -sz / 2 - 0.045], [sx + 0.04, 0.07, 0.03], "iron");
    k.box("ballast-band", [cx + sx / 2 + 0.045, y, 0], [0.03, 0.07, sz + 0.04], "iron");
    k.box("ballast-band", [cx - sx / 2 - 0.045, y, 0], [0.03, 0.07, sz + 0.04], "iron");
  }
  for (const x of [-1, 1])
    for (const z of [-1, 1])
      k.box("ballast-band", [cx + x * (sx / 2 + 0.03), cy, z * (sz / 2 + 0.03)], [0.045, sy + 0.04, 0.045], "iron");
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const stones: readonly [number, number, number, number][] = [
    [-0.36, 0.16, -0.16, 0.22],
    [0.02, 0.14, -0.2, 0.2],
    [0.34, 0.18, -0.08, 0.24],
    [-0.28, 0.18, 0.18, 0.22],
    [0.22, 0.16, 0.16, 0.2],
    [-0.12, 0.42, -0.06, 0.24],
    [0.24, 0.46, 0.04, 0.26],
    [-0.32, 0.48, 0.02, 0.2],
    [0.06, 0.72, 0, 0.24],
    [-0.16, 0.7, 0.1, 0.2],
    [0.2, 0.78, -0.08, 0.18]
  ];
  for (const [x, y, z, scale] of stones) {
    const stone = k.add("ballast-stone", rock, "stone");
    stone.position.set(cx + x, linerTop + y, z);
    stone.scale.setScalar(scale);
    stone.rotation.set(x * 3, y * 2, z * 4);
  }
  for (const x of [-0.28, 0.22]) k.box("ballast-pig", [cx + x, floor + 0.2, 0], [0.34, 0.12, 0.16], "dark");
  alongZ(k.cylinder("counterweight-hinge", [cx, heel.y, 0], 0.07, 1.55, "iron", 0.07, 16));
  alongZ(k.cylinder("chest-pin", [cx, rim - 0.06, 0], 0.05, 1.22, "iron", 0.05, 12));
  k.box("hinge-yoke", [cx, heel.y - 0.16, 0], [0.34, 0.28, 0.86], "dark");
  const hangerTop = heel.y + 0.04;
  const hangerBottom = rim - 0.28;
  const hangerY = (hangerTop + hangerBottom) / 2;
  const hangerH = hangerTop - hangerBottom;
  for (const z of [-0.52, 0.52]) {
    k.box("counterweight-hanger", [cx, hangerY, z], [0.11, hangerH, 0.04], "iron");
    k.box("counterweight-hanger", [cx + 0.08, hangerY, z], [0.04, hangerH - 0.08, 0.09], "iron");
    alongZ(k.cylinder("hinge-bush", [cx, heel.y, Math.sign(z) * 0.28], 0.09, 0.1, "dark", 0.09, 10));
  }
  for (const x of [-1, 1]) {
    const eye = k.add("lifting-eye", new THREE.TorusGeometry(0.07, 0.014, 5, 12), "iron");
    eye.position.set(cx + x * (sx / 2 + 0.02), rim + 0.02, 0);
    eye.rotation.y = Math.PI / 2;
  }
  return k.finish();
}

function slingAndTrough() {
  const k = kit("trebuchet-sling");
  const x0 = 4.15;
  const x1 = 12.06;
  const mid = (x0 + x1) / 2;
  const length = x1 - x0;
  k.box("loading-trough", [mid, 0.46, 0], [length, 0.1, 0.86], "wood");
  for (const z of [-0.5, 0.5]) k.box("trough-rail", [mid, 0.66, z], [length, 0.32, 0.08], "dark");
  for (const x of [4.7, 6.8, 9.05, 11.15]) {
    k.box("trough-support", [x, 0.22, 0], [0.16, 0.44, 0.78], "oak");
    k.box("trough-ledger", [x, 0.4, 0], [0.12, 0.08, 0.96], "wood");
  }
  const boards = 16;
  const boardW = 0.36;
  const gap = (length - 0.36 - boards * boardW) / (boards - 1);
  for (let i = 0; i < boards; i++)
    k.box(
      "trough-board",
      [x0 + 0.18 + boardW / 2 + i * (boardW + gap), 0.545, 0],
      [boardW, 0.09, 0.72],
      i % 4 ? "wood" : "oak"
    );
  const profile = [
    [0.02, 0],
    [0.26, 0.04],
    [0.4, 0.12],
    [0.36, 0.2],
    [0.46, 0.26],
    [0.46, 0.31],
    [0.36, 0.31]
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const pouch = k.add("sling-pouch", new THREE.LatheGeometry(profile, 22), "leather");
  pouch.position.set(POUCH_X, BED_TOP - 0.02, 0);
  const tip = point(LONG);
  const rim = new THREE.Vector3(POUCH_X, BED_TOP + 0.24, 0);
  k.tube(
    "retained-sling-cord",
    sag(tip.clone().addScaledVector(RIGHT, -0.12), rim.clone().setZ(-0.2), 0.08),
    0.016,
    "cloth"
  );
  k.tube(
    "release-sling-cord",
    sag(tip.clone().addScaledVector(AXIS, 0.08).addScaledVector(UP, 0.12), rim.clone().setZ(0.2), 0.1),
    0.016,
    "cloth"
  );
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const shot = k.add("projectile", rock, "stone");
  shot.position.set(POUCH_X, 0.96, 0);
  shot.scale.setScalar(0.36);
  shot.rotation.set(0.4, 0.8, 0.2);
  // y equals the radius so a vertex cannot break the ground; the top stone sits in the pile.
  const pile: readonly [number, number, number, number][] = [
    [8.55, 0.2, 1.02, 0.2],
    [8.95, 0.18, 1.24, 0.18],
    [9.2, 0.17, 1.06, 0.17],
    [8.78, 0.42, 1.12, 0.16]
  ];
  for (const [x, y, z, scale] of pile) {
    const stone = k.add("spare-shot", rock, "stone");
    stone.position.set(x, y, z);
    stone.scale.setScalar(scale);
    stone.rotation.set(x, z, y);
  }
  return k.finish();
}

function windlass() {
  const k = kit("trebuchet-windlass");
  for (const z of [-1.42, 1.42]) {
    k.box("winch-upright", [WINCH_X, 1.05, z], [0.28, 1.15, 0.28], "oak");
    k.box("winch-cap", [WINCH_X, WINCH_Y + 0.2, z], [0.46, 0.08, 0.4], "iron");
    k.box("winch-bearing", [WINCH_X, WINCH_Y, z], [0.36, 0.28, 0.34], "dark");
    for (const x of [-0.14, 0.14])
      bolt(k, "winch-bolt", new THREE.Vector3(WINCH_X + x, WINCH_Y + 0.26, z), new THREE.Vector3(0, 1, 0), 0.14);
    beam(
      k,
      "winch-knee",
      new THREE.Vector3(WINCH_X - 0.7, 0.6, z),
      new THREE.Vector3(WINCH_X, WINCH_Y - 0.25, z),
      0.14,
      0.16,
      "oak"
    );
  }
  alongZ(k.cylinder("winch-axle", [WINCH_X, WINCH_Y, 0], 0.07, 4.7, "dark", 0.07, 12));
  alongZ(k.cylinder("winch-drum", [WINCH_X, WINCH_Y, 0], 0.2, 1.05, "oak", 0.2, 16));
  for (const z of [-0.54, 0.54]) alongZ(k.cylinder("drum-flange", [WINCH_X, WINCH_Y, z], 0.28, 0.06, "dark", 0.28, 16));
  for (let i = 0; i < 11; i++) {
    const coil = k.add("winch-rope-coil", new THREE.TorusGeometry(0.228, 0.015, 5, 14), "cloth");
    coil.position.set(WINCH_X, WINCH_Y, -0.3 + i * 0.055);
  }
  const ratchetZ = 0.82;
  alongZ(k.cylinder("ratchet-disc", [WINCH_X, WINCH_Y, ratchetZ], 0.26, 0.05, "iron", 0.26, 16));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const tooth = k.box(
      "ratchet-tooth",
      [WINCH_X + Math.cos(a) * 0.3, WINCH_Y + Math.sin(a) * 0.3, ratchetZ],
      [0.09, 0.055, 0.06],
      "iron"
    );
    tooth.rotation.z = a;
  }
  beam(
    k,
    "ratchet-pawl",
    new THREE.Vector3(WINCH_X - 0.46, WINCH_Y + 0.4, ratchetZ),
    new THREE.Vector3(WINCH_X - 0.06, WINCH_Y + 0.28, ratchetZ),
    0.06,
    0.08,
    "iron",
    6
  );
  k.box("pawl-bracket", [WINCH_X - 0.46, WINCH_Y + 0.28, (ratchetZ + 1.42) / 2], [0.12, 0.28, 1.42 - ratchetZ], "oak");
  bolt(k, "pawl-pivot", new THREE.Vector3(WINCH_X - 0.46, WINCH_Y + 0.4, ratchetZ), RIGHT, 0.16, 0.03);
  for (const side of [-1, 1]) {
    const z = side * WHEEL_Z;
    const rim = k.add("winding-wheel", new THREE.TorusGeometry(0.9, 0.055, 8, 28), "oak");
    rim.position.set(WINCH_X, WINCH_Y, z);
    const tyre = k.add("wheel-tyre", new THREE.TorusGeometry(0.95, 0.02, 6, 28), "iron");
    tyre.position.set(WINCH_X, WINCH_Y, z);
    alongZ(k.cylinder("wheel-hub", [WINCH_X, WINCH_Y, z], 0.14, 0.16, "dark", 0.14, 12));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      beam(
        k,
        "wheel-spoke",
        new THREE.Vector3(WINCH_X + Math.cos(a) * 0.16, WINCH_Y + Math.sin(a) * 0.16, z),
        new THREE.Vector3(WINCH_X + Math.cos(a) * 0.86, WINCH_Y + Math.sin(a) * 0.86, z),
        0.07,
        0.09,
        "wood"
      );
      if (i % 2 === 0) {
        alongZ(
          k.cylinder(
            "wheel-handle",
            [WINCH_X + Math.cos(a) * 0.62, WINCH_Y + Math.sin(a) * 0.62, z + side * 0.16],
            0.04,
            0.28,
            "wood",
            0.04,
            8
          )
        );
      }
    }
  }
  const hook = point(6.05).addScaledVector(UP, -section(6.05).h * 0.5 - 0.04);
  k.tube("draw-down-rope", sag(new THREE.Vector3(WINCH_X, WINCH_Y + 0.24, 0.05), hook, 0.16, 10), 0.02, "cloth");
  return k.finish();
}

export function grokTrebuchetParts(): ModelPartFactory[] {
  const part = (role: string, create: ModelPartFactory["create"]): ModelPartFactory => ({
    id: `trebuchet-hinged:${role}`,
    role,
    quality: "high",
    author: GROK_TREBUCHET.author,
    create
  });
  return [
    part("chassis", chassis),
    part("frames", frames),
    part("throwing arm", throwingArm),
    part("counterweight", counterweight),
    part("sling and trough", slingAndTrough),
    part("windlass", windlass)
  ];
}

export function assembleGrokTrebuchet(parts: readonly ModelPartFactory[]): CityStructureMeshes {
  return compactModel(createModelAssembly("grok-trebuchet", parts), { mergeEquivalentMaterials: true });
}

export function createGrokTrebuchet(): CityStructureMeshes {
  return assembleGrokTrebuchet(grokTrebuchetParts());
}
