import { compactModel } from "../compactModel";
import { house } from "./dwellingShell";
import { HouseDetailKit } from "./houseDetailKit";

export type { ShopHouseKind } from "./shopHouseComponents";
export { createHighShopHouse } from "./shopHouseParts";

export type DwellingKind = "half-timber-farmhouse" | "stone-cottage" | "plastered-small-house";

function woodshed(k: HouseDetailKit, x: number, z: number, w: number, d: number) {
  for (const xx of [x - w / 2, x + w / 2])
    for (const zz of [z - d / 2, z + d / 2]) {
      k.box("shed-stone-foot", [xx, 0.1, zz], [0.3, 0.2, 0.3], "stone");
      k.box("shed-post", [xx, 1.1, zz], [0.12, 2.1, 0.12]);
      k.beam("shed-knee-brace", [xx, 1.6, zz], [xx - Math.sign(xx - x) * 0.4, 2.1, zz], 0.09);
    }
  k.roofCover(x, z, w, d, 2.2, 0.65, "wood");
  for (let layer = 0; layer < 5; layer++)
    for (let log = 0; log < 5; log++) {
      const y = 0.18 + layer * 0.17,
        zz = z - d * 0.25 + log * 0.24;
      k.beam("stacked-firewood", [x - w * 0.3, y, zz], [x + w * 0.3, y, zz], 0.15, "wood", true);
      const growth = k.ring("firewood-growth-ring", [x + w * 0.3 + 0.008, y, zz], 0.045, 0.005, "oak", true);
      growth.rotation.y = Math.PI / 2;
    }
}

export function createHighDwelling(kind: DwellingKind) {
  const k = new HouseDetailKit(`${kind}-high`);
  if (kind === "half-timber-farmhouse") {
    house(k, {
      x: -1,
      z: -1,
      w: 7,
      d: 6,
      eave: 5.1,
      rise: 2,
      openings: [
        { u: 0, base: 0.25, width: 1.05, height: 2.05, kind: "door" },
        ...[-2.2, 2.2].flatMap(u =>
          [1.2, 3.5].map(base => ({ u, base, width: 0.8, height: 0.95, kind: "window" as const }))
        )
      ]
    });
    k.chimneyStack(-2, -2, 7.6, 4.6);
    woodshed(k, 3.7, -1, 2.3, 4);
    k.fence([-4, 3], [-4, 5], 0.9);
    k.fence([-4, 5], [1, 5], 0.9);
    for (let bed = 0; bed < 5; bed++) {
      const x = -3.4 + bed;
      k.box("raised-garden-bed", [x, 0.07, 4], [0.5, 0.14, 1.5], "earth");
      for (const side of [-1, 1]) k.box("bed-edging", [x + side * 0.25, 0.12, 4], [0.035, 0.24, 1.55], "wood");
      for (let plant = 0; plant < 6; plant++) {
        const z = 3.4 + plant * 0.23;
        k.sphere("kitchen-garden-leaves", [x, 0.23, z], [0.12, 0.1, 0.1], "green");
        k.beam("vegetable-leaf-vein", [x - 0.08, 0.27, z], [x + 0.08, 0.27, z], 0.009, "straw");
      }
    }
  } else if (kind === "stone-cottage") {
    house(k, {
      x: -1,
      z: 0,
      w: 6.5,
      d: 5,
      eave: 2.5,
      rise: 1.7,
      stone: true,
      framed: false,
      cover: "thatch",
      openings: [
        { u: 0, base: 0.25, width: 1, height: 1.95, kind: "door" },
        ...[-2.15, 2.15].map(u => ({ u, base: 1.2, width: 0.7, height: 0.8, kind: "window" as const }))
      ]
    });
    k.chimneyStack(-2, -1, 5.3, 2.9);
    woodshed(k, 3.7, 0, 2.6, 3.5);
  } else {
    house(k, {
      x: 0,
      z: 0,
      w: 4.5,
      d: 4.3,
      eave: 4.6,
      rise: 1.5,
      framed: false,
      openings: [
        { u: 0.65, base: 0.25, width: 0.95, height: 1.95, kind: "door" },
        { u: -1.15, base: 1.25, width: 0.75, height: 0.9, kind: "window" },
        ...[-1.2, 1.2].map(u => ({ u, base: 3.3, width: 0.75, height: 0.95, kind: "window" as const }))
      ]
    });
    for (const z of [-2.15, 2.15]) k.box("plaster-storey-band", [0, 2.6, z], [4.6, 0.16, 0.2], "white");
    k.chimneyStack(1, -1, 6.5, 4.6);
    // The rear annex shares the main rear wall, with a distinct outward-facing service door.
    k.box("annex-floor", [0, 0.1, -2.8], [3, 0.2, 1.5], "stone");
    k.facade(
      "annex-rear",
      0,
      -3.55,
      3,
      2,
      Math.PI,
      [{ u: 0, base: 0.22, width: 0.8, height: 1.6, kind: "door" }],
      "stone"
    );
    for (const x of [-1.5, 1.5]) k.facade("annex-side", x, -2.8, 1.5, 2, (Math.sign(x) * Math.PI) / 2, [], "stone");
    k.roofCover(0, -2.8, 3, 1.5, 2.1, 0.5, "wood");
  }
  return compactModel(k.finish());
}
