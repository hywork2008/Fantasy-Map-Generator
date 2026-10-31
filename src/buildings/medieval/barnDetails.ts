import * as THREE from "three";
import { compactModel } from "../compactModel";
import { ModelKit, type Position } from "./modelKit";

export type BarnKind = "farm-barn" | "threshing-barn" | "hay-shelter";

/** New timber construction, with real doorways and visible framing, in the original metre envelopes. */
export function createHighBarn(kind: BarnKind) {
  const k = new ModelKit(`${kind}-high`);
  const open = kind === "hay-shelter";
  const threshing = kind === "threshing-barn";
  const w = open ? 6 : threshing ? 12 : 9;
  const d = open ? 5 : threshing ? 8 : 6;
  const eave = open ? 3 : threshing ? 4 : 3.6;
  const rise = open ? 2 : threshing ? 2.5 : 2;
  const cz = open ? 0 : -1;
  const front = cz + d / 2;
  const back = cz - d / 2;
  const door = threshing ? 3.5 : 3.1;
  const roofSurface = kind === "farm-barn" ? "wood" : "thatch";
  const postXs = Array.from({ length: 5 }, (_, i) => -w / 2 + (i * w) / 4);
  const floorY = open ? 0.42 : 0.18;
  // Boards and stone pads are discrete pieces, not a solid building volume.
  for (let x = -w / 2 + 0.15; x < w / 2; x += 0.3)
    k.box("floor-board", [x, floorY, cz], [0.285, 0.12, d - 0.15], "wood");
  for (const x of postXs) {
    for (const z of [front, back]) {
      if (!open && Math.abs(x) < door / 2 + 0.15) continue;
      k.box("stone-post-pad", [x, 0.12, z], [0.48, 0.24, 0.48], "stone");
      k.box("oak-post", [x, (eave + 0.22) / 2, z], [0.22, eave - 0.22, 0.22], "oak");
      for (const direction of [-1, 1]) {
        if (Math.abs(x + direction * 0.8) > w / 2) continue;
        k.beam("pegged-knee-brace", [x, eave - 0.85, z], [x + direction * 0.8, eave - 0.12, z], 0.14);
      }
    }
    k.beam("tie-beam", [x, eave - 0.18, back], [x, eave - 0.18, front], 0.22);
    k.beam("king-post", [x, eave - 0.18, cz], [x, eave + rise - 0.13, cz], 0.16);
    for (const z of [front, back]) {
      k.beam("principal-rafter", [x, eave, z], [x, eave + rise, cz], 0.18);
      k.beam("truss-strut", [x, eave, cz], [x, eave + rise / 2, (z + cz) / 2], 0.12);
    }
  }
  for (const z of [front, back]) {
    k.beam("wall-plate", [-w / 2 - 0.18, eave, z], [w / 2 + 0.18, eave, z], 0.24);
    if (open) continue;
    for (let x = -w / 2 + 0.13; x < w / 2; x += 0.26) {
      if (Math.abs(x) < door / 2 + 0.15) continue;
      k.box("vertical-weatherboard", [x, (eave + 0.3) / 2, z], [0.245, eave - 0.3, 0.075], "wood");
      for (const y of [0.65, eave - 0.45])
        k.box("board-nail", [x, y, z + (z === front ? 0.045 : -0.045)], [0.025, 0.025, 0.02], "iron");
    }
    k.box("door-lintel", [0, eave - 0.25, z], [door + 0.5, 0.3, 0.26], "oak");
    for (const side of [-1, 1]) {
      const pivot = new THREE.Vector3(side * (door / 2 + 0.12), 0, z);
      const angle = (z === front ? -1 : 1) * side * 1.14;
      const point = (u: number, y: number, out = 0): Position => {
        const p = new THREE.Vector3(-side * u, y, out).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle).add(pivot);
        return [p.x, p.y, p.z];
      };
      const leafW = door / 2;
      for (let u = 0.1; u < leafW; u += 0.2) {
        const plank = k.box("open-door-plank", point(u, 1.75), [0.19, 2.95, 0.08], "wood");
        plank.rotation.y = angle;
      }
      for (const y of [0.7, 2.7]) {
        k.beam("door-ledger", point(0.05, y, -0.06), point(leafW - 0.05, y, -0.06), 0.12);
        k.beam("forged-strap-hinge", point(0.02, y, 0.055), point(leafW * 0.75, y, 0.055), 0.055, "iron");
      }
      k.beam("door-diagonal-brace", point(0.05, 0.75, -0.06), point(leafW - 0.05, 2.65, -0.06), 0.11);
      k.box("door-jamb", [pivot.x, (eave + 0.25) / 2, z], [0.2, eave - 0.25, 0.26], "oak");
    }
  }
  if (!open) {
    for (const x of [-w / 2, w / 2]) {
      for (let z = back + 0.12; z < front; z += 0.26)
        k.box("end-weatherboard", [x, (eave + 0.3) / 2, z], [0.075, eave - 0.3, 0.245], "wood");
      // Individual gable boards follow the triangular roof profile.
      for (let z = back + 0.13; z < front; z += 0.26) {
        const h = rise * (1 - Math.abs(z - cz) / (d / 2));
        if (h > 0.08) k.box("gable-board", [x, eave + h / 2, z], [0.08, h, 0.245], "wood");
      }
    }
  }
  k.roof(0, cz, w + 0.8, d + 0.7, eave + 0.08, rise, roofSurface);
  // Raised, staggered shingle courses or thatch liggers follow each pitched surface.
  for (const side of [-1, 1]) {
    const half = (d + 0.7) / 2;
    for (let t = 0.06, row = 0; t < 0.99; t += 0.09, row++) {
      const y = eave + 0.1 + rise * (1 - t);
      const z = cz + side * half * t;
      if (roofSurface === "wood") {
        for (let x = -w / 2 - 0.2 + (row % 2) * 0.2; x < w / 2 + 0.3; x += 0.42) {
          const shingle = k.box("split-shingle", [x, y + 0.035, z], [0.4, 0.055, half * 0.12], "wood");
          shingle.rotation.x = side * Math.atan2(rise, half);
        }
      } else {
        k.beam("thatch-ligger", [-w / 2 - 0.32, y + 0.035, z], [w / 2 + 0.32, y + 0.035, z], 0.055, "wood", true);
        for (let x = -w / 2; x <= w / 2; x += 0.6)
          k.beam("thatch-staple", [x - 0.035, y + 0.07, z - 0.07], [x + 0.035, y + 0.07, z + 0.07], 0.035, "wood");
      }
    }
    for (const x of [-w / 2 - 0.4, w / 2 + 0.4])
      k.beam("bargeboard", [x, eave + rise + 0.13, cz], [x, eave + 0.08, cz + side * half], 0.14, "oak");
  }
  k.beam(
    "ridge-cap",
    [-w / 2 - 0.38, eave + rise + 0.16, cz],
    [w / 2 + 0.38, eave + rise + 0.16, cz],
    0.2,
    roofSurface,
    true
  );
  if (open) {
    for (let stack = 0; stack < 3; stack++) {
      const x = -1.8 + stack * 1.8;
      for (let layer = 0; layer < 4; layer++)
        for (let bundle = 0; bundle < 8; bundle++) {
          const z = -1.6 + (bundle % 4) * 0.85;
          const xx = x + (bundle < 4 ? -0.35 : 0.35);
          k.beam(
            "bound-hay-sheaf",
            [xx - 0.3, 0.65 + layer * 0.35, z],
            [xx + 0.3, 0.7 + layer * 0.35, z + 0.15],
            0.28,
            "straw",
            true
          );
        }
    }
  } else {
    const apronDepth = threshing ? 2.7 : 1.9;
    for (let x = -3; x < 3; x += 0.25)
      k.box("apron-plank", [x, 0.065, front + apronDepth / 2 + 0.15], [0.24, 0.13, apronDepth], "wood");
    for (let i = 0; i < 18; i++) {
      const x = -w / 2 + 0.65 + (i % 6) * 0.17;
      const z = front + 0.6 + Math.floor(i / 6) * 0.45;
      k.beam("grain-sheaf-stalks", [x, 0.2, z], [x + 0.25, 0.85, z + 0.2], 0.08, "straw", true);
    }
    if (threshing) {
      k.beam("flail-handle", [0.6, 0.2, front + 1], [1.8, 0.2, front + 1.5], 0.055, "oak", true);
      k.beam("flail-beater", [1.8, 0.2, front + 1.5], [2.3, 0.2, front + 1.1], 0.085, "wood", true);
      k.ring("flail-leather-link", [1.8, 0.2, front + 1.5], 0.065, 0.02, "leather");
    } else {
      for (let i = 0; i < 5; i++)
        k.box("stacked-sawn-plank", [2.6, 0.2 + i * 0.11, front + 0.8], [2, 0.1, 0.65], "wood");
    }
  }
  return compactModel(k.finish());
}
