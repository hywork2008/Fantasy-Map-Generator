import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { compactModel } from "../compactModel";
import { ModelKit } from "../medieval/modelKit";

export type YardPropDetail = "low" | "high";
const HALF_PI = Math.PI / 2;

/** A stone cross on three square steps, in the churchyard south of the church. */
export function createChurchyardCross(detail: YardPropDetail): CityStructureMeshes {
  const k = new ModelKit("churchyard-cross");
  const high = detail === "high",
    rise = 0.28;
  [2.4, 1.9, 1.4].forEach((side, i) => {
    k.box("cross-step", [0, i * rise + rise / 2, 0], [side, rise, side], "stone");
    if (high) k.box("step-nosing", [0, (i + 1) * rise - 0.02, 0], [side - 0.04, 0.04, side - 0.04], "white");
  });
  const base = rise * 3;
  k.box("socket-stone", [0, base + 0.3, 0], [0.86, 0.6, 0.86], "stone");
  // The shaft tapers to its top and is chamfered at the corners; Low keeps the straight taper.
  const shaft = k.cylinder("cross-shaft", [0, base + 0.6 + 1.2, 0], 0.3, 2.4, "stone", 0.2, 4);
  shaft.rotation.y = Math.PI / 4;
  if (high) {
    for (const y of [0.7, 1.6]) {
      const band = k.cylinder(
        "shaft-moulding",
        [0, base + 0.6 + y, 0],
        0.32 - y * 0.03,
        0.06,
        "white",
        0.32 - y * 0.03,
        4
      );
      band.rotation.y = Math.PI / 4;
    }
    k.box("socket-chamfer", [0, base + 0.62, 0], [0.9, 0.05, 0.9], "white");
  }
  const top = base + 0.6 + 2.4;
  k.box("cross-knop", [0, top + 0.12, 0], [0.5, 0.24, 0.5], "stone");
  k.box("cross-upright", [0, top + 0.82, 0], [0.3, 1.16, 0.2], "stone");
  k.box("cross-arms", [0, top + 0.98, 0], [1, 0.3, 0.2], "stone");
  if (high) {
    for (const x of [-0.56, 0.56]) k.box("arm-terminal", [x, top + 0.98, 0], [0.14, 0.42, 0.22], "stone");
    k.box("upright-terminal", [0, top + 1.5, 0], [0.42, 0.14, 0.22], "stone");
    // A small figure niche on the shaft below the head, as on many late medieval crosses.
    k.box("shaft-niche", [0, top - 0.4, 0.17], [0.2, 0.3, 0.04], "dark");
    k.box("niche-hood", [0, top - 0.2, 0.17], [0.26, 0.06, 0.08], "white");
  }
  return compactModel(k.finish());
}

/** A timber-framed roofed lych-gate at the churchyard entrance; the roof ridge runs along the path. */
export function createLychGate(detail: YardPropDetail): CityStructureMeshes {
  const high = detail === "high";
  const gate = new ModelKit("lych-gate-body");
  const length = 4.2,
    half = length / 2 - 0.35,
    wide = 1.15,
    eave = 2.7;
  // Built with the path along local X so the roof ridge is parallel to it, then turned to run along Z.
  gate.box("stone-floor", [0, 0.05, 0], [length, 0.1, wide * 2 + 0.7], "stone");
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      gate.box("post-plinth", [sx * half, 0.25, sz * wide], [0.42, 0.3, 0.42], "stone");
      gate.box("gate-post", [sx * half, 0.4 + eave / 2, sz * wide], [0.24, eave - 0.1, 0.24], "oak");
    }
  for (const sz of [-1, 1]) gate.box("wall-plate", [0, eave + 0.04, sz * wide], [length, 0.2, 0.22], "oak");
  for (const sx of [-1, 1]) gate.box("tie-beam", [sx * half, eave - 0.2, 0], [0.2, 0.2, wide * 2], "oak");
  gate.box("tie-beam", [0, eave - 0.2, 0], [0.2, 0.2, wide * 2], "oak");
  gate.roof(0, 0, length + 0.4, wide * 2 + 0.9, eave + 0.14, 1.25, "tile", false);
  // The bier shelf in the middle where a coffin rested.
  gate.box("bier-slab", [0, 0.55, 0], [1.5, 0.12, 0.7], "stone");
  for (const sx of [-0.55, 0.55]) gate.box("bier-leg", [sx, 0.28, 0], [0.18, 0.5, 0.5], "stone");
  if (high) {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        gate.beam("knee-brace", [sx * half, eave - 0.9, sz * wide], [sx * (half - 0.7), eave, sz * wide], 0.11);
        gate.beam("cross-brace", [sx * half, eave - 0.85, sz * wide], [sx * half, eave - 0.1, sz * (wide - 0.55)], 0.1);
      }
    for (const sz of [-1, 1]) {
      gate.box("side-rail", [0, 0.95, sz * wide], [length - 0.5, 0.1, 0.12], "wood");
      gate.box("side-bench", [0, 0.48, sz * (wide - 0.4)], [length - 0.9, 0.1, 0.4], "wood");
    }
    for (const sx of [-1, 1]) {
      gate.beam("king-post", [sx * (half + 0.1), eave + 0.1, 0], [sx * (half + 0.1), eave + 1.2, 0], 0.1);
      gate.beam("collar", [sx * (half + 0.1), eave + 0.65, -0.55], [sx * (half + 0.1), eave + 0.65, 0.55], 0.09);
    }
  }
  // Two plank gates hanging open on the street-side posts.
  for (const sz of [-1, 1]) {
    const leaf = gate.box("gate-leaf", [half + 0.5, 0.7, sz * (wide - 0.1)], [1, 1.1, 0.06], "wood");
    leaf.rotation.y = sz * 0.18;
    if (high)
      for (const y of [0.4, 1.0])
        gate.box("leaf-strap", [half + 0.5, y, sz * (wide - 0.1)], [0.95, 0.05, 0.08], "iron");
  }
  const model = gate.finish();
  const outer = new ModelKit("lych-gate");
  outer.attach(model, [0, 0, 0]);
  model.group.rotation.y = -HALF_PI;
  return compactModel(outer.finish());
}
