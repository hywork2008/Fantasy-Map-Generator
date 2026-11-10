import type { HouseDetailKit } from "./houseDetailKit";
import type { ModelKit } from "./modelKit";

/** Open work sheds leave the street side free of walls and centre posts. */
export function addCraftShed(k: HouseDetailKit, x = 0, z = -0.8, w = 7, d = 4.4) {
  k.box("shed-footing", [x, 0.06, z], [w + 0.2, 0.12, d + 0.2], "stone");
  const back = z - d / 2,
    front = z + d / 2;
  k.facade("shed-rear-wall", x, back, w, 3, Math.PI, [{ u: 0, base: 1.35, width: 1.2, height: 0.85, kind: "window" }]);
  for (const side of [-1, 1]) {
    const xx = x + side * (w / 2 - 0.1);
    for (const zz of [back, front]) {
      k.box("stone-post-pad", [xx, 0.18, zz], [0.38, 0.36, 0.38], "stone");
      k.box("shed-post", [xx, 1.68, zz], [0.19, 2.72, 0.19], "oak");
      k.beam("shed-knee-brace", [xx, 2.3, zz], [xx - side * 0.72, 3.04, zz], 0.12);
      k.beam(
        "brace-pin",
        [xx - side * 0.16, 2.47, zz - 0.12],
        [xx - side * 0.16, 2.47, zz + 0.12],
        0.028,
        "wood",
        true
      );
    }
    k.beam("side-wall-plate", [xx, 3.03, back], [xx, 3.03, front], 0.18);
  }
  for (const zz of [back, front]) k.box("cross-wall-plate", [x, 3.04, zz], [w, 0.2, 0.2]);
  k.roofCover(x, z, w, d, 3.16, 1.2, "wood");
  for (const xx of [x - w / 2 + 0.22, x, x + w / 2 - 0.22]) {
    k.beam("tie-beam", [xx, 3.06, back], [xx, 3.06, front], 0.15);
    for (const zz of [back, front]) k.beam("principal-rafter", [xx, 3.16, zz], [xx, 4.36, z], 0.13);
    k.beam("king-post", [xx, 3.06, z], [xx, 4.36, z], 0.11);
  }
}

export function addCraftBench(k: ModelKit, x: number, z: number, w: number, d: number, top = 0.9) {
  for (let i = 0; i < 5; i++) {
    const zz = z - d / 2 + ((i + 0.5) * d) / 5;
    k.box("workbench-plank", [x, top - 0.06, zz], [w, 0.12, d / 5 - 0.006], "wood");
    for (const side of [-1, 1])
      k.cylinder("plank-dowel", [x + side * (w / 2 - 0.17), top + 0.001, zz], 0.013, 0.004, "oak", 0.013, 8);
  }
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1])
      k.box(
        "workbench-leg",
        [x + sx * (w / 2 - 0.18), (top - 0.12) / 2, z + sz * (d / 2 - 0.12)],
        [0.14, top - 0.12, 0.14]
      );
    k.beam(
      "bench-end-stretcher",
      [x + sx * (w / 2 - 0.18), 0.26, z - d / 2 + 0.12],
      [x + sx * (w / 2 - 0.18), 0.26, z + d / 2 - 0.12],
      0.1
    );
  }
  k.beam("bench-long-stretcher", [x - w / 2 + 0.18, 0.26, z], [x + w / 2 - 0.18, 0.26, z], 0.12);
}
