import { compactModel } from "../compactModel";
import { HouseDetailKit } from "./houseDetailKit";
import type { ModelKit, Position, Surface } from "./modelKit";

function bench(k: ModelKit, x: number, z: number, w: number, d: number, y: number) {
  for (let i = 0; i < 5; i++)
    k.box("joined-worktop-board", [x, y, z - d / 2 + ((i + 0.5) * d) / 5], [w, 0.1, d / 5 - 0.008], "wood");
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1])
      k.box("splayed-bench-leg", [x + sx * (w / 2 - 0.16), y / 2, z + sz * (d / 2 - 0.12)], [0.12, y, 0.12], "oak");
    k.beam(
      "end-stretcher",
      [x + sx * (w / 2 - 0.16), 0.27, z - d / 2 + 0.12],
      [x + sx * (w / 2 - 0.16), 0.27, z + d / 2 - 0.12],
      0.09
    );
  }
  k.beam("long-bench-stretcher", [x - w / 2 + 0.16, 0.27, z], [x + w / 2 - 0.16, 0.27, z], 0.09);
}

function roll(k: ModelKit, p: Position, surface: Surface) {
  const body = k.cylinder("cloth-bolt", p, 0.16, 0.85, surface, 0.16, 24);
  body.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const end = k.ring("rolled-selvedge", [p[0] + side * 0.428, p[1], p[2]], 0.11, 0.012, "white", true);
    end.rotation.y = Math.PI / 2;
    k.beam("bolt-core", [p[0] + side * 0.41, p[1], p[2]], [p[0] + side * 0.48, p[1], p[2]], 0.05, "wood", true);
  }
}

export function addTextileLoom(k: ModelKit, detail: "low" | "high" = "high") {
  for (const x of [-1.12, 1.12]) {
    k.box("loom-foot", [x, 0.1, 0.15], [0.28, 0.2, 2.35], "oak");
    for (const z of [-0.85, 0.85]) {
      k.box("mortised-loom-post", [x, 1.18, z], [0.17, 2.2, 0.17], "oak");
      k.beam("loom-foot-brace", [x, 0.2, z + (z < 0 ? -0.25 : 0.25)], [x, 0.7, z], 0.09);
      k.beam("joint-peg", [x - 0.11, 2.12, z], [x + 0.11, 2.12, z], 0.025, "wood", true);
    }
    k.beam("loom-side-rail", [x, 2.22, -0.85], [x, 2.22, 0.85], 0.15);
  }
  for (const z of [-0.85, 0.85]) k.beam("loom-top-crossrail", [-1.15, 2.22, z], [1.15, 2.22, z], 0.17);
  for (const [y, z] of [
    [1.5, -0.85],
    [0.93, 0.85]
  ]) {
    k.beam("rotating-cloth-beam", [-1.23, y, z], [1.23, y, z], 0.19, "wood", true);
    for (const x of [-1.2, 1.2]) {
      const wheel = k.ring("beam-ratchet-rim", [x, y, z], 0.18, 0.026, "oak", true);
      wheel.rotation.y = Math.PI / 2;
      for (let t = 0; t < 12; t++) {
        const a = (t * Math.PI) / 6;
        k.box("ratchet-tooth", [x, y + Math.cos(a) * 0.19, z + Math.sin(a) * 0.19], [0.07, 0.045, 0.045], "wood");
      }
    }
  }
  const threads = detail === "high" ? 48 : 12;
  for (let i = 0; i < threads; i++) {
    const x = -0.96 + (i * 1.92) / (threads - 1);
    k.tube(
      "separated-warp-thread",
      [
        [x, 1.59, -0.85],
        [x, i % 2 ? 1.3 : 1.43, 0],
        [x, 1.04, 0.72]
      ],
      0.006,
      "white"
    );
    for (const z of [-0.18, 0.12]) k.beam("heddle-loop", [x, 1.12, z], [x, 1.66, z], 0.005, "cloth", true);
    k.beam("reed-dent", [x, 0.98, 0.48], [x, 1.38, 0.48], 0.009, "wood");
  }
  for (const z of [-0.18, 0.12]) {
    for (const y of [1.12, 1.66]) k.beam("heddle-shaft", [-1.02, y, z], [1.02, y, z], 0.055);
    for (const x of [-0.7, 0.7])
      k.tube(
        "heddle-suspension",
        [
          [x, 1.66, z],
          [x, 2.15, z],
          [x, 2.15, z + 0.24],
          [x, 0.27, 0.25]
        ],
        0.012,
        "cloth"
      );
  }
  for (const y of [0.98, 1.38]) k.beam("beater-frame", [-1.05, y, 0.48], [1.05, y, 0.48], 0.065);
  for (const x of [-0.45, 0.45]) k.beam("pivoted-treadle", [x, 0.16, -0.7], [x, 0.23, 1.1], 0.09);
  for (let row = 0; row < (detail === "high" ? 22 : 6); row++)
    k.box("woven-weft", [0, 1.045, 0.51 + row * 0.01], [1.94, 0.012, 0.008], row % 4 === 0 ? "white" : "cloth");
  k.box("cloth-fall", [0, 0.75, 0.96], [1.94, 0.48, 0.025], "cloth");
  const shuttle = k.sphere("boat-shuttle", [0.4, 1.08, 0.65], [0.21, 0.035, 0.055], "wood");
  shuttle.rotation.y = 0.3;
  k.beam("shuttle-bobbin", [0.29, 1.115, 0.65], [0.5, 1.115, 0.65], 0.022, "white", true);
  bench(k, 0, 1.85, 2.1, 0.4, 0.48);
}

export function shears(k: ModelKit, x: number, y: number, z: number) {
  // A bent spring joins two blades; no modern finger-ring scissors.
  k.tube(
    "spring-shear-bow",
    [
      [x - 0.22, y, z - 0.03],
      [x - 0.4, y, z - 0.13],
      [x - 0.45, y, z],
      [x - 0.4, y, z + 0.13],
      [x - 0.22, y, z + 0.03]
    ],
    0.018,
    "iron"
  );
  for (const side of [-1, 1])
    k.beam("shear-blade", [x - 0.22, y, z + side * 0.03], [x + 0.32, y, z + side * 0.1], 0.028, "iron");
}

export function createHighTextileWorkshop(kind: "weaver" | "tailor" | "cobbler") {
  const k = new HouseDetailKit(`${kind}-workshop-high`);
  k.box("workshop-foundation", [0, 0.06, -0.7], [6.6, 0.12, 4.8], "stone");
  k.facade("rear-infill", 0, -3.1, 6.4, 3, Math.PI, [{ u: 0, base: 1.3, width: 1.5, height: 0.9, kind: "window" }]);
  for (const x of [-3.2, 3.2]) {
    k.facade("short-side-return", x, -2, 2.2, 3, x < 0 ? -Math.PI / 2 : Math.PI / 2, [], "plaster");
    for (const z of [-3.05, 1.6]) {
      k.box("chamfered-frame-post", [x, 1.56, z], [0.18, 3, 0.18], "oak");
      k.beam("pegged-knee-brace", [x, 2.35, z], [x + (x < 0 ? 0.65 : -0.65), 3, z], 0.11);
      k.beam("brace-peg", [x, 2.5, z - 0.12], [x, 2.5, z + 0.12], 0.026, "wood", true);
    }
  }
  for (const z of [-3.05, 1.6]) k.box("front-wall-plate", [0, 3.05, z], [6.6, 0.18, 0.2], "oak");
  k.roofCover(0, -0.7, 6.4, 4.6, 3.15, 1.25, "wood");
  for (const x of [-2.7, 0, 2.7]) {
    k.beam("truss-tie", [x, 3.1, -3], [x, 3.1, 1.6], 0.14);
    for (const z of [-3, 1.6]) k.beam("principal-rafter", [x, 3.15, z], [x, 4.35, -0.7], 0.12);
  }
  if (kind === "weaver") {
    addTextileLoom(k);
    bench(k, -2.25, -1.9, 1.2, 0.7, 0.85);
    for (let i = 0; i < 3; i++) roll(k, [-2.25, 1.06 + i * 0.29, -1.9], i % 2 ? "white" : "cloth");
    k.box("spindle-rack-base", [2.4, 0.16, -0.975], [0.38, 0.08, 1.45], "wood");
    for (let i = 0; i < 4; i++) {
      k.cylinder("yarn-spindle", [2.4, 0.5, -1.5 + i * 0.35], 0.07, 0.6, "white");
      k.cylinder("spindle-shaft", [2.4, 0.53, -1.5 + i * 0.35], 0.018, 0.85, "wood");
    }
  } else if (kind === "tailor") {
    bench(k, 0, 0.25, 3.25, 1.45, 0.9);
    k.box("cut-cloth", [-0.3, 0.966, 0.25], [2.2, 0.025, 1.15], "cloth");
    for (let i = 0; i < 18; i++)
      k.box("selvedge-stitch", [-1.32 + i * 0.12, 0.982, 0.77], [0.035, 0.006, 0.012], "white");
    shears(k, 0.8, 1, 0.25);
    k.beam("measuring-rod", [-1.2, 1, -0.22], [0.5, 1, -0.22], 0.035, "wood");
    for (let i = 0; i < 12; i++) k.box("rod-division", [-1.1 + i * 0.13, 1.021, -0.22], [0.008, 0.004, 0.035], "dark");
    bench(k, -2.25, -1.75, 1.3, 0.9, 0.75);
    for (let i = 0; i < 5; i++)
      k.box("folded-cloth-stock", [-2.25, 0.88 + i * 0.11, -1.75], [1.05, 0.095, 0.7], i % 2 ? "white" : "cloth");
    for (const x of [1, 2.8]) k.box("garment-rail-post", [x, 1.2, -2], [0.1, 2.2, 0.1]);
    k.beam("garment-pole", [0.9, 2.3, -2], [2.9, 2.3, -2], 0.08, "wood", true);
    for (let i = 0; i < 3; i++) {
      const x = 1.3 + i * 0.57;
      k.tube(
        "cloth-hanging-loop",
        [
          [x - 0.05, 2.02, -2],
          [x, 2.35, -2],
          [x + 0.05, 2.02, -2]
        ],
        0.015,
        "cloth"
      );
      k.box("tunic-body", [x, 1.48, -2], [0.45, 1.05, 0.055], i % 2 ? "white" : "cloth");
      for (const side of [-1, 1])
        k.beam("tunic-sleeve", [x + side * 0.18, 1.92, -2], [x + side * 0.34, 1.57, -2], 0.15, "cloth");
      k.beam("tunic-neck-slit", [x, 2, -1.969], [x, 1.86, -1.969], 0.012, "dark");
    }
  } else {
    bench(k, 0, 0.2, 3.1, 1.4, 0.78);
    k.box("cutting-hide", [-0.65, 0.844, 0.15], [1.35, 0.025, 0.9], "leather");
    for (const [x, z] of [
      [-1.15, -0.35],
      [-0.22, 0.63]
    ])
      k.sphere("hide-lobe", [x, 0.845, z], [0.24, 0.015, 0.16], "leather");
    for (let i = 0; i < 3; i++) {
      const x = -0.8 + i * 0.75;
      k.sphere("wooden-shoe-last", [x, 0.93, 0.25], [0.25, 0.085, 0.1], "wood");
      k.sphere("last-instep", [x + 0.1, 0.985, 0.25], [0.095, 0.11, 0.085], "wood");
      k.box("last-flat-sole", [x, 0.86, 0.25], [0.41, 0.025, 0.16], "oak");
    }
    shears(k, 0.85, 0.86, -0.28);
    k.beam("awl-handle", [0.7, 0.86, 0.65], [1, 0.86, 0.65], 0.07, "wood", true);
    k.beam("awl-needle", [1, 0.86, 0.65], [1.15, 0.86, 0.65], 0.012, "iron", true);
    bench(k, 0, 1.6, 0.65, 0.55, 0.4);
    bench(k, 2.1, -1.7, 1.2, 0.65, 0.85);
    for (let i = 0; i < 3; i++) {
      const x = 1.75 + i * 0.34;
      k.sphere("leather-shoe-upper", [x, 1, -1.7], [0.12, 0.09, 0.23], "leather");
      k.box("sewn-shoe-sole", [x, 0.92, -1.7], [0.23, 0.025, 0.43], "dark");
      for (let j = 0; j < 8; j++)
        k.sphere("sole-stitch", [x + 0.116, 0.94, -1.88 + j * 0.05], [0.008, 0.008, 0.012], "white");
    }
    for (let i = 0; i < 4; i++) k.box("leather-stock", [-2.2, 0.3 + i * 0.07, -1.8], [1, 0.055, 0.7], "leather");
    k.box("stock-plinth", [-2.2, 0.15, -1.8], [1.1, 0.3, 0.8], "wood");
  }
  return compactModel(k.finish());
}
