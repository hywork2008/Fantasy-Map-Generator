import { compactModel } from "../compactModel";
import { HouseDetailKit } from "./houseDetailKit";

export function createHighLivestockMarket() {
  const k = new HouseDetailKit("livestock-market-pens-high"),
    posts = new Set<string>();
  k.box("market-compacted-earth", [0, 0.025, 0], [12.2, 0.05, 8.2], "earth");
  const post = (x: number, z: number) => {
    const key = `${x.toFixed(4)}:${z.toFixed(4)}`;
    if (posts.has(key)) return;
    posts.add(key);
    k.box("split-oak-fence-post", [x, 0.71, z], [0.15, 1.42, 0.15]);
    const cap = k.cylinder("fence-post-weather-cap", [x, 1.465, z], 0.107, 0.09, "oak", 0, 4);
    cap.rotation.y = Math.PI / 4;
    for (const y of [0.35, 0.85, 1.28])
      k.cylinder("drawbore-fence-peg", [x, y, z + 0.09], 0.017, 0.035, "wood", 0.017, 8).rotation.x = Math.PI / 2;
  };
  const fence = (a: readonly [number, number], b: readonly [number, number]) => {
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]),
      count = Math.max(1, Math.ceil(length / 1.2));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      post(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
    }
    for (const y of [0.35, 0.85, 1.28]) {
      k.beam("mortised-pen-rail", [a[0], y, a[1]], [b[0], y, b[1]], 0.095, "wood");
      k.beam("rail-split-grain", [a[0], y + 0.015, a[1] + 0.052], [b[0], y + 0.025, b[1] + 0.052], 0.005, "oak");
    }
  };
  for (const side of [-1, 1]) {
    const outer = side * 6,
      inner = side * 1.2;
    fence([outer, -4], [outer, 4]);
    for (const z of [-4, 0, 4]) fence([Math.min(inner, outer), z], [Math.max(inner, outer), z]);
    // Each pen has its own opening onto the buyers' passage.
    for (const [a, b] of [
      [-4, -2.7],
      [-1.3, 1.3],
      [2.7, 4]
    ])
      fence([inner, a], [inner, b]);
    for (const centre of [-2, 2]) {
      const hingeZ = centre - 0.7;
      const point = (u: number, y: number): readonly [number, number, number] => [
        inner + side * u * Math.sin(1.2),
        y,
        hingeZ + u * Math.cos(1.2)
      ];
      for (const y of [0.3, 0.78, 1.26]) k.beam("open-pen-gate-rail", point(0.03, y), point(1.35, y), 0.085, "wood");
      for (const u of [0.03, 1.35]) k.beam("gate-end-stile", point(u, 0.2), point(u, 1.34), 0.09);
      k.beam("gate-compression-brace", point(0.08, 0.27), point(1.3, 1.24), 0.075);
      for (const y of [0.38, 1.15]) {
        k.cylinder("gate-hinge-pintle", [inner, y, hingeZ], 0.03, 0.18, "iron", 0.03, 12);
        k.beam("gate-strap-hinge", point(0, y), point(0.4, y), 0.035, "iron");
      }
      const latch = k.box("gate-timber-latch", point(1.27, 1.08), [0.3, 0.05, 0.055], "oak");
      latch.rotation.y = -side * 0.37;
      k.box("gate-latch-keeper", [inner, 1.08, centre + 0.7], [0.075, 0.17, 0.08], "iron");
    }
    // Separate covers leave the complete central passage open to the sky and free of posts.
    const cx = side * 3.6;
    for (const x of [cx - 1.85, cx + 1.85])
      for (const z of [-3.65, -1.35]) {
        const h = 2.55 + 0.7 * (1 - 1.15 / 1.55);
        k.box("pen-cover-stone-foot", [x, 0.09, z], [0.3, 0.18, 0.3], "stone");
        k.box("pen-cover-post", [x, (h + 0.14) / 2, z], [0.13, h - 0.14, 0.13]);
        k.beam("cover-knee-brace", [x, h - 0.5, z], [x - Math.sign(x - cx) * 0.4, h, z], 0.085);
      }
    for (const x of [cx - 1.85, cx + 1.85])
      for (const s of [-1, 1]) k.beam("cover-principal-rafter", [x, 2.55, -2.5 + s * 1.55], [x, 3.25, -2.5], 0.13);
    k.roofCover(cx, -2.5, 4, 2.5, 2.55, 0.7, "wood");
    for (const z of [-2.7, 2.7]) {
      const x = side * 5.35;
      k.box("manger-bottom", [x, 0.6, z], [0.58, 0.1, 1.2], "wood");
      for (const s of [-1, 1]) {
        k.box("manger-side", [x + s * 0.29, 0.8, z], [0.06, 0.4, 1.25], "wood");
        k.box("manger-end", [x, 0.8, z + s * 0.6], [0.58, 0.4, 0.06], "wood");
        k.box("manger-leg", [x, 0.28, z + s * 0.4], [0.1, 0.56, 0.1]);
      }
      for (let i = 0; i < 9; i++)
        k.beam(
          "fodder-in-manger",
          [x - 0.15, 0.72, z - 0.5 + i * 0.12],
          [x + 0.15, 0.88, z - 0.45 + i * 0.12],
          0.025,
          "straw",
          true
        );
    }
    const waterX = side * 3.3;
    k.box("stock-water-trough-bottom", [waterX, 0.16, -2.7], [2.2, 0.22, 0.74], "stone");
    for (const s of [-1, 1]) {
      k.box("stock-water-trough-long-wall", [waterX, 0.4, -2.7 + s * 0.37], [2.3, 0.45, 0.12], "stone");
      k.box("stock-water-trough-end", [waterX + s * 1.1, 0.4, -2.7], [0.12, 0.45, 0.74], "stone");
    }
    k.box("recessed-stock-water", [waterX, 0.47, -2.7], [2.05, 0.02, 0.6], "water");
  }
  return compactModel(k.finish());
}
