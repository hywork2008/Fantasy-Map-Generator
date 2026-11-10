import * as THREE from "three";
import { DEFAULT_AUTHOR } from "../authors";
import type { ModelPartFactory } from "../modelParts";
import { variantId } from "../modelVariants";
import { HouseDetailKit } from "./houseDetailKit";
import { ModelKit } from "./modelKit";
import { addOpenParishDoor, addParishMasonryWall } from "./parishChurchDetails";

export const BONE_SHELF_LEVELS = [0.38, 1.05, 1.72] as const;
const entrance = { u: 0, base: 0.16, width: 1.2, height: 2.15, pointed: false };
const frontVents = [-1.8, 1.8].map(u => ({ u, base: 1.3, width: 0.7, height: 0.95, pointed: false }));

/** Stylised dry remains: pierced orbital/nasal face and recessed hemispherical braincase. */
export function createOssuarySkull() {
  const k = new ModelKit("ossuary-skull-high");
  const face = new THREE.Shape();
  face.moveTo(-0.09, 0.03);
  face.lineTo(0.09, 0.03);
  face.quadraticCurveTo(0.15, 0.13, 0.14, 0.21);
  face.quadraticCurveTo(0.13, 0.34, 0, 0.34);
  face.quadraticCurveTo(-0.13, 0.34, -0.14, 0.21);
  face.quadraticCurveTo(-0.15, 0.13, -0.09, 0.03);
  for (const x of [-0.062, 0.062]) {
    const orbit = new THREE.Path();
    orbit.absarc(x, 0.214, 0.043, 0, Math.PI * 2, true);
    face.holes.push(orbit);
  }
  face.holes.push(
    new THREE.Path([new THREE.Vector2(-0.021, 0.124), new THREE.Vector2(0, 0.169), new THREE.Vector2(0.021, 0.124)])
  );
  face.holes.push(
    new THREE.Path([
      new THREE.Vector2(-0.072, 0.065),
      new THREE.Vector2(-0.072, 0.08),
      new THREE.Vector2(0.072, 0.08),
      new THREE.Vector2(0.072, 0.065)
    ])
  );
  k.add(
    "pierced-skull-face",
    new THREE.ExtrudeGeometry(face, { depth: 0.025, bevelEnabled: false, curveSegments: 10 }),
    "white"
  ).position.z = 0.08;
  const back = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  back.rotateX(-Math.PI / 2);
  const cranium = k.add("open-backed-skull-bowl", back, "white");
  cranium.scale.set(0.14, 0.16, 0.12);
  cranium.position.set(0, 0.18, 0.08);
  k.box("skull-lower-jaw", [0, 0.025, 0.08], [0.18, 0.05, 0.09], "white");
  for (let i = 0; i < 6; i++) k.box("skull-tooth", [-0.061 + i * 0.0244, 0.065, 0.112], [0.018, 0.029, 0.024], "white");
  return k.finish();
}

function rackFrame() {
  const k = new ModelKit("ossuary-rack-frame");
  for (const x of [-1, 1])
    for (const z of [-0.27, 0.27]) {
      k.box("rack-foot", [x, 0.05, z], [0.19, 0.1, 0.19], "oak");
      k.box("rack-post", [x, 1.12, z], [0.11, 2.16, 0.11], "oak");
    }
  for (const y of BONE_SHELF_LEVELS) {
    k.box("bone-shelf-board", [0, y, 0], [2.2, 0.1, 0.65], "wood");
    for (const x of [-0.96, 0.96]) k.box("shelf-support-cleat", [x, y - 0.08, 0], [0.13, 0.08, 0.6], "oak");
    for (const x of [-1, 1]) k.beam("rack-peg", [x, y, -0.36], [x, y, 0.36], 0.025, "wood", true);
  }
  k.box("rack-top-cap", [0, 2.2, 0], [2.25, 0.12, 0.7], "wood");
  k.beam("rack-back-brace", [-1, 0.13, -0.29], [1, 2.1, -0.29], 0.06, "oak");
  return k.finish();
}

function rackRemains() {
  const k = new ModelKit("ossuary-rack-remains");
  for (const y of BONE_SHELF_LEVELS) {
    for (const x of [-0.65, 0, 0.65]) k.attach(createOssuarySkull(), [x, y + 0.05, 0.07]);
    for (const z of [-0.18, -0.07]) {
      k.beam("stored-long-bone", [-0.62, y + 0.077, z], [0.62, y + 0.077, z], 0.04, "white", true);
      for (const x of [-0.62, 0.62]) {
        const joint = k.add("bone-joint", new THREE.SphereGeometry(1, 8, 6), "white");
        joint.position.set(x, y + 0.077, z);
        joint.scale.set(0.04, 0.027, 0.03);
      }
    }
  }
  return k.finish();
}

function part(prefix: string, role: string, create: ModelPartFactory["create"], basedOn?: string[]): ModelPartFactory {
  return { id: `${prefix}:${role}`, role, quality: "high", author: DEFAULT_AUTHOR, create, basedOn };
}
export const boneRackPartFactories = (): ModelPartFactory[] => [
  part("bone-rack", "frame", rackFrame),
  part("bone-rack", "remains", rackRemains)
];

/** Raw shared rack keeps outer assembly ownership and its part ranges unambiguous. */
export function createOssuaryRack() {
  const k = new ModelKit("ossuary-bone-rack-high");
  k.attach(rackFrame(), [0, 0, 0]);
  k.attach(rackRemains(), [0, 0, 0]);
  return k.finish();
}

export function ossuaryPartFactories(): ModelPartFactory[] {
  return [
    part("ossuary", "architecture", () => {
      const k = new HouseDetailKit("ossuary-stone-body");
      k.box("ossuary-continuous-floor", [0, 0.08, 0], [6.1, 0.16, 4.1], "stone");
      addParishMasonryWall(k, 0, 2, 6, 3.2, 0, [entrance, ...frontVents]);
      addParishMasonryWall(k, 0, -2, 6, 3.2, Math.PI, [{ u: 0, base: 1.45, width: 0.9, height: 1.1, pointed: false }]);
      for (const side of [-1, 1])
        addParishMasonryWall(
          k,
          side * 3,
          0,
          4,
          3.2,
          (side * Math.PI) / 2,
          [-1, 1].map(u => ({ u, base: 1.4, width: 0.65, height: 0.95, pointed: false }))
        );
      return k.finish();
    }),
    part("ossuary", "roof", () => {
      const k = new HouseDetailKit("ossuary-tiled-roof");
      k.roofCover(0, 0, 6, 4, 3.2, 1.65, "tile");
      return k.finish();
    }),
    part("ossuary", "door", () => {
      const k = new HouseDetailKit("ossuary-fitted-door");
      addOpenParishDoor(k, 0, 2, 0, { ...entrance, door: true });
      return k.finish();
    }),
    part("ossuary", "vent-grilles", () => {
      const k = new HouseDetailKit("ossuary-ventilation-grilles");
      const grille = (x: number, z: number, angle: number, u: number, base: number, width: number, height: number) => {
        for (const side of [-1, 1])
          k.beam(
            "vent-grille-frame",
            k.point(x, z, angle, u + (side * width) / 2, base, -0.08),
            k.point(x, z, angle, u + (side * width) / 2, base + height - width / 2, -0.08),
            0.025,
            "iron"
          );
        const r = width / 2,
          spring = base + height - r;
        for (let i = 0; i < 12; i++) {
          const a = (i * Math.PI) / 12,
            b = ((i + 1) * Math.PI) / 12;
          k.beam(
            "vent-grille-arch",
            k.point(x, z, angle, u + r * Math.cos(a), spring + r * Math.sin(a), -0.08),
            k.point(x, z, angle, u + r * Math.cos(b), spring + r * Math.sin(b), -0.08),
            0.025,
            "iron"
          );
        }
        for (const t of [-0.25, 0, 0.25]) {
          const xx = t * width,
            top = spring + Math.sqrt(r * r - xx * xx);
          k.beam(
            "vent-vertical-bar",
            k.point(x, z, angle, u + xx, base, -0.08),
            k.point(x, z, angle, u + xx, top, -0.08),
            0.022,
            "iron"
          );
        }
        k.beam(
          "vent-grille-sill",
          k.point(x, z, angle, u - width / 2, base, -0.08),
          k.point(x, z, angle, u + width / 2, base, -0.08),
          0.03,
          "iron"
        );
      };
      for (const vent of frontVents) grille(0, 2, 0, vent.u, vent.base, vent.width, vent.height);
      grille(0, -2, Math.PI, 0, 1.45, 0.9, 1.1);
      for (const side of [-1, 1])
        for (const u of [-1, 1]) grille(side * 3, 0, (side * Math.PI) / 2, u, 1.4, 0.65, 0.95);
      return k.finish();
    }),
    part(
      "ossuary",
      "bone-racks",
      () => {
        const k = new ModelKit("ossuary-shared-racks");
        for (const x of [-1.4, 1.4]) k.attach(createOssuaryRack(), [x, 0.16, -1.35]);
        return k.finish();
      },
      [variantId("cemetery.skull_shelf", "high", DEFAULT_AUTHOR)]
    )
  ];
}
