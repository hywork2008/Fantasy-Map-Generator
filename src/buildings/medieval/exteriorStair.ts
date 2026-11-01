import { compactModel } from "../compactModel";
import { ModelKit } from "./modelKit";

export interface ExteriorStairOptions {
  rise: number;
  run: number;
  width: number;
  landingDepth: number;
  doorWidth: number;
}

/** Local +Z descends; the doorway joins the landing's -X edge at Z=0. */
export function exteriorStairLayout(options: ExteriorStairOptions) {
  const { rise, run, width, landingDepth, doorWidth } = options;
  if (
    ![rise, run, width, landingDepth, doorWidth].every(v => Number.isFinite(v) && v > 0) ||
    landingDepth < doorWidth + 0.3 ||
    width < 0.9
  )
    throw new Error("Invalid exterior stair dimensions or doorway clearance");
  const steps = Math.ceil(rise / 0.19),
    landingWidth = width + 0.3;
  if (run / steps < 0.25) throw new Error("Exterior stair treads are too short");
  return {
    steps,
    landingWidth,
    doorway: { position: [-landingWidth / 2, rise, 0] as const, width: doorWidth, height: 2.1 },
    footprint: { minX: -landingWidth / 2, maxX: landingWidth / 2, minZ: -landingDepth / 2, maxZ: run + 0.2 },
    // No wall-side rail or post is allowed in this landing passage.
    passage: { minZ: -doorWidth / 2, maxZ: doorWidth / 2, base: rise, height: 2.1 }
  };
}

/** Self-contained flight, supported landing and guards, regenerated from dimensions. */
export function createExteriorStair(options: ExteriorStairOptions) {
  const { rise, run, width, landingDepth, doorWidth } = options;
  const layout = exteriorStairLayout(options),
    k = new ModelKit("shared-exterior-stair-high");
  const edge = width / 2 - 0.03,
    start = 0.2,
    railHeight = 0.95;
  const railEnd = Math.max(doorWidth / 2 + 0.12, landingDepth / 2 - 0.1);
  const footZ = start + run - run / layout.steps / 2;
  for (let i = 0; i < layout.steps; i++) {
    const y = ((i + 1) * rise) / layout.steps,
      z = start + run - ((i + 0.5) * run) / layout.steps;
    k.box("solid-exterior-stair", [0, y / 2, z], [width, y, run / layout.steps + 0.006], "stone");
    if (i % 3 === 0 && z > railEnd)
      for (const side of [-1, 1])
        k.box("stair-rail-post", [side * edge, y + railHeight / 2, z], [0.075, railHeight, 0.075], "oak");
  }
  k.box("upper-stair-landing", [0, rise - 0.09, 0], [layout.landingWidth, 0.18, landingDepth], "stone");
  for (const x of [-width / 2 + 0.11, width / 2 - 0.11])
    k.box("landing-support-pier", [x, (rise - 0.18) / 2, 0], [0.23, rise - 0.18, 0.35], "stone");
  for (const side of [-1, 1]) {
    k.beam(
      "flight-handrail",
      [side * edge, rise / layout.steps + railHeight, footZ],
      [side * edge, rise + railHeight, railEnd],
      0.08,
      "wood"
    );
    k.box("top-flight-rail-post", [side * edge, rise + railHeight / 2, railEnd], [0.075, railHeight, 0.075], "oak");
  }
  // The outer and rear guards protect the landing while its wall side stays open to the door.
  const rear = -landingDepth / 2 + 0.06,
    outer = layout.landingWidth / 2 - 0.06;
  for (const z of [rear, railEnd])
    k.box("outer-landing-post", [outer, rise + railHeight / 2, z], [0.085, railHeight, 0.085], "oak");
  k.beam("landing-rail-return", [edge, rise + railHeight, railEnd], [outer, rise + railHeight, railEnd], 0.08, "wood");
  k.beam("outer-landing-guard", [outer, rise + railHeight, rear], [outer, rise + railHeight, railEnd], 0.08, "wood");
  k.beam("rear-landing-guard", [-outer, rise + railHeight, rear], [outer, rise + railHeight, rear], 0.08, "wood");
  for (const x of [-outer, 0])
    k.box("rear-landing-post", [x, rise + railHeight / 2, rear], [0.085, railHeight, 0.085], "oak");
  return compactModel(k.finish());
}
