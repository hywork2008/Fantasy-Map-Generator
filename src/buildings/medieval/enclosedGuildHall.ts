import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { addGuildEmblem, addGuildInspectionSamples, type EnclosedGuildRole } from "./enclosedGuildTrades";
import { ModelKit, type Surface } from "./modelKit";

export type { EnclosedGuildRole } from "./enclosedGuildTrades";
export type HallQuality = "low" | "high";

/** Main-body origin and connection coordinates, never a quality-dependent bounding-box centre. */
export const ENCLOSED_GUILD_HALL = {
  formId: "guild-enclosed",
  placementSpecVersion: 1,
  width: 12,
  depth: 8,
  wall: 0.3,
  groundFloor: 0.2,
  upperFloor: 3.4,
  eave: 6.6,
  roofRise: 2.2,
  envelope: { min: [-6.4, 0, -4.4], max: [6.4, 9.2, 4.6] },
  main: { position: [0, 0.2, 4], clearWidth: 1.4, clearHeight: 2.2 },
  service: { position: [-4, 0.2, -4], clearWidth: 1.2, clearHeight: 2.1 },
  stair: {
    hole: [3.5, -1.7, 5.7, 1.7],
    lowerEntry: [4, 0.2, 1.7],
    upperExit: [5.2, 3.4, 1.7],
    risers: 18,
    tread: 0.27
  },
  capacity: {
    netResidentialAreaM2: 0,
    workshops: 0,
    dwellings: 0,
    laborPeople: 0,
    simultaneousWorkplaces: 0,
    assemblyNetAreaM2: 48,
    assemblySeats: 24,
    assemblyAttendance: "delegated-or-scheduled"
  },
  assemblyAreaXZ: [-5.5, -3, 2.5, 3],
  floors: [
    {
      level: 0,
      elevation: 0.2,
      use: "administration",
      clearFloorAreaM2: 84.36,
      deductionsM2: { stair: 7.48, circulation: 10, serviceOrStorage: 15 },
      netUseAreaM2: 51.88
    },
    {
      level: 1,
      elevation: 3.4,
      use: "assembly",
      clearFloorAreaM2: 84.36,
      deductionsM2: { stair: 7.48, circulation: 10, serviceOrStorage: 18.88 },
      netUseAreaM2: 48
    }
  ],
  groundAccess: [
    [0, 4],
    [0, 2.7],
    [4, 2.7],
    [4, 1.7]
  ],
  serviceAccess: [
    [-4, -4],
    [-4, -3.25],
    [0, -3.25],
    [0, 2.7]
  ],
  upperAccess: [
    [5.2, 1.7],
    [5.2, 2.8],
    [2, 2.8]
  ]
} as const;

interface Opening {
  u: number;
  base: number;
  width: number;
  height: number;
  door?: boolean;
}
function facade(
  k: ModelKit,
  name: string,
  length: number,
  x: number,
  z: number,
  angle: number,
  openings: Opening[],
  high: boolean
) {
  const c = Math.cos(angle),
    s = Math.sin(angle);
  const box = (label: string, u: number, y: number, out: number, w: number, h: number, d: number, surface: Surface) => {
    const mesh = k.box(label, [x + u * c + out * s, y, z - u * s + out * c], [w, h, d], surface);
    mesh.rotation.y = angle;
  };
  const xs = [
    ...new Set([-length / 2, length / 2, ...openings.flatMap(o => [o.u - o.width / 2, o.u + o.width / 2])])
  ].sort((a, b) => a - b);
  const ys = [...new Set([0.2, 6.6, ...openings.flatMap(o => [o.base, o.base + o.height])])].sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++)
    for (let j = 1; j < ys.length; j++) {
      const u = (xs[i - 1] + xs[i]) / 2,
        y = (ys[j - 1] + ys[j]) / 2;
      if (openings.some(o => Math.abs(u - o.u) < o.width / 2 - 1e-8 && y > o.base && y < o.base + o.height)) continue;
      box(name, u, y, -0.15, xs[i] - xs[i - 1], ys[j] - ys[j - 1], 0.3, y < 3.4 ? "stone" : "plaster");
    }
  for (const o of openings) {
    // Jambs remain outside the declared clear aperture in both tiers.
    for (const side of [-1, 1])
      box(
        "opening-jamb",
        o.u + side * (o.width / 2 + 0.055),
        o.base + o.height / 2,
        0.025,
        0.11,
        o.height + 0.1,
        0.12,
        "oak"
      );
    box("opening-lintel", o.u, o.base + o.height + 0.055, 0.025, o.width + 0.22, 0.11, 0.12, "oak");
    if (o.door) {
      // Folded leaves sit against the inside wall, away from the clear doorway.
      for (const side of [-1, 1])
        box(
          "folded-open-door",
          o.u + side * o.width * 0.75,
          o.base + o.height / 2,
          -0.34,
          o.width / 2,
          o.height,
          0.055,
          "wood"
        );
    } else {
      box("window-glazing", o.u, o.base + o.height / 2, -0.12, o.width, o.height, 0.025, "water");
      box("window-mullion", o.u, o.base + o.height / 2, 0.025, 0.055, o.height, 0.08, "oak");
      if (high)
        for (let j = 1; j < 4; j++)
          box("window-lead", o.u, o.base + (o.height * j) / 4, -0.075, o.width, 0.018, 0.018, "dark");
    }
  }
}

function architecture(quality: HallQuality) {
  const k = new ModelKit("enclosed-hall-architecture"),
    high = quality === "high";
  const windows = [-4, -2, 2, 4].flatMap(u => [1.15, 4.45].map(base => ({ u, base, width: 0.9, height: 1.25 })));
  facade(k, "front-wall", 12, 0, 4, 0, [...windows, { u: 0, base: 0.2, width: 1.4, height: 2.2, door: true }], high);
  facade(
    k,
    "rear-wall",
    12,
    0,
    -4,
    Math.PI,
    [...windows.filter(o => !(o.u === 4 && o.base < 3)), { u: 4, base: 0.2, width: 1.2, height: 2.1, door: true }],
    high
  );
  for (const side of [-1, 1])
    facade(
      k,
      "end-wall",
      8,
      side * 6,
      0,
      (side * Math.PI) / 2,
      [-2.5, 0, 2.5].flatMap(u => [1.15, 4.45].map(base => ({ u, base, width: 0.8, height: 1.25 }))),
      high
    );
  for (const z of [-4.04, 4.04]) {
    for (const y of [3.4, 6.55]) k.box("continuous-frame-band", [0, y, z], [12.12, 0.16, 0.12], "oak");
    for (const x of [-5.9, -3, -1, 1, 3, 5.9]) {
      k.box("upper-frame-post", [x, 5, z], [0.14, 3.1, 0.12], "oak");
      if (high && Math.abs(x) > 1) k.beam("upper-frame-brace", [x, 3.53, z], [x + (x > 0 ? -0.7 : 0.7), 4.3, z], 0.075);
    }
  }
  if (high)
    for (const x of [-5.95, 5.95])
      for (const z of [-3.95, 3.95])
        for (let y = 0.4; y < 3.3; y += 0.32) k.box("corner-quoin", [x, y, z], [0.3, 0.27, 0.3], "stone");
  return k.finish();
}

function floors() {
  const k = new ModelKit("enclosed-hall-floors");
  k.box("ground-slab", [0, 0.1, 0], [12, 0.2, 8], "stone");
  const slab = (x0: number, z0: number, x1: number, z1: number) =>
    k.box("upper-floor-around-stairwell", [(x0 + x1) / 2, 3.32, (z0 + z1) / 2], [x1 - x0, 0.16, z1 - z0], "wood");
  slab(-6, -4, 3.5, 4);
  slab(3.5, -4, 6, -1.7);
  slab(3.5, 1.7, 6, 4);
  slab(5.7, -1.7, 6, 1.7);
  return k.finish();
}

function roof(quality: HallQuality) {
  const k = new ModelKit("enclosed-hall-roof");
  const half = 4.3,
    rise = 2.2,
    angle = Math.atan2(rise, half);
  for (const side of [-1, 1]) {
    const panel = k.box("roof-cover", [0, 7.7, (side * half) / 2], [12.6, 0.08, Math.hypot(half, rise)], "tile");
    panel.rotation.x = side * angle;
    k.beam("eave-fascia", [-6.3, 6.6, side * half], [6.3, 6.6, side * half], 0.12);
    if (quality === "high")
      for (let row = 0; row < 14; row++) {
        const t = (row + 0.5) / 14;
        for (let x = -6.1 + (row % 2) * 0.13; x < 6.2; x += 0.28) {
          const tile = k.box(
            "overlapping-tile",
            [x, 8.8 - rise * t + 0.07, side * half * t],
            [0.26, 0.035, 0.35],
            "tile"
          );
          tile.rotation.x = side * angle;
        }
      }
  }
  k.beam("ridge-cap", [-6.3, 8.85, 0], [6.3, 8.85, 0], 0.14, "tile");
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-4, 0);
    shape.lineTo(4, 0);
    shape.lineTo(0, 2.2);
    shape.closePath();
    const mesh = k.add(
      "closed-gable",
      new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: false }),
      "plaster"
    );
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(side > 0 ? 5.7 : -6, 6.6, 0);
    for (const z of [-4, 4]) k.beam("gable-bargeboard", [side * 6.15, 6.6, z], [side * 6.15, 8.8, 0], 0.12);
  }
  return k.finish();
}

function stairs(quality: HallQuality) {
  const k = new ModelKit("enclosed-hall-internal-stair"),
    rise = 3.2 / 18,
    tread = 0.27,
    turnZ = 1.7 - 8 * tread;
  for (let i = 0; i < 8; i++) {
    k.box("lower-flight-tread", [4, 0.2 + (i + 1) * rise - 0.055, 1.7 - (i + 0.5) * tread], [1, 0.11, tread], "wood");
    k.box(
      "upper-flight-tread",
      [5.2, 1.8 + (i + 1) * rise - 0.055, turnZ + (i + 0.5) * tread],
      [1, 0.11, tread],
      "wood"
    );
  }
  k.box("turn-landing", [4.6, 1.74, (-1.7 + turnZ) / 2], [2.2, 0.12, turnZ + 1.7], "wood");
  for (const x of [3.56, 4.44]) k.beam("lower-stair-carriage", [x, 0.14, 1.7], [x, 0.14 + 8 * rise, turnZ], 0.14);
  for (const x of [4.76, 5.64]) k.beam("upper-stair-carriage", [x, 1.74, turnZ], [x, 1.74 + 8 * rise, 1.7], 0.14);
  for (const x of [3.6, 5.6]) k.box("landing-support", [x, 0.96, -1.5], [0.14, 1.52, 0.14]);
  const guard = (a: [number, number], b: [number, number], base: number) => {
    k.beam("stairwell-top-guard", [a[0], base + 0.95, a[1]], [b[0], base + 0.95, b[1]], 0.07);
    const count = quality === "high" ? Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.24) : 2;
    for (let i = 0; i <= count; i++)
      k.box(
        "stairwell-baluster",
        [a[0] + ((b[0] - a[0]) * i) / count, base + 0.46, a[1] + ((b[1] - a[1]) * i) / count],
        [0.055, 0.92, 0.055]
      );
  };
  guard([3.46, -1.7], [3.46, 1.7], 3.4);
  guard([3.46, 1.73], [4.64, 1.73], 3.4);
  guard([3.46, -1.73], [5.7, -1.73], 3.4);
  // The wall is the outer guard; the central rail leaves both 1 m flights clear.
  k.beam("lower-flight-handrail", [4.55, 1.3, 1.7], [4.55, 2.75, turnZ], 0.06);
  k.beam("upper-flight-handrail", [4.65, 2.75, turnZ], [4.65, 4.35, 1.7], 0.06);
  return k.finish();
}

function furnishings(role: EnclosedGuildRole, quality: HallQuality) {
  const k = new ModelKit(`${role}-hall-furnishings`);
  for (const x of [-3.7, 0.2])
    for (const z of [-2.4, -0.8, 0.8, 2.4]) {
      k.box("three-seat-assembly-bench", [x, 3.87, z], [2.4, 0.12, 0.42], "wood");
      for (const dx of [-0.95, 0.95]) k.box("bench-trestle", [x + dx, 3.62, z], [0.12, 0.44, 0.38]);
    }
  for (const z of [-1.4, 1.4]) {
    k.table(-3, z, 2.2, 1, 0.95);
    if (role === "textiles")
      for (let i = 0; i < 3; i++)
        k.box("inspection-cloth", [-3.7 + i * 0.7, 1.01, z], [0.6, 0.1, 0.8], i % 2 ? "white" : "cloth");
    else if (role === "leather") k.box("inspected-leather", [-3, 1.02, z], [1.8, 0.08, 0.8], "leather");
    else addGuildInspectionSamples(k, role, z, quality === "high");
    if (quality === "high") {
      const ruleY = role === "textiles" || role === "leather" ? 1.09 : 1.0225;
      k.beam("inspection-rule", [-4, ruleY, z + 0.36], [-2, ruleY, z + 0.36], 0.025, "wood");
    }
  }
  k.box("records-cabinet", [2, 1.05, -3.3], [1.8, 1.7, 0.55], "wood");
  k.box("trade-sign", [-1.4, 2.95, 4.13], [1.15, 0.6, 0.12], "oak");
  if (role === "textiles")
    for (let i = 0; i < 3; i++) k.box("cloth-sign-fold", [-1.75 + i * 0.35, 2.95, 4.21], [0.22, 0.36, 0.035], "cloth");
  else if (role === "leather") {
    k.box("hide-sign-body", [-1.4, 2.95, 4.21], [0.55, 0.35, 0.035], "leather");
    for (const side of [-1, 1])
      for (const y of [2.79, 3.11])
        k.box("hide-sign-limb", [-1.4 + side * 0.29, y, 4.21], [0.18, 0.12, 0.035], "leather");
  } else addGuildEmblem(k, role);
  return k.finish();
}

export function enclosedGuildHallParts(role: EnclosedGuildRole, quality: HallQuality): ModelPartFactory[] {
  return [
    ["architecture", () => architecture(quality)],
    ["floors", floors],
    ["roof", () => roof(quality)],
    ["internal-stair", () => stairs(quality)],
    ["trade-furnishings", () => furnishings(role, quality)]
  ].map(([id, create]) => ({
    id: `${role}:${id}`,
    role: id as string,
    quality,
    author: DEFAULT_AUTHOR,
    create: create as ModelPartFactory["create"]
  }));
}
export function assembleEnclosedGuildHall(
  role: EnclosedGuildRole,
  quality: HallQuality,
  parts: readonly ModelPartFactory[] = enclosedGuildHallParts(role, quality)
) {
  const model = compactModel(createModelAssembly(`enclosed-${role}-guild-hall-${quality}`, parts), {
    mergeEquivalentMaterials: true
  });
  model.group.userData.placementSpec = structuredClone(ENCLOSED_GUILD_HALL);
  return model;
}
