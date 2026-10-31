import * as THREE from "three";
import { compactModel } from "../compactModel";
import { createMedievalContainerModel } from "../props/medievalContainers";
import { HouseDetailKit, type HouseOpening } from "./houseDetailKit";
import { ModelKit } from "./modelKit";
import { cutRoofRectangle } from "./roofCut";

export type BreweryKind = "town-brewery" | "ale-brewhouse";

function brewingHall(k: HouseDetailKit, large: boolean) {
  const width = large ? 8 : 5.5,
    height = large ? 4.7 : 2.8;
  const front: HouseOpening[] = [
    { u: 0.6, base: 0.25, width: 1.25, height: 2.1, kind: "door" },
    { u: -1.65, base: 1.25, width: 0.75, height: 0.9, kind: "window" }
  ];
  if (large) for (const u of [-2.5, 0, 2.5]) front.push({ u, base: 3.25, width: 0.8, height: 1.05, kind: "window" });
  k.box("brewery-stone-plinth", [-2, 0.1, -1], [width, 0.2, 5], "stone");
  for (const [x, z, w, angle, holes] of [
    [-2, 1.5, width, 0, front],
    [-2, -3.5, width, Math.PI, [{ u: 0, base: 1.25, width: 0.75, height: 0.9, kind: "window" as const }]],
    [-2 - width / 2, -1, 5, -Math.PI / 2, [{ u: 0, base: 1.25, width: 0.75, height: 0.9, kind: "window" as const }]],
    [-2 + width / 2, -1, 5, Math.PI / 2, [{ u: 0, base: 1.25, width: 0.75, height: 0.9, kind: "window" as const }]]
  ] as const) {
    k.facade("brewery-masonry-wall", x, z, w, height, angle, holes, "stone");
    for (let y = 0.35; y < height; y += 0.3)
      for (let u = -w / 2 + 0.2; u < w / 2 - 0.1; u += 0.5) {
        if (holes.some(o => Math.abs(u - o.u) < o.width / 2 + 0.2 && y > o.base - 0.15 && y < o.base + o.height + 0.15))
          continue;
        const stone = k.box("brewery-dressed-stone", k.point(x, z, angle, u, y, 0.015), [0.47, 0.28, 0.04], "stone");
        stone.rotation.y = angle;
      }
  }
  if (large) k.box("brewery-upper-floor", [-2, 2.65, -1], [width - 0.2, 0.14, 4.8], "wood");
  for (const z of [-3.5, 1.5]) k.box("brewery-eaves-plate", [-2, height + 0.05, z], [width + 0.1, 0.2, 0.25], "stone");
  k.roofCover(-2, -1, width, 5, height + 0.12, 1.5, "tile");
}

function firebox(k: HouseDetailKit, cx: number) {
  k.box("furnace-base", [cx - 0.5, 0.075, 0], [1.95, 0.15, 1.95], "stone");
  for (const x of [cx - 1.4, cx + 0.4]) k.box("furnace-side", [x, 0.62, 0], [0.16, 0.95, 1.8], "stone");
  k.box("furnace-back", [cx - 0.5, 0.62, -0.9], [1.95, 0.95, 0.16], "stone");
  const face = new THREE.Shape();
  face.moveTo(-0.975, 0.15);
  face.lineTo(0.975, 0.15);
  face.lineTo(0.975, 1.1);
  face.lineTo(-0.975, 1.1);
  face.closePath();
  const mouth = new THREE.Path();
  mouth.moveTo(-0.32, 0.18);
  mouth.lineTo(-0.32, 0.5);
  mouth.absarc(0, 0.5, 0.32, Math.PI, 0, true);
  mouth.lineTo(0.32, 0.18);
  mouth.closePath();
  face.holes.push(mouth);
  k.add(
    "arched-brewing-firebox",
    new THREE.ExtrudeGeometry(face, { depth: 0.18, bevelEnabled: false, curveSegments: 16 }),
    "stone"
  ).position.set(cx - 0.5, 0, 0.79);
  k.box("furnace-coal-bed", [cx - 0.5, 0.2, 0], [1.55, 0.1, 1.5], "dark");
  for (let i = 0; i < 15; i++)
    k.sphere(
      "furnace-embers",
      [cx - 1 + (i % 5) * 0.25, 0.29, -0.4 + Math.floor(i / 5) * 0.3],
      [0.09, 0.04, 0.07],
      i % 3 ? "dark" : "tile"
    );
  for (const z of [-0.78, 0.78]) k.box("copper-support-ledge", [cx - 0.5, 1.08, z], [1.9, 0.12, 0.2], "stone");
}

function vessels(k: HouseDetailKit, cx: number, kind: "copper" | "mash-tun") {
  const kit = new ModelKit("brewing-vessels");
  if (kind === "copper") {
    const profile = [
      [0, 0],
      [0.62, 0],
      [0.77, 0.12],
      [0.85, 0.45],
      [0.85, 0.7],
      [0.8, 0.7],
      [0.8, 0.46],
      [0.72, 0.16],
      [0.6, 0.08],
      [0, 0.08]
    ];
    const copper = kit.add(
      "riveted-brewing-copper",
      new THREE.LatheGeometry(
        profile.map(([r, y]) => new THREE.Vector2(r, y)),
        40
      ),
      "tile"
    );
    copper.position.set(cx - 0.5, 1.08, 0);
    copper.material.color.setHex(0xb87948);
    kit.ring("rolled-copper-rim", [cx - 0.5, 1.78, 0], 0.825, 0.035, "tile");
    for (let i = 0; i < 24; i++) {
      const a = (i * Math.PI) / 12;
      kit.sphere(
        "copper-rivet",
        [cx - 0.5 + Math.cos(a) * 0.84, 1.54, Math.sin(a) * 0.84],
        [0.018, 0.018, 0.018],
        "tile"
      );
    }
    const wort = kit.add("copper-wort", new THREE.CircleGeometry(0.79, 40), "water");
    wort.rotation.x = -Math.PI / 2;
    wort.position.set(cx - 0.5, 1.6, 0);
    wort.material.color.setHex(0x927141);
  } else {
    kit.vessel("staved-mash-tun", [cx + 1.2, 0, 1.1], 0.7, 1.3, "wood", true);
    for (const y of [0.15, 0.62, 1.16]) kit.ring("tun-iron-hoop", [cx + 1.2, y, 1.1], 0.705, 0.025, "iron");
    for (let i = 0; i < 28; i++) {
      const a = (i * Math.PI) / 14;
      kit.beam(
        "mash-tun-stave-joint",
        [cx + 1.2 + Math.cos(a) * 0.702, 0.08, 1.1 + Math.sin(a) * 0.702],
        [cx + 1.2 + Math.cos(a) * 0.702, 1.27, 1.1 + Math.sin(a) * 0.702],
        0.007,
        "oak"
      );
    }
    kit.beam("long-mash-paddle", [cx + 0.2, 1.65, 1.1], [cx + 1.35, 0.5, 1.1], 0.055, "wood", true);
    const blade = kit.box("mash-paddle-blade", [cx + 1.28, 0.58, 1.1], [0.22, 0.4, 0.05], "wood");
    blade.rotation.z = -0.78;
    kit.beam("wooden-tun-tap", [cx + 1.2, 0.25, 1.76], [cx + 1.2, 0.25, 1.96], 0.07, "wood", true);
    kit.box("tap-handle", [cx + 1.2, 0.33, 1.86], [0.2, 0.035, 0.035], "wood");
    const liquid = kit.pickables.find(mesh => mesh.name === "vat-liquid")!;
    (liquid.material as THREE.MeshLambertMaterial).color.setHex(0x927141);
  }
  k.attach(kit.finish(), [0, 0, 0]);
}

function copperShelter(k: HouseDetailKit, cx: number) {
  const postTop = 3.1 + 1.1 * (1 - 2.35 / 2.8);
  for (const x of [cx - 1.85, cx + 1.85])
    for (const z of [-2.35, 2.35]) {
      k.box("copper-yard-stone-foot", [x, 0.09, z], [0.3, 0.18, 0.3], "stone");
      k.box("copper-shelter-post", [x, (postTop + 0.12) / 2, z], [0.14, postTop - 0.12, 0.14]);
      k.beam("shelter-brace", [x, postTop - 0.55, z], [x - Math.sign(x - cx) * 0.5, postTop, z], 0.1);
    }
  for (const z of [-2.35, 2.35]) k.beam("shelter-wall-plate", [cx - 2, postTop, z], [cx + 2, postTop, z], 0.16);
  for (const x of [cx - 1.85, cx + 1.85])
    for (const side of [-1, 1]) k.beam("shelter-principal-rafter", [x, 3.1, side * 2.8], [x, 4.2, 0], 0.14);
  const start = k.pickables.length;
  k.roofCover(cx, 0, 4, 5, 3.1, 1.1, "wood");
  cutRoofRectangle(k, k.pickables.slice(start), { minX: cx - 1.52, maxX: cx - 0.68, minZ: -2.07, maxZ: -1.23 }, m =>
    m.name === "gable-infill"
      ? "plaster"
      : ["roof-underlay", "split-roof-shingle", "ridge-roll"].includes(m.name)
        ? "wood"
        : "oak"
  );
  const point = (xx: number, zz: number): readonly [number, number, number] => [
    xx,
    3.1 + 1.1 * (1 - Math.abs(zz) / 2.8) + 0.035,
    zz
  ];
  for (const xx of [cx - 1.5, cx - 0.7])
    k.beam("chimney-side-flashing", point(xx, -2.05), point(xx, -1.25), 0.1, "iron");
}

function furnaceChimney(k: HouseDetailKit, cx: number) {
  const x = cx - 1.1,
    z = -1.65;
  k.box("furnace-chimney-foot", [x, 0.1, z], [0.85, 0.2, 0.8], "stone");
  for (const side of [-1, 1]) {
    k.box("open-flue-side", [x, 2.55, z + side * 0.26], [0.72, 4.7, 0.12], "stone");
    k.box("open-flue-end", [x + side * 0.3, 2.55, z], [0.12, 4.7, 0.4], "stone");
    k.box("chimney-cap-side", [x, 4.92, z + side * 0.28], [0.84, 0.12, 0.16], "stone");
    k.box("chimney-cap-end", [x + side * 0.34, 4.92, z], [0.16, 0.12, 0.4], "stone");
  }
  k.beam("furnace-smoke-duct", [cx - 0.5, 0.85, -0.86], [x, 1.2, z], 0.38, "stone");
}

export type BreweryPart = "hall" | "shelter" | "heating-unit" | "mash-tun" | "malt-station" | "casks";

export function createHighBreweryComponent(kind: BreweryKind, part: BreweryPart) {
  const k = new HouseDetailKit(`${kind}-${part}-high`);
  const large = kind === "town-brewery",
    width = large ? 8 : 5.5,
    cx = -2 + width / 2 + 3.35;
  if (part === "hall") brewingHall(k, large);
  else if (part === "shelter") copperShelter(k, cx);
  else if (part === "heating-unit") {
    firebox(k, cx);
    vessels(k, cx, "copper");
    furnaceChimney(k, cx);
  } else if (part === "mash-tun") vessels(k, cx, "mash-tun");
  else if (part === "malt-station") {
    k.table(0, 3, 2.2, 1, 0.85);
    k.box("malt-tray-floor", [0, 0.96, 3], [2, 0.08, 0.8], "wood");
    for (const side of [-1, 1]) {
      k.box("malt-tray-side", [0, 1.07, 3 + side * 0.4], [2.06, 0.22, 0.06], "wood");
      k.box("malt-tray-end", [side, 1.07, 3], [0.06, 0.22, 0.8], "wood");
    }
    k.box("malt-layer", [0, 1.01, 3], [1.9, 0.04, 0.69], "straw");
    for (let i = 0; i < 72; i++)
      k.box(
        "individual-malt-grain",
        [-0.87 + (i % 12) * 0.155, 1.036, 2.72 + Math.floor(i / 12) * 0.11],
        [0.045, 0.018, 0.025],
        "straw"
      );
  } else if (part === "casks")
    for (let i = 0; i < 3; i++) k.attach(createMedievalContainerModel("barrel", "closed"), [-4.4 + i * 0.85, 0, 2.3]);
  return compactModel(k.finish(), { mergeEquivalentMaterials: true });
}
