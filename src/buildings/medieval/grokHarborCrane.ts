import * as THREE from "three";
import type { Author } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { createMedievalContainerModel } from "../props/medievalContainers";
import { checkedHarborCraneDimensions, type HarborCraneDimensions } from "./harborCraneDimensions";
import { ModelKit, type Position, type Surface } from "./modelKit";

/**
 * Late medieval timber quay crane: a stone race, a rotating post-and-plank house,
 * an interior treadwheel on the same axle as the winding drum, and a hewn jib.
 * The falling rope is the construction contract — its centre line is exactly
 * (reach, z = 0) from pulleyHeight down to hookHeight. The wheel is human-scaled
 * and does not grow with the jib. Illustrative, not a measured reconstruction.
 */
export const GROK_HARBOR_CRANE = {
  author: "Grok 4.7" as Author,
  name: "Timber harbor treadwheel crane"
} as const;

const TINT: Partial<Record<Surface, number>> = {
  oak: 0x6b4428,
  wood: 0xc4a06a,
  dark: 0x2c2118,
  iron: 0x3a4246,
  stone: 0x8e887c,
  cloth: 0xc6a56a
};

/** Fixed treadmill. Official profiles keep the house roof above this wheel. */
const WHEEL_X = -1.98;
const WHEEL_Y = 2.64;
const RIM_R = 1.36;
const RIM_TUBE = 0.048;
const TREAD_R = 1.24;
const TREAD_HALF_Z = 0.8;
const CHEEK_Z = 0.88;
const DRUM_Z0 = 1.18;
const DRUM_Z1 = 1.5;
const DRUM_R = 0.24;
const HOUSE_REAR = -3.58;
const HOUSE_FRONT = -0.42;
const HOUSE_Z = 1.68;
const POST = 0.15;

const _TREAD_MAX_Z = TREAD_HALF_Z;
const WHEEL_TOP = WHEEL_Y + RIM_R + RIM_TUBE;

type Frame = { right: THREE.Vector3; up: THREE.Vector3 };

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

/** Hewn prism. `w` is across frame.right and `h` is across frame.up. */
function spar(
  k: ModelKit,
  name: string,
  stations: readonly { at: THREE.Vector3; w: number; h: number }[],
  surface: Surface,
  sides = 6,
  frame?: Frame
) {
  const axis = stations[stations.length - 1].at.clone().sub(stations[0].at).normalize();
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

function member(
  k: ModelKit,
  name: string,
  a: THREE.Vector3,
  b: THREE.Vector3,
  w: number,
  h: number,
  surface: Surface = "oak",
  frame?: Frame
) {
  return spar(
    k,
    name,
    [
      { at: a, w, h },
      { at: b, w, h }
    ],
    surface,
    6,
    frame
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
  const head = k.cylinder(name, [at.x, at.y, at.z], radius * 1.7, 0.03, "iron", radius * 1.7, 8);
  head.quaternion.copy(shaft.quaternion);
  head.position.addScaledVector(unit, length * 0.5);
  return shaft;
}

function board(
  k: ModelKit,
  name: string,
  center: THREE.Vector3,
  size: THREE.Vector3,
  xAxis: THREE.Vector3,
  yAxis: THREE.Vector3,
  surface: Surface
) {
  const mesh = k.box(name, [center.x, center.y, center.z], [size.x, size.y, size.z], surface);
  const x = xAxis.clone().normalize();
  const y = yAxis.clone().normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  if (z.y < 0) {
    z.negate();
    x.negate();
  }
  z.normalize();
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return mesh;
}

function layout(d: HarborCraneDimensions) {
  const mastTop = d.pulleyHeight + 0.62;
  const eave = WHEEL_TOP + 0.18;
  const ridge = Math.min(eave + 0.58, mastTop - 0.32);
  return { mastTop, eave, ridge, reach: d.reach, pulley: d.pulleyHeight, hook: d.hookHeight };
}

function foundation() {
  const k = kit("grok-harbor-crane-foundation");
  const x0 = -3.7;
  const x1 = 2.5;
  const height = 0.15;
  const blockH = height - 0.012;
  for (let course = 0; course < 2; course++) {
    const y = blockH / 2 + course * height;
    const depth = 0.49;
    for (let row = 0; row < 8; row++) {
      const z = -1.75 + row * 0.5;
      const shift = (course + row) % 2 ? 0.36 : 0;
      for (let i = -1; i < 10; i++) {
        const a = Math.max(x0, x0 + i * 0.74 + shift);
        const b = Math.min(x1, a + 0.72);
        if (b - a < 0.18) continue;
        k.box("ashlar-quay-block", [(a + b) / 2, y, z], [b - a - 0.012, blockH, depth - 0.016], "stone");
      }
    }
  }
  k.box("quay-coping", [-0.6, 0.335, 0], [6.05, 0.07, 3.82], "stone");
  for (const z of [-1.45, 0, 1.45]) {
    k.box("foundation-sleeper", [-0.6, 0.44, z], [5.7, 0.16, 0.22], "oak");
    for (const x of [-2.7, -0.2, 1.7]) {
      k.box("sleeper-anchor-strap", [x, 0.54, z], [0.28, 0.03, 0.3], "iron");
      bolt(k, "sleeper-anchor", new THREE.Vector3(x, 0.52, z), new THREE.Vector3(0, 1, 0), 0.08, 0.03);
    }
  }
  for (let i = 0; i < 14; i++)
    k.box("crane-house-deck-board", [-3.35 + i * 0.22, 0.56, 0], [0.2, 0.05, 3.15], i % 4 ? "wood" : "oak");
  k.cylinder("pivot-well", [0, 0.4, 0], 0.58, 0.22, "stone", 0.58, 32);
  k.ring("pivot-race", [0, 0.52, 0], 0.5, 0.045, "iron");
  k.cylinder("pivot-pin", [0, 0.62, 0], 0.14, 0.55, "iron", 0.14, 16);
  return k.finish();
}

function chordFrame(a: THREE.Vector3, b: THREE.Vector3): Frame {
  const axis = b.clone().sub(a).normalize();
  const right = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3().crossVectors(right, axis).normalize();
  return { right, up };
}

function house(k: ModelKit, roof: { eave: number; ridge: number }) {
  const posts: THREE.Vector3[] = [];
  for (const x of [HOUSE_REAR, (HOUSE_REAR + HOUSE_FRONT) / 2, HOUSE_FRONT])
    for (const z of [-HOUSE_Z, HOUSE_Z]) posts.push(new THREE.Vector3(x, 0, z));
  for (const p of posts) {
    member(
      k,
      "crane-house-post",
      new THREE.Vector3(p.x, 0.58, p.z),
      new THREE.Vector3(p.x, roof.eave, p.z),
      POST,
      POST,
      "oak"
    );
    member(
      k,
      "crane-house-knee",
      new THREE.Vector3(p.x, 0.85, p.z),
      new THREE.Vector3(p.x + (p.x < -2 ? 0.55 : -0.55), 1.45, p.z),
      0.1,
      0.12
    );
  }
  for (const z of [-HOUSE_Z, HOUSE_Z]) {
    member(
      k,
      "crane-house-sill",
      new THREE.Vector3(HOUSE_REAR, 0.7, z),
      new THREE.Vector3(HOUSE_FRONT, 0.7, z),
      0.16,
      0.16
    );
    member(
      k,
      "crane-house-wall-plate",
      new THREE.Vector3(HOUSE_REAR, roof.eave, z),
      new THREE.Vector3(HOUSE_FRONT, roof.eave, z),
      0.14,
      0.16
    );
  }
  for (const x of [HOUSE_REAR, HOUSE_FRONT]) {
    member(k, "crane-house-tie", new THREE.Vector3(x, 0.7, -HOUSE_Z), new THREE.Vector3(x, 0.7, HOUSE_Z), 0.14, 0.14);
    member(
      k,
      "crane-house-tie",
      new THREE.Vector3(x, roof.eave, -HOUSE_Z),
      new THREE.Vector3(x, roof.eave, HOUSE_Z),
      0.12,
      0.14
    );
  }
  const boardH = 0.13;
  const gap = 0.045;
  for (let y = 0.85; y < roof.eave - 0.12; y += boardH + gap)
    k.box(
      "crane-house-rear-board",
      [HOUSE_REAR - 0.09, y, 0],
      [0.03, boardH, HOUSE_Z * 2 - 0.2],
      Math.round(y * 10) % 5 ? "wood" : "oak"
    );
  for (const z of [-1, 1]) {
    for (let y = 0.85; y < 1.85; y += boardH + gap)
      k.box(
        "crane-house-side-board",
        [(HOUSE_REAR + HOUSE_FRONT) / 2, y, z * (HOUSE_Z + 0.02)],
        [HOUSE_FRONT - HOUSE_REAR - 0.28, boardH, 0.028],
        "wood"
      );
  }
  member(
    k,
    "crane-house-lintel",
    new THREE.Vector3(HOUSE_FRONT, roof.eave - 0.55, -HOUSE_Z + 0.2),
    new THREE.Vector3(HOUSE_FRONT, roof.eave - 0.55, HOUSE_Z - 0.2),
    0.12,
    0.16,
    "oak"
  );
  const xMid = (HOUSE_REAR + HOUSE_FRONT) / 2;
  const roofLen = HOUSE_FRONT - HOUSE_REAR + 0.16;
  for (const side of [-1, 1]) {
    const eaveZ = side * (HOUSE_Z + 0.08);
    const rise = new THREE.Vector3(0, roof.ridge - roof.eave, -eaveZ);
    const yAxis = rise.clone().normalize();
    const xAxis = new THREE.Vector3(1, 0, 0);
    const run = rise.length();
    const count = 9;
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count;
      const center = new THREE.Vector3(xMid, roof.eave, eaveZ).addScaledVector(rise, t);
      board(
        k,
        "crane-house-roof-board",
        center,
        new THREE.Vector3(roofLen, (run / count) * 0.9, 0.035),
        xAxis,
        yAxis,
        i % 4 ? "wood" : "oak"
      );
    }
    const normal = new THREE.Vector3().crossVectors(xAxis, yAxis);
    if (normal.y < 0) normal.negate();
    normal.normalize();
    for (const x of [HOUSE_REAR + 0.25, xMid, HOUSE_FRONT - 0.25]) {
      const a = new THREE.Vector3(x, roof.eave, eaveZ).addScaledVector(normal, -0.07);
      const b = new THREE.Vector3(x, roof.ridge, 0).addScaledVector(normal, -0.07);
      member(k, "crane-house-rafter", a, b, 0.08, 0.1, "oak");
    }
  }
  member(
    k,
    "crane-house-ridge",
    new THREE.Vector3(HOUSE_REAR - 0.04, roof.ridge + 0.04, 0),
    new THREE.Vector3(HOUSE_FRONT + 0.02, roof.ridge + 0.04, 0),
    0.1,
    0.08,
    "oak"
  );
  for (const y of [1.35, 2.35])
    for (const z of [-0.4, 0.4])
      member(
        k,
        "mast-partner",
        new THREE.Vector3(HOUSE_FRONT, y, z),
        new THREE.Vector3(-0.12, y, z * 0.35),
        0.12,
        0.14
      );
  member(
    k,
    "slewing-bar",
    new THREE.Vector3(HOUSE_FRONT + 0.1, 1.15, HOUSE_Z + 0.12),
    new THREE.Vector3(HOUSE_REAR + 0.3, 1.15, HOUSE_Z + 0.12),
    0.09,
    0.09,
    "wood"
  );
}

function jib(k: ModelKit, d: ReturnType<typeof layout>) {
  const head = new THREE.Vector3(0, d.mastTop, 0);
  const tip = new THREE.Vector3(d.reach - 0.08, d.pulley + 0.02, 0);
  const root = new THREE.Vector3(0.05, 1.28, 0);
  const foot = new THREE.Vector3(d.reach * 0.92, d.pulley - 0.36, 0);
  const upper = chordFrame(head, tip);
  const lower = chordFrame(root, foot);
  for (const z of [-0.2, 0.2]) {
    const side = new THREE.Vector3(0, 0, z);
    spar(
      k,
      "jib-upper-chord",
      [
        { at: head.clone().add(side), w: 0.2, h: 0.26 },
        { at: tip.clone().add(side), w: 0.11, h: 0.14 }
      ],
      "oak",
      6,
      upper
    );
    spar(
      k,
      "jib-lower-chord",
      [
        { at: root.clone().add(side), w: 0.2, h: 0.24 },
        { at: foot.clone().add(side), w: 0.12, h: 0.14 }
      ],
      "oak",
      6,
      lower
    );
  }
  const bays = Math.max(3, Math.ceil(d.reach / 1.35));
  const yOn = (a: THREE.Vector3, b: THREE.Vector3, x: number) => a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
  for (let i = 1; i < bays; i++) {
    const x = root.x + ((foot.x - root.x) * i) / bays;
    const next = root.x + ((foot.x - root.x) * (i + 1)) / bays;
    for (const z of [-0.2, 0.2]) {
      member(
        k,
        "jib-truss-upright",
        new THREE.Vector3(x, yOn(root, foot, x), z),
        new THREE.Vector3(x, yOn(head, tip, x), z),
        0.08,
        0.1,
        "wood"
      );
      member(
        k,
        "jib-truss-diagonal",
        new THREE.Vector3(x, yOn(head, tip, x), z),
        new THREE.Vector3(Math.min(next, foot.x), yOn(root, foot, Math.min(next, foot.x)), z),
        0.07,
        0.09,
        "wood"
      );
    }
    const y = yOn(head, tip, x);
    member(k, "jib-cross-tie", new THREE.Vector3(x, y, -0.28), new THREE.Vector3(x, y, 0.28), 0.08, 0.1);
    bolt(k, "jib-through-bolt", new THREE.Vector3(x, y, 0), new THREE.Vector3(0, 0, 1), 0.62, 0.025);
  }
  for (const y of [1.15, (1.28 + d.mastTop) / 2, d.mastTop - 0.16])
    k.ring("mast-iron-collar", [0, y, 0], 0.27, 0.026, "iron");
  bolt(k, "jib-root-pin", new THREE.Vector3(0, d.mastTop, 0), new THREE.Vector3(0, 0, 1), 0.7, 0.035);
  k.box("jib-head-cap", [tip.x, tip.y, 0], [0.28, 0.22, 0.62], "iron");
}

function frame(input?: HarborCraneDimensions) {
  const d = layout(checkedHarborCraneDimensions(input));
  const k = kit("grok-harbor-crane-frame");
  spar(
    k,
    "hewn-mast",
    [
      { at: new THREE.Vector3(0, 0.85, 0), w: 0.48, h: 0.48 },
      { at: new THREE.Vector3(0, d.mastTop, 0), w: 0.34, h: 0.34 }
    ],
    "oak",
    8
  );
  house(k, d);
  jib(k, d);
  return k.finish();
}

function drive() {
  const k = kit("grok-harbor-crane-drive");
  const x = WHEEL_X;
  const y = WHEEL_Y;
  for (const z of [-1.02, 1.02]) {
    member(k, "axle-bearing-post", new THREE.Vector3(x, 0.64, z), new THREE.Vector3(x, y - 0.05, z), 0.18, 0.2);
    k.box("split-bearing-block", [x, y, z], [0.42, 0.28, 0.24], "wood");
    k.box("bearing-cap", [x, y + 0.16, z], [0.48, 0.045, 0.28], "iron");
    for (const dx of [-0.16, 0.16])
      bolt(k, "bearing-cap-bolt", new THREE.Vector3(x + dx, y + 0.12, z), new THREE.Vector3(0, 1, 0), 0.16, 0.022);
    member(k, "bearing-knee", new THREE.Vector3(x - 0.7, 0.7, z), new THREE.Vector3(x, y - 0.35, z), 0.11, 0.13);
  }
  alongZ(k.cylinder("drive-axle", [x, y, 0.15], 0.11, 2.85, "oak", 0.11, 12));
  alongZ(k.cylinder("winding-drum", [x, y, (DRUM_Z0 + DRUM_Z1) / 2], DRUM_R, DRUM_Z1 - DRUM_Z0, "oak", DRUM_R, 20));
  for (const z of [DRUM_Z0, DRUM_Z1])
    alongZ(k.cylinder("drum-flange", [x, y, z], DRUM_R + 0.07, 0.045, "iron", DRUM_R + 0.07, 20));
  for (const z of [-CHEEK_Z, CHEEK_Z]) {
    for (const radius of [RIM_R - 0.07, RIM_R]) {
      const rim = k.add("laminated-treadwheel-rim", new THREE.TorusGeometry(radius, RIM_TUBE, 8, 64), "oak");
      rim.position.set(x, y, z);
    }
    const tyre = k.add("treadwheel-tyre", new THREE.TorusGeometry(RIM_R + 0.045, 0.018, 6, 64), "iron");
    tyre.position.set(x, y, z);
    alongZ(k.cylinder("wheel-hub", [x, y, z], 0.2, 0.16, "dark", 0.2, 12));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      member(
        k,
        "mortised-wheel-spoke",
        new THREE.Vector3(x + Math.cos(a) * 0.2, y + Math.sin(a) * 0.2, z),
        new THREE.Vector3(x + Math.cos(a) * (RIM_R - 0.05), y + Math.sin(a) * (RIM_R - 0.05), z),
        0.07,
        0.1,
        "wood"
      );
    }
  }
  // Treads face inward: the walkers stand inside the wheel, clear of the drum at +Z.
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    const tread = k.box(
      "walkable-wheel-tread",
      [x + Math.cos(a) * TREAD_R, y + Math.sin(a) * TREAD_R, 0],
      [0.2, 0.055, TREAD_HALF_Z * 2],
      i % 4 ? "wood" : "oak"
    );
    tread.rotation.z = a + Math.PI / 2;
    if (i % 7 === 0)
      bolt(
        k,
        "tread-strap-bolt",
        new THREE.Vector3(x + Math.cos(a) * (TREAD_R + 0.02), y + Math.sin(a) * (TREAD_R + 0.02), 0),
        new THREE.Vector3(Math.cos(a), Math.sin(a), 0),
        0.08,
        0.016
      );
  }
  const ratchetZ = -1.16;
  alongZ(k.cylinder("ratchet-disc", [x, y, ratchetZ], 0.32, 0.055, "iron", 0.32, 20));
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const tooth = k.box(
      "ratchet-tooth",
      [x + Math.cos(a) * 0.34, y + Math.sin(a) * 0.34, ratchetZ],
      [0.07, 0.08, 0.07],
      "iron"
    );
    tooth.rotation.z = a;
  }
  member(
    k,
    "ratchet-pawl",
    new THREE.Vector3(x - 0.46, y + 0.28, ratchetZ),
    new THREE.Vector3(x - 0.12, y + 0.36, ratchetZ),
    0.06,
    0.08,
    "iron"
  );
  member(
    k,
    "pawl-bracket",
    new THREE.Vector3(x, y - 0.15, ratchetZ),
    new THREE.Vector3(x - 0.46, y + 0.28, ratchetZ),
    0.1,
    0.12
  );
  bolt(k, "pawl-pivot", new THREE.Vector3(x - 0.46, y + 0.28, ratchetZ), new THREE.Vector3(0, 0, 1), 0.16, 0.028);
  member(
    k,
    "brake-lever",
    new THREE.Vector3(x - 0.46, y + 0.28, ratchetZ),
    new THREE.Vector3(x - 0.85, 1.35, ratchetZ - 0.15),
    0.06,
    0.08,
    "wood"
  );
  return k.finish();
}

function tackle(input?: HarborCraneDimensions) {
  const dims = checkedHarborCraneDimensions(input);
  const d = layout(dims);
  const k = kit("grok-harbor-crane-tackle");
  const x = WHEEL_X;
  const y = WHEEL_Y;
  // The drum and the rising part sit past the treads, on the +Z side of the house.
  const guide = new THREE.Vector3(0.08, d.mastTop - 0.16, (DRUM_Z0 + DRUM_Z1) / 2);
  const windR = DRUM_R + 0.02;
  const phase = Math.atan2(guide.y - y, guide.x - x) - Math.acos(windR / Math.hypot(guide.x - x, guide.y - y));
  const winding: Position[] = Array.from({ length: 161 }, (_, i) => {
    const t = i / 160;
    const a = phase + (t - 1) * Math.PI * 10;
    const z = DRUM_Z0 + t * (DRUM_Z1 - DRUM_Z0);
    return [x + Math.cos(a) * windR, y + Math.sin(a) * windR, z] as Position;
  });
  k.add(
    "wound-drum-rope",
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(winding.map(p => new THREE.Vector3(...p))), 160, 0.016, 5, false),
    "cloth"
  );
  const radius = 0.2;
  const h = new THREE.Vector3(d.reach, 0, -guide.z).normalize();
  const normal = new THREE.Vector3(-h.z, 0, h.x);
  const center = new THREE.Vector3(d.reach, d.pulley, 0).addScaledVector(h, -radius);
  const incoming = guide.clone().sub(center);
  const tangentAngle = Math.atan2(incoming.y, incoming.dot(h)) - Math.acos(radius / incoming.length());
  const circlePoint = (angle: number) =>
    center
      .clone()
      .addScaledVector(h, Math.cos(angle) * radius)
      .add(new THREE.Vector3(0, Math.sin(angle) * radius, 0));
  const tangent = circlePoint(tangentAngle);
  for (const sign of [-1, 1]) {
    const cheek = center.clone().addScaledVector(normal, sign * 0.16);
    member(
      k,
      "head-block-cheek",
      cheek.clone().add(new THREE.Vector3(0, -0.28, 0)),
      cheek.clone().add(new THREE.Vector3(0, 0.28, 0)),
      0.07,
      0.1
    );
    const flange = k.ring("head-sheave-flange", cheek.toArray() as Position, radius, 0.028, "iron", true);
    flange.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  }
  const sheave = k.cylinder(
    "grooved-head-sheave",
    center.toArray() as Position,
    radius - 0.03,
    0.14,
    "wood",
    radius - 0.03,
    28
  );
  sheave.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  member(
    k,
    "head-sheave-axle",
    center.clone().addScaledVector(normal, -0.24),
    center.clone().addScaledVector(normal, 0.24),
    0.06,
    0.06,
    "iron"
  );
  member(k, "fairlead-outrigger", new THREE.Vector3(0, guide.y, 0.15), guide.clone(), 0.12, 0.14);
  member(k, "fairlead-knee", new THREE.Vector3(0, guide.y - 0.7, 0.1), guide.clone(), 0.09, 0.11);
  const start = new THREE.Vector3(...winding.at(-1)!);
  const u = guide.clone().sub(start).normalize();
  const v = tangent.clone().sub(guide).normalize();
  const guideNormal = new THREE.Vector3().crossVectors(u, v).normalize();
  const turn = Math.acos(THREE.MathUtils.clamp(u.dot(v), -1, 1));
  const trim = 0.1 * Math.tan(turn / 2);
  const entry = guide.clone().addScaledVector(u, -trim);
  const exit = guide.clone().addScaledVector(v, trim);
  const guideCenter = entry.clone().addScaledVector(new THREE.Vector3().crossVectors(guideNormal, u), 0.1);
  const roller = k.ring("mast-fairlead-sheave", guideCenter.toArray() as Position, 0.1, 0.022, "iron", true);
  roller.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), guideNormal);
  const radial = entry.clone().sub(guideCenter);
  const guideArc: Position[] = Array.from(
    { length: 10 },
    (_, i) =>
      guideCenter
        .clone()
        .add(radial.clone().applyAxisAngle(guideNormal, (turn * i) / 9))
        .toArray() as Position
  );
  k.beam("drum-to-fairlead-rope", start.toArray() as Position, entry.toArray() as Position, 0.03, "cloth", true);
  k.tube("rope-around-mast-fairlead", guideArc, 0.015, "cloth");
  k.beam("fairlead-to-head-rope", exit.toArray() as Position, tangent.toArray() as Position, 0.03, "cloth", true);
  const bend: Position[] = Array.from(
    { length: 14 },
    (_, i) => circlePoint(tangentAngle * (1 - i / 13)).toArray() as Position
  );
  k.tube("rope-around-head-sheave", bend, 0.015, "cloth");
  k.beam("vertical-hoist-rope", [d.reach, d.pulley, 0], [d.reach, d.hook, 0], 0.032, "cloth", true);
  k.ring("hook-swivel-eye", [d.reach, d.hook - 0.03, 0], 0.07, 0.018, "iron", true);
  k.tube(
    "forged-cargo-hook",
    [
      [d.reach, d.hook - 0.08, 0],
      [d.reach, d.hook - 0.22, 0],
      [d.reach - 0.16, d.hook - 0.36, 0],
      [d.reach - 0.28, d.hook - 0.26, 0],
      [d.reach - 0.22, d.hook - 0.16, 0]
    ],
    0.028,
    "iron"
  );
  return k.finish();
}

export function grokHarborCranePartFactories(input?: HarborCraneDimensions): ModelPartFactory[] {
  const d = checkedHarborCraneDimensions(input);
  const part = (role: string, create: ModelPartFactory["create"]): ModelPartFactory => ({
    id: `grok-treadwheel-crane:${role}`,
    role,
    quality: "high",
    author: GROK_HARBOR_CRANE.author,
    create
  });
  return [
    part("foundation", foundation),
    part("frame", () => frame(d)),
    part("drive", drive),
    part("tackle", () => tackle(d)),
    ...(d.showCargo
      ? [
          {
            id: "grok-treadwheel-crane:cargo",
            role: "cargo",
            quality: "low" as const,
            author: "Codex GPT-6.1 Sol" as Author,
            basedOn: ["container.crate-closed@default#codex-gpt-6.1-sol"],
            create: () => {
              const k = kit("grok-harbor-crane-cargo");
              k.attach(createMedievalContainerModel("crate", "closed"), [d.reach - 0.05, 0, 0]);
              return k.finish();
            }
          }
        ]
      : [])
  ];
}

export function createGrokHarborCrane(input?: HarborCraneDimensions) {
  return compactModel(createModelAssembly("grok-treadwheel-crane", grokHarborCranePartFactories(input)), {
    mergeEquivalentMaterials: true
  });
}
