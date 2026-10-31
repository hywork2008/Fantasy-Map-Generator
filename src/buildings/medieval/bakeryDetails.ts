import * as THREE from "three";
import { compactModel } from "../compactModel";
import { HouseDetailKit, type HouseOpening } from "./houseDetailKit";

export type BakeryKind = "bread-bakehouse" | "town-bakery" | "communal-bread-oven";

/** Hollow dome with a cutaway front sector hidden by an independently arched throat. */
function oven(k: HouseDetailKit, x: number, z: number, chimneyTop = 2.9) {
  k.box("oven-foundation", [x, 0.405, z], [2.2, 0.81, 2], "stone");
  for (let row = 0; row < 3; row++)
    for (const side of [-1, 1])
      k.box("foundation-mortar-course", [x, 0.18 + row * 0.25, z + side * 1.006], [2.18, 0.016, 0.014], "white");
  k.box("baking-hearth", [x, 0.83, z], [1.8, 0.06, 1.65], "dark");
  const positions: number[] = [],
    indices: number[] = [];
  const latitude = 12,
    longitude = 64;
  for (const inner of [false, true]) {
    const rx = inner ? 0.78 : 1,
      ry = inner ? 0.68 : 0.9,
      rz = inner ? 0.72 : 0.93;
    for (let row = 0; row < latitude; row++)
      for (let segment = 0; segment < longitude; segment++) {
        const theta = ((segment + 0.5) * Math.PI * 2) / longitude,
          phi = ((row + 0.5) * Math.PI) / 2 / latitude;
        if (Math.cos(theta) > Math.cos(0.72) && phi < 0.9) continue;
        const start = positions.length / 3;
        for (const [r, s] of [
          [row, segment],
          [row, segment + 1],
          [row + 1, segment + 1],
          [row + 1, segment]
        ]) {
          const p = (r * Math.PI) / 2 / latitude,
            a = (s * Math.PI * 2) / longitude;
          positions.push(
            x + rx * Math.cos(p) * Math.sin(a),
            0.85 + ry * Math.sin(p),
            z + rz * Math.cos(p) * Math.cos(a)
          );
        }
        indices.push(
          ...(inner
            ? [start, start + 2, start + 1, start, start + 3, start + 2]
            : [start, start + 1, start + 2, start, start + 2, start + 3])
        );
      }
  }
  const shell = new THREE.BufferGeometry();
  shell.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  shell.setIndex(indices);
  shell.computeVertexNormals();
  k.add("hollow-masonry-dome", shell, "stone");
  // The throat's arch is a real hole, including its reveals and soffit.
  const face = new THREE.Shape();
  face.moveTo(-0.775, 0.8);
  face.lineTo(0.775, 0.8);
  face.lineTo(0.775, 1.055);
  face.absarc(0, 1.055, 0.775, 0, Math.PI, false);
  face.closePath();
  const mouth = new THREE.Path();
  mouth.moveTo(-0.35, 0.86);
  mouth.lineTo(-0.35, 1.12);
  mouth.absarc(0, 1.12, 0.35, Math.PI, 0, true);
  mouth.lineTo(0.35, 0.86);
  mouth.closePath();
  face.holes.push(mouth);
  k.add(
    "arched-oven-throat",
    new THREE.ExtrudeGeometry(face, { depth: 0.75, bevelEnabled: false, curveSegments: 18 }),
    "stone"
  ).position.set(x, 0, z + 0.28);
  for (let i = 0; i < 11; i++) {
    const a = (i * Math.PI) / 11 + 0.012,
      b = ((i + 1) * Math.PI) / 11 - 0.012;
    const stone = new THREE.Shape();
    stone.absarc(0, 1.12, 0.55, a, b, false);
    stone.lineTo(Math.cos(b) * 0.36, 1.12 + Math.sin(b) * 0.36);
    stone.absarc(0, 1.12, 0.36, b, a, true);
    stone.closePath();
    k.add(
      "oven-arch-voussoir",
      new THREE.ExtrudeGeometry(stone, { depth: 0.065, bevelEnabled: false, curveSegments: 3 }),
      i % 3 ? "white" : "stone"
    ).position.set(x, 0, z + 1.03);
  }
  for (let row = 1; row < 9; row++) {
    const phi = (row * Math.PI) / 2 / 10,
      start = phi < 0.9 ? 0.76 : 0,
      end = phi < 0.9 ? Math.PI * 2 - 0.76 : Math.PI * 2;
    const points = Array.from({ length: 49 }, (_, i): readonly [number, number, number] => {
      const a = start + ((end - start) * i) / 48;
      return [
        x + 1.003 * Math.cos(phi) * Math.sin(a),
        0.85 + 0.903 * Math.sin(phi),
        z + 0.933 * Math.cos(phi) * Math.cos(a)
      ];
    });
    k.tube("dome-mortar-course", points, 0.008, "white");
  }
  k.box("oven-landing", [x, 0.8, z + 1.18], [1.2, 0.12, 0.62], "stone");
  k.chimneyStack(x + 0.7, z - 0.4, chimneyTop, 0.8);
  for (let layer = 0; layer < 3; layer++)
    for (let log = 0; log < 6; log++)
      k.beam(
        "stacked-baking-fuel",
        [x - 0.8 + log * 0.25, 0.12 + layer * 0.16, z + 1.65],
        [x - 0.8 + log * 0.25, 0.12 + layer * 0.16, z + 2.12],
        0.14,
        "wood",
        true
      );
}

function bakeryHouse(k: HouseDetailKit, town: boolean) {
  const x = -1,
    z = -1,
    w = town ? 7 : 6,
    d = town ? 5 : 4.5,
    eave = town ? 4.7 : 2.7;
  k.box("bakehouse-floor", [x, 0.1, z], [w, 0.2, d], "stone");
  const front: HouseOpening[] = town
    ? [
        { u: 1.5, base: 0.24, width: 1.1, height: 2.1, kind: "door" },
        { u: -1.5, base: 1.05, width: 1.8, height: 1.1, kind: "shop" },
        ...[-2, 2].map(u => ({ u, base: 3.35, width: 0.8, height: 1, kind: "window" as const }))
      ]
    : [
        { u: 0, base: 0.24, width: 1.3, height: 2.1, kind: "door" },
        { u: -1.9, base: 1.25, width: 0.75, height: 0.9, kind: "window" }
      ];
  for (const [xx, zz, width, angle, holes] of [
    [x, z + d / 2, w, 0, front],
    [x, z - d / 2, w, Math.PI, [{ u: 0, base: 1.25, width: 0.75, height: 0.9, kind: "window" as const }]],
    [x + w / 2, z, d, Math.PI / 2, []],
    [x - w / 2, z, d, -Math.PI / 2, [{ u: 0, base: 1.25, width: 0.75, height: 0.9, kind: "window" as const }]]
  ] as const) {
    k.facade("bakehouse-wall", xx, zz, width, eave, angle, holes, town ? "plaster" : "stone");
    if (town) k.frameWall(xx, zz, width, eave, angle, holes, 2.6);
    else
      for (let row = 0; row < 9; row++) {
        const y = 0.3 + row * 0.27;
        for (let u = -width / 2 + 0.2; u < width / 2 - 0.1; u += 0.46) {
          if (
            holes.some(o => Math.abs(u - o.u) < o.width / 2 + 0.2 && y > o.base - 0.12 && y < o.base + o.height + 0.12)
          )
            continue;
          const stone = k.box(
            "bakehouse-stone-face",
            k.point(xx, zz, angle, u, y, 0.025),
            [0.44, 0.25, 0.055],
            row % 4 ? "stone" : "white"
          );
          stone.rotation.y = angle;
        }
      }
  }
  if (town) k.box("upper-floor", [x, 2.62, z], [w - 0.2, 0.14, d - 0.2], "wood");
  k.roofCover(x, z, w, d, eave + 0.12, town ? 1.8 : 1.4, "tile");
  if (town) {
    k.box("bread-display-sill", [-2.5, 1.02, 1.75], [2.05, 0.09, 0.7], "wood");
    for (const x of [-3.25, -1.75]) k.beam("display-sill-bracket", [x, 0.5, 1.55], [x, 0.98, 2], 0.08);
  }
}

function coolingBench(k: HouseDetailKit, x: number, z: number, width: number) {
  for (let xx = x - width / 2 + 0.12; xx < x + width / 2; xx += 0.25)
    k.box("cooling-table-plank", [xx, 0.94, z], [0.24, 0.09, 0.85], "wood");
  for (const xx of [x - width / 2 + 0.15, x + width / 2 - 0.15])
    for (const zz of [z - 0.3, z + 0.3]) k.box("cooling-table-leg", [xx, 0.45, zz], [0.1, 0.9, 0.1]);
  k.beam("table-stretcher", [x - width / 2 + 0.1, 0.3, z], [x + width / 2 - 0.1, 0.3, z], 0.1);
  for (let i = 0; i < 8; i++) {
    const xx = x - width * 0.35 + (i % 4) * width * 0.23,
      zz = z - 0.2 + Math.floor(i / 4) * 0.4;
    k.sphere("baked-bread-loaf", [xx, 1.09, zz], [0.24, 0.12, 0.14], "straw");
    for (const dx of [-0.08, 0.02, 0.12])
      k.tube(
        "loaf-score",
        [
          [xx + dx, 1.15, zz - 0.07],
          [xx + dx + 0.015, 1.211, zz],
          [xx + dx + 0.03, 1.15, zz + 0.07]
        ],
        0.008,
        "wood"
      );
  }
}

function peel(k: HouseDetailKit, x: number, z: number, y: number, alongZ = false) {
  if (alongZ) {
    k.beam("bread-peel-handle", [x, y, z - 1], [x, y, z + 0.8], 0.045, "wood", true);
    k.box("bread-peel-blade", [x, y, z + 1.05], [0.45, 0.035, 0.55], "wood");
  } else {
    k.beam("bread-peel-handle", [x - 1, y, z], [x + 0.8, y, z], 0.045, "wood", true);
    k.box("bread-peel-blade", [x + 1.05, y, z], [0.55, 0.035, 0.45], "wood");
  }
}

export function createHighBakery(kind: BakeryKind) {
  const k = new HouseDetailKit(`${kind}-high`);
  if (kind === "communal-bread-oven") {
    for (const x of [-2.4, 2.4])
      for (const z of [-1.9, 1.9]) {
        k.box("shelter-stone-foot", [x, 0.1, z], [0.34, 0.2, 0.34], "stone");
        k.box("oven-shelter-post", [x, 1.45, z], [0.16, 2.7, 0.16]);
        k.beam("shelter-knee-brace", [x, 2.1, z], [x - Math.sign(x) * 0.6, 2.8, z], 0.12);
      }
    for (const z of [-1.9, 1.9]) k.beam("shelter-wall-plate", [-2.6, 2.8, z], [2.6, 2.8, z], 0.18);
    k.roofCover(0, 0, 5, 4, 2.88, 1.1, "wood");
    oven(k, 0, -0.5, 4.55);
    peel(k, -2.1, 2.05, 0.8, true);
    for (const z of [1.25, 2.85]) {
      k.box("peel-rest-foot", [-2.1, 0.38, z], [0.12, 0.76, 0.12]);
      k.box("peel-rest-head", [-2.1, 0.77, z], [0.48, 0.08, 0.1], "wood");
    }
  } else {
    const town = kind === "town-bakery";
    bakeryHouse(k, town);
    oven(k, town ? 4 : 3, town ? -0.5 : 0);
    coolingBench(k, town ? -3.3 : -3.1, town ? 2.8 : 2.5, town ? 3 : 2.5);
    // Rest the long peel on brackets instead of suspending it above the table.
    peel(k, -2.9, 3.45, 1.04);
    for (const x of [-3.7, -2.1]) {
      k.box("peel-rest-leg", [x, 0.48, 3.45], [0.09, 0.96, 0.09]);
      k.box("peel-rest-top", [x, 0.98, 3.45], [0.14, 0.08, 0.25], "wood");
    }
    k.table(-0.2, 2.5, 1.8, 0.75, 0.85);
    k.box("kneading-trough-floor", [-0.2, 0.96, 2.5], [1.5, 0.08, 0.56], "wood");
    for (const side of [-1, 1]) {
      k.box("kneading-trough-rim", [-0.2, 1.12, 2.5 + side * 0.28], [1.55, 0.32, 0.06], "wood");
      k.box("kneading-trough-end", [-0.2 + side * 0.75, 1.12, 2.5], [0.06, 0.32, 0.56], "wood");
    }
    for (const xx of [-0.65, -0.2, 0.25]) k.sphere("kneaded-dough", [xx, 1.05, 2.5], [0.15, 0.09, 0.15], "white");
  }
  return compactModel(k.finish());
}
