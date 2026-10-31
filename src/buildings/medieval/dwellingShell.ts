import type { HouseDetailKit, HouseOpening } from "./houseDetailKit";

function stoneDress(
  k: HouseDetailKit,
  x: number,
  z: number,
  w: number,
  h: number,
  angle: number,
  openings: readonly HouseOpening[]
) {
  for (let row = 0; row < Math.floor(h / 0.25); row++) {
    const base = row * 0.25,
      y = base + 0.125;
    for (let u = -w / 2; u < w / 2 - 0.01; u += 0.48) {
      let intervals: [number, number][] = [[u, Math.min(w / 2, u + 0.465)]];
      for (const o of openings) {
        if (base >= o.base + o.height || base + 0.25 <= o.base) continue;
        intervals = intervals.flatMap(([a, b]) => {
          const left = o.u - o.width / 2,
            right = o.u + o.width / 2;
          if (b <= left || a >= right) return [[a, b]];
          return [
            [a, Math.min(b, left)],
            [Math.max(a, right), b]
          ].filter(([a, b]) => b - a > 0.025) as [number, number][];
        });
      }
      for (const [a, b] of intervals) {
        const block = k.box(
          "rubble-stone-face",
          k.point(x, z, angle, (a + b) / 2, y, 0.018),
          [b - a, 0.232, 0.055],
          (row + Math.floor(u * 2)) % 5 === 0 ? "white" : "stone"
        );
        block.rotation.y = angle;
      }
    }
  }
}

export function house(
  k: HouseDetailKit,
  {
    x,
    z,
    w,
    d,
    eave,
    rise,
    stone = false,
    framed = true,
    cover = "tile",
    openings
  }: {
    x: number;
    z: number;
    w: number;
    d: number;
    eave: number;
    rise: number;
    stone?: boolean;
    framed?: boolean;
    cover?: "tile" | "thatch" | "wood";
    openings: readonly HouseOpening[];
  }
) {
  // A thin floor slab supports the shell; no solid mass is placed behind its openings.
  k.box("stone-plinth", [x, 0.1, z], [w, 0.2, d], "stone");
  const backWindows: HouseOpening[] = [
    { u: -w * 0.25, base: eave > 4 ? 3.25 : 1.2, width: 0.7, height: 0.8, kind: "window" }
  ];
  const sideWindows: HouseOpening[] = [{ u: 0, base: eave > 4 ? 3.2 : 1.25, width: 0.65, height: 0.8, kind: "window" }];
  for (const [xx, zz, width, angle, holes] of [
    [x, z + d / 2, w, 0, openings],
    [x, z - d / 2, w, Math.PI, backWindows],
    [x + w / 2, z, d, Math.PI / 2, sideWindows],
    [x - w / 2, z, d, -Math.PI / 2, sideWindows]
  ] as const) {
    k.facade("house-wall", xx, zz, width, eave, angle, holes, stone ? "stone" : "plaster");
    if (stone) stoneDress(k, xx, zz, width, eave, angle, holes);
    if (framed) k.frameWall(xx, zz, width, eave, angle, holes, eave > 4 ? 2.6 : 0.7);
  }
  if (eave > 4) {
    for (let xx = x - w / 2 + 0.16; xx < x + w / 2; xx += 0.32) {
      k.box("upper-floor-joist", [xx, 2.56, z], [0.14, 0.18, d - 0.22]);
      k.box("upper-floor-board", [xx, 2.69, z], [0.31, 0.08, d - 0.25], "wood");
    }
  }
  k.roofCover(x, z, w, d, eave + 0.12, rise, cover);
}
