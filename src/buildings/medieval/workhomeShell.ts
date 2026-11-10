import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import { compactModel } from "../compactModel";
import { createModelAssembly, type ModelPartFactory } from "../modelParts";
import { ModelKit, type Surface } from "./modelKit";

import { WORKHOME_FORMS, type WorkhomeForm, type WorkhomeProfile, type WorkhomeQuality } from "./workhomeFormProfiles";

export {
  type FloorRect,
  WORKHOME_FORMS,
  type WorkhomeForm,
  type WorkhomeProfile,
  type WorkhomeQuality
} from "./workhomeFormProfiles";

interface Opening {
  u: number;
  base: number;
  width: number;
  height: number;
  door?: boolean;
}
function wall(
  k: ModelKit,
  p: WorkhomeProfile,
  length: number,
  x: number,
  z: number,
  angle: number,
  openings: Opening[],
  quality: WorkhomeQuality
) {
  const box = (name: string, u: number, y: number, out: number, w: number, h: number, d: number, surface: Surface) => {
    const mesh = k.box(
      name,
      [x + u * Math.cos(angle) + out * Math.sin(angle), y, z - u * Math.sin(angle) + out * Math.cos(angle)],
      [w, h, d],
      surface
    );
    mesh.rotation.y = angle;
  };
  const xs = [
      ...new Set([-length / 2, length / 2, ...openings.flatMap(o => [o.u - o.width / 2, o.u + o.width / 2])])
    ].sort((a, b) => a - b),
    ys = [
      ...new Set([
        0.15,
        ...p.floors.slice(1).map(f => f.elevation),
        p.eave,
        ...openings.flatMap(o => [o.base, o.base + o.height])
      ])
    ].sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++)
    for (let j = 1; j < ys.length; j++) {
      const u = (xs[i - 1] + xs[i]) / 2,
        y = (ys[j - 1] + ys[j]) / 2;
      if (openings.some(o => Math.abs(u - o.u) < o.width / 2 - 1e-8 && y > o.base && y < o.base + o.height)) continue;
      box("infill-wall", u, y, -0.1, xs[i] - xs[i - 1], ys[j] - ys[j - 1], 0.2, y < 3.35 ? "stone" : "plaster");
    }
  for (const o of openings) {
    for (const side of [-1, 1])
      box("opening-jamb", o.u + side * (o.width / 2 + 0.045), o.base + o.height / 2, 0.035, 0.09, o.height, 0.1, "oak");
    box("opening-lintel", o.u, o.base + o.height + 0.045, 0.035, o.width + 0.18, 0.09, 0.1, "oak");
    if (!o.door) {
      box("window-glazing", o.u, o.base + o.height / 2, -0.11, o.width, o.height, 0.025, "water");
      box("window-mullion", o.u, o.base + o.height / 2, 0.025, 0.05, o.height, 0.08, "oak");
      if (quality === "high")
        for (const side of [-1, 1]) {
          const shutterU = o.u + side * (o.width * 0.75 + 0.04);
          if (
            openings.some(
              door =>
                door.door &&
                Math.abs(shutterU - door.u) < door.width / 2 + o.width / 4 &&
                o.base < door.base + door.height &&
                o.base + o.height > door.base
            )
          )
            continue;
          box("open-window-shutter", shutterU, o.base + o.height / 2, 0.065, o.width / 2, o.height, 0.055, "wood");
        }
    }
  }
  // Exterior frame bands follow the floor thickness, never cutting a clear door or window.
  for (const f of [...p.floors.slice(1).map(f => f.elevation - 0.07), p.eave - 0.06])
    box("exterior-frame-band", 0, f, 0.025, length + 0.08, 0.12, 0.1, "oak");
  for (const side of [-1, 1])
    box("corner-post", side * (length / 2 - 0.055), (p.eave + 0.15) / 2, 0.025, 0.11, p.eave - 0.15, 0.1, "oak");
}
function architecture(p: WorkhomeProfile, quality: WorkhomeQuality) {
  const k = new ModelKit(`${p.formId}-architecture`),
    spine = p.spine.centerX;
  const windows = p.floors.flatMap(f =>
    [-p.width * 0.31, p.width * 0.31].map(u => ({ u, base: f.elevation + 0.85, width: 0.65, height: 1.15 }))
  );
  for (const side of [-1, 1])
    wall(
      k,
      p,
      p.width,
      0,
      (side * p.depth) / 2,
      side === 1 ? 0 : Math.PI,
      [...windows, { u: side * spine, base: 0.15, width: 1, height: 2.1, door: true }],
      quality
    );
  // Side openings stay away from the stairwell and the reserved work zone.
  for (const side of [-1, 1])
    wall(
      k,
      p,
      p.depth,
      (side * p.width) / 2,
      0,
      (side * Math.PI) / 2,
      p.floors.flatMap(f =>
        [-p.depth * 0.32, p.depth * 0.32].map(u => ({ u, base: f.elevation + 1, width: 0.7, height: 1.1 }))
      ),
      quality
    );
  return k.finish();
}
function floors(p: WorkhomeProfile) {
  const k = new ModelKit(`${p.formId}-floors`),
    right = p.width / 2,
    front = p.depth / 2;
  k.box("ground-slab", [0, 0.075, 0], [p.width, 0.15, p.depth], "stone");
  for (const f of p.floors.slice(1)) {
    for (const cell of f.cells) {
      if (cell.use === "stair") continue;
      const [x0, z0, x1, z1] = cell.rect;
      k.box(
        `floor-${cell.use}`,
        [(x0 + x1) / 2, f.elevation - 0.08, (z0 + z1) / 2],
        [x1 - x0, 0.16, z1 - z0],
        cell.use === "circulation" ? "oak" : "wood"
      );
    }
    // Bearing strips lie under the walls, outside all usable floor accounting.
    for (const z of [-front + 0.1, front - 0.1])
      k.box("floor-wall-bearing", [0, f.elevation - 0.08, z], [p.width, 0.16, 0.2], "oak");
    for (const x of [-right + 0.1, right - 0.1])
      k.box("floor-wall-bearing", [x, f.elevation - 0.08, 0], [0.2, 0.16, p.depth - 0.4], "oak");
  }
  return k.finish();
}
function roof(p: WorkhomeProfile, quality: WorkhomeQuality) {
  const k = new ModelKit(`${p.formId}-roof`),
    half = p.depth / 2 + 0.22,
    angle = Math.atan2(p.roofRise, half),
    ridge = p.eave + p.roofRise;
  for (const side of [-1, 1]) {
    const panel = k.box(
      "continuous-roof-cover",
      [0, p.eave + p.roofRise / 2, (side * half) / 2],
      [p.width + 0.44, 0.06, Math.hypot(half, p.roofRise)],
      "tile"
    );
    panel.rotation.x = side * angle;
    k.beam("eave-fascia", [-p.width / 2 - 0.22, p.eave, side * half], [p.width / 2 + 0.22, p.eave, side * half], 0.09);
    if (quality === "high")
      for (let row = 0; row < 12; row++) {
        const t = (row + 0.5) / 12;
        for (let x = -p.width / 2 - 0.08 + (row % 2) * 0.1; x < p.width / 2 + 0.1; x += 0.24) {
          const tile = k.box(
            "overlapping-roof-tile",
            [x, ridge - p.roofRise * t + 0.06, side * half * t],
            [0.22, 0.03, 0.33],
            "tile"
          );
          tile.rotation.x = side * angle;
        }
      }
  }
  k.beam("ridge-cap", [-p.width / 2 - 0.22, ridge + 0.04, 0], [p.width / 2 + 0.22, ridge + 0.04, 0], 0.1, "tile");
  for (const side of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-p.depth / 2, 0);
    shape.lineTo(p.depth / 2, 0);
    shape.lineTo(0, p.roofRise);
    shape.closePath();
    const mesh = k.add(
      "closed-gable",
      new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false }),
      "plaster"
    );
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(side === 1 ? p.width / 2 - 0.2 : -p.width / 2, p.eave, 0);
    for (const z of [-p.depth / 2, p.depth / 2])
      k.beam(
        "gable-bargeboard",
        [side * (p.width / 2 + 0.08), p.eave, z],
        [side * (p.width / 2 + 0.08), ridge, 0],
        0.09
      );
  }
  return k.finish();
}
function stairs(p: WorkhomeProfile, quality: WorkhomeQuality) {
  const k = new ModelKit(`${p.formId}-internal-stair`),
    left = p.stair.hole[0],
    right = p.stair.hole[2],
    lowerX = left + 0.58,
    upperX = left + 1.7;
  const guard = (a: [number, number], b: [number, number], base: number) => {
    k.beam("stairwell-guard", [a[0], base + 0.95, a[1]], [b[0], base + 0.95, b[1]], 0.07);
    const count = quality === "high" ? Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.25) : 2;
    for (let i = 0; i <= count; i++)
      k.box(
        "guard-baluster",
        [a[0] + ((b[0] - a[0]) * i) / count, base + 0.46, a[1] + ((b[1] - a[1]) * i) / count],
        [0.07, 0.92, 0.07]
      );
  };
  for (const [index, f] of p.stair.flights.entries()) {
    const base = p.floors[index].elevation,
      r = f.rise / f.risers,
      mid = base + f.rise / 2,
      top = base + f.rise;
    for (let i = 0; i < f.treadsPerFlight; i++)
      for (const [name, x, z, y] of [
        ["lower-flight-tread", lowerX, 1.7 - (i + 0.5) * f.tread, base + (i + 1) * r],
        ["upper-flight-tread", upperX, f.turnZ + (i + 0.5) * f.tread, mid + (i + 1) * r]
      ] as const)
        k.box(name, [x, y - 0.055, z], [1, 0.11, f.tread], "wood");
    k.box("turn-landing", [(left + right) / 2, mid - 0.06, (-1.7 + f.turnZ) / 2], [2.2, 0.12, f.turnZ + 1.7], "wood");
    for (const x of [lowerX - 0.42, lowerX + 0.42])
      k.beam("lower-stair-carriage", [x, base - 0.06, 1.7], [x, base - 0.06 + f.treadsPerFlight * r, f.turnZ], 0.14);
    for (const x of [upperX - 0.42, upperX + 0.42])
      k.beam("upper-stair-carriage", [x, mid - 0.06, f.turnZ], [x, mid - 0.06 + f.treadsPerFlight * r, 1.7], 0.14);
    for (const x of [left + 0.12, right - 0.12])
      k.box("landing-support", [x, (base + mid - 0.12) / 2, -1.6], [0.12, mid - 0.12 - base, 0.12]);
    guard([left + 0.04, -1.66], [left + 0.04, 1.7], top);
    guard([left + 0.04, -1.66], [right, -1.66], top);
    if (index === p.stair.flights.length - 1) guard([left + 0.04, 1.66], [left + 1.14, 1.66], top);
    const railX = left + 1.14;
    k.beam("lower-flight-handrail", [railX, base + 0.95, 1.7], [railX, mid + 0.95, f.turnZ], 0.06);
    k.beam("upper-flight-handrail", [railX, mid + 0.95, f.turnZ], [railX, top + 0.95, 1.7], 0.06);
    // Lower outer guard fits the explicitly reserved 0.08 m strip.
    k.beam("lower-outer-handrail", [left + 0.04, base + 0.95, 1.7], [left + 0.04, mid + 0.95, f.turnZ], 0.07);
    for (const [x, y, z] of [
      [railX, base, 1.7],
      [railX, mid, f.turnZ],
      [railX, top, 1.7],
      [left + 0.04, base, 1.7],
      [left + 0.04, mid, f.turnZ]
    ])
      k.box("flight-rail-support", [x, y + 0.475, z], [0.06, 0.95, 0.06]);
    guard([left + 0.04, -1.66], [left + 0.04, f.turnZ], mid);
    guard([left + 0.04, -1.66], [right, -1.66], mid);
  }
  return k.finish();
}
export function workhomeShellParts(form: WorkhomeForm, quality: WorkhomeQuality): ModelPartFactory[] {
  const p = WORKHOME_FORMS[form];
  return [
    ["architecture", () => architecture(p, quality)],
    ["floors", () => floors(p)],
    ["roof", () => roof(p, quality)],
    ["internal-stair", () => stairs(p, quality)]
  ].map(([id, create]) => ({
    id: `${form}:${id}`,
    role: id as string,
    quality,
    author: DEFAULT_AUTHOR,
    create: create as ModelPartFactory["create"]
  }));
}
export function assembleWorkhomeShell(
  form: WorkhomeForm,
  quality: WorkhomeQuality,
  parts: readonly ModelPartFactory[] = workhomeShellParts(form, quality)
) {
  const model = compactModel(createModelAssembly(`${form}-workhome-${quality}`, parts), {
    mergeEquivalentMaterials: true
  });
  model.group.userData.placementSpec = structuredClone(WORKHOME_FORMS[form]);
  return model;
}
