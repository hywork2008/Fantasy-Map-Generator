import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { compactModel } from "../compactModel";
import { ModelKit } from "../medieval/modelKit";

export type SquarePropDetail = "low" | "high";
const OCT = Math.PI / 8;
const circumradius = (apothem: number) => apothem / Math.cos(OCT);

/** An eight-sided slab whose flats face the axes; `apothem` is the distance from the centre to a flat. */
function octagon(k: ModelKit, name: string, y: number, apothem: number, height: number, top = apothem) {
  const mesh = k.cylinder(name, [0, y + height / 2, 0], circumradius(apothem), height, "stone", circumradius(top), 8);
  mesh.rotation.y = OCT;
  return mesh as THREE.Mesh;
}

function steps(k: ModelKit, apothems: readonly number[], rise: number, detail: SquarePropDetail) {
  apothems.forEach((apothem, i) => {
    octagon(k, "market-step", i * rise, apothem, rise);
    // A chamfered nosing and a mortar joint on every step in High; Low keeps the bare tread.
    if (detail === "high") {
      octagon(k, "step-nosing", (i + 1) * rise - 0.04, apothem - 0.03, 0.04);
      k.box("step-joint", [0, i * rise + rise / 2, 0], [apothem * 2 + 0.01, 0.012, 0.012], "white");
      k.box("step-joint", [0, i * rise + rise / 2, 0], [0.012, 0.012, apothem * 2 + 0.01], "white");
    }
  });
}

/** Pillory post with a hinged three-hole board, and a set of stocks, on a low stone platform. */
export function createPilloryAndStocks(detail: SquarePropDetail): CityStructureMeshes {
  const k = new ModelKit("pillory-and-stocks");
  const high = detail === "high";
  k.box("platform", [0, 0.1, 0], [4.6, 0.2, 2.8], "stone");
  if (high)
    for (const x of [-1.5, -0.75, 0, 0.75, 1.5]) k.box("paving-joint", [x, 0.205, 0], [0.02, 0.01, 2.8], "white");
  // Stocks: two posts, a fixed lower board, a hinged upper board, each with two leg holes, and a bench.
  const sx = -1.05;
  for (const side of [-1, 1]) {
    k.box("stocks-post", [sx + side * 0.95, 0.2 + 0.55, -0.4], [0.16, 1.1, 0.18], "oak");
    k.box("post-foot", [sx + side * 0.95, 0.26, -0.4], [0.3, 0.12, 0.34], "oak");
  }
  k.box("stocks-lower-board", [sx, 0.62, -0.4], [1.9, 0.18, 0.14], "oak");
  k.box("stocks-upper-board", [sx, 0.8, -0.4], [1.9, 0.18, 0.14], "oak");
  for (const x of [-0.32, 0.32]) {
    k.cylinder("leg-hole", [sx + x, 0.71, -0.4], 0.1, 0.38, "dark", 0.1, high ? 12 : 6).rotation.x = Math.PI / 2;
  }
  k.box("stocks-bench", [sx, 0.42, 0.2], [1.7, 0.1, 0.42], "wood");
  for (const x of [-0.7, 0.7]) k.box("bench-leg", [sx + x, 0.32, 0.2], [0.1, 0.2, 0.36], "wood");
  if (high) {
    for (const x of [-0.8, 0.8]) k.box("stocks-hinge", [sx + x, 0.71, -0.31], [0.07, 0.38, 0.03], "iron");
    k.box("stocks-hasp", [sx + 0.8, 0.71, -0.31], [0.12, 0.1, 0.03], "iron");
    k.ring("stocks-padlock", [sx + 0.8, 0.62, -0.3], 0.045, 0.014, "iron", true);
  }
  // Pillory: a tall post with a hinged board pierced for the head and both hands.
  const px = 1.45;
  k.box("pillory-post", [px, 0.2 + 1.2, 0.25], [0.24, 2.4, 0.24], "oak");
  k.box("pillory-foot", [px, 0.26, 0.25], [0.6, 0.12, 0.6], "oak");
  for (const side of [-1, 1])
    k.beam("pillory-brace", [px, 0.5, 0.25 + side * 0.07], [px + side * 0.45, 0.28, 0.25 + side * 0.4], 0.09);
  const boardY = 1.55;
  k.box("pillory-lower-board", [px, boardY - 0.08, 0.25], [0.2, 0.14, 1.3], "oak");
  k.box("pillory-upper-board", [px, boardY + 0.08, 0.25], [0.2, 0.14, 1.3], "oak");
  for (const z of [-0.4, 0, 0.4])
    k.cylinder(
      "pillory-hole",
      [px, boardY, 0.25 + z],
      z === 0 ? 0.11 : 0.075,
      0.3,
      "dark",
      z === 0 ? 0.11 : 0.075,
      high ? 12 : 6
    );
  if (high) {
    k.box("pillory-hinge", [px, boardY, 0.25 - 0.62], [0.24, 0.3, 0.04], "iron");
    k.box("pillory-hasp", [px, boardY, 0.25 + 0.62], [0.24, 0.3, 0.04], "iron");
    k.ring("pillory-padlock", [px, boardY - 0.2, 0.25 + 0.64], 0.05, 0.015, "iron", true);
    k.box("pillory-cap", [px, 2.62, 0.25], [0.34, 0.1, 0.34], "oak");
    k.box("notice-board", [px - 0.14, 2.0, 0.25], [0.04, 0.4, 0.3], "wood");
    for (const z of [0.12, 0.38]) k.sphere("notice-nail", [px - 0.17, 2.1, z], [0.014, 0.014, 0.014], "iron");
  }
  return compactModel(k.finish());
}

/** A stone cross on a socket stone and three octagonal steps. */
export function createSteppedMarketCross(detail: SquarePropDetail): CityStructureMeshes {
  const k = new ModelKit("stepped-market-cross");
  const high = detail === "high",
    rise = 0.3;
  steps(k, [1.8, 1.4, 1.0], rise, detail);
  const base = rise * 3;
  octagon(k, "socket-stone", base, 0.5, 0.55, 0.42);
  const shaftBase = base + 0.55;
  k.cylinder("cross-shaft", [0, shaftBase + 1.35, 0], 0.26, 2.7, "stone", 0.17, 8).rotation.y = OCT;
  if (high)
    for (const y of [0.55, 1.5, 2.45]) {
      k.ring("shaft-band", [0, shaftBase + y, 0], 0.25 - y * 0.03, 0.025, "stone");
    }
  const top = shaftBase + 2.7;
  k.box("cross-capital", [0, top + 0.1, 0], [0.42, 0.2, 0.42], "stone");
  k.box("cross-upright", [0, top + 0.7, 0], [0.26, 1.1, 0.2], "stone");
  k.box("cross-arms", [0, top + 0.82, 0], [0.9, 0.26, 0.2], "stone");
  if (high) {
    for (const x of [-0.5, 0.5]) k.box("arm-terminal", [x, top + 0.82, 0], [0.12, 0.38, 0.22], "stone");
    k.box("upright-terminal", [0, top + 1.3, 0], [0.38, 0.12, 0.22], "stone");
    k.box("cross-chamfer", [0, top + 0.82, 0.105], [0.9, 0.04, 0.02], "white");
  }
  return compactModel(k.finish());
}

/** An open eight-pier pavilion on stepped octagonal base, vaulted inside and roofed in tile. */
export function createCanopiedMarketCross(detail: SquarePropDetail): CityStructureMeshes {
  const k = new ModelKit("canopied-market-cross");
  const high = detail === "high",
    rise = 0.25;
  steps(k, [2.9, 2.5, 2.1], rise, detail);
  const floor = rise * 3,
    pier = 1.75,
    height = 3.2,
    capY = floor + height;
  const corners = Array.from({ length: 8 }, (_, i): [number, number] => {
    const angle = OCT + i * (Math.PI / 4);
    return [Math.cos(angle) * pier, Math.sin(angle) * pier];
  });
  for (const [x, z] of corners) {
    k.box("market-pier", [x, floor + height / 2, z], [0.42, height, 0.42], "stone");
    k.box("pier-capital", [x, capY + 0.1, z], [0.56, 0.2, 0.56], "stone");
    if (high) {
      k.box("pier-base", [x, floor + 0.15, z], [0.54, 0.3, 0.54], "stone");
      k.box("pier-moulding", [x, floor + height * 0.62, z], [0.46, 0.05, 0.46], "white");
    }
  }
  for (let i = 0; i < 8; i++) {
    const [ax, az] = corners[i],
      [bx, bz] = corners[(i + 1) % 8];
    k.beam("market-lintel", [ax, capY + 0.38, az], [bx, capY + 0.38, bz], 0.3, "stone");
    if (high) {
      // Cusped arch infill between piers: a pair of stone beams meeting at a point under the lintel.
      const mx = (ax + bx) / 2,
        mz = (az + bz) / 2;
      k.beam("arch-haunch", [ax, capY - 0.15, az], [mx, capY - 0.7, mz], 0.14, "stone");
      k.beam("arch-haunch", [bx, capY - 0.15, bz], [mx, capY - 0.7, mz], 0.14, "stone");
    }
  }
  // Central column that carries the vault and the roof's king post.
  k.cylinder("central-column", [0, floor + (height + 0.4) / 2, 0], 0.3, height + 0.4, "stone", 0.26, 8).rotation.y =
    OCT;
  octagon(k, "central-base", floor, 0.4, 0.4);
  if (high) {
    for (const [x, z] of corners) k.beam("vault-rib", [0, capY + 0.3, 0], [x, capY + 0.1, z], 0.1, "stone");
    k.box("central-boss", [0, capY + 0.38, 0], [0.5, 0.14, 0.5], "stone");
  }
  const eave = capY + 0.55,
    roofRise = 2.4;
  const roof = k.add("pavilion-roof", new THREE.ConeGeometry(circumradius(2.5), roofRise, 8), "tile");
  roof.position.set(0, eave + roofRise / 2, 0);
  roof.rotation.y = OCT;
  if (high)
    for (let i = 0; i < 8; i++) {
      const angle = i * (Math.PI / 4),
        r = circumradius(2.5);
      k.beam(
        "roof-hip",
        [Math.cos(angle) * r, eave + 0.02, Math.sin(angle) * r],
        [0, eave + roofRise, 0],
        0.08,
        "stone"
      );
    }
  const apex = eave + roofRise;
  k.cylinder("finial-ball", [0, apex + 0.12, 0], 0.14, 0.24, "stone", 0.1, 8);
  k.beam("finial-cross", [0, apex + 0.2, 0], [0, apex + 1, 0], 0.07, "iron");
  k.beam("finial-cross-arm", [-0.26, apex + 0.72, 0], [0.26, apex + 0.72, 0], 0.07, "iron");
  return compactModel(k.finish());
}
