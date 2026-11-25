import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

export type RopeFerryQuality = "low" | "high";

const HULL_LENGTH = 12;
/** Raised loading flaps, hinged at deck level on each end. */
const FLAP = { length: 1.5, width: 2.6, thickness: 0.08, raised: (70 * Math.PI) / 180 };
const DRAFT = 0.3;
const DECK_Y = 0.5;
/** The hauling rope runs through forked guide posts on one side; the fork tops are the highest point. */
const GUIDE = { x: 5.2, z: 1.5, top: 2.05, ropeY: 1.9 };

/**
 * A hand-hauled cart ferry crossing a river along a rope, in meters. Waterline at y = 0, the long axis on X; the
 * hull is symmetric because a cart drives on at one end and off at the other.
 */
export const ROPE_FERRY = {
  author: "Claude Opus 5.5" as Author,
  name: "Rope-hauled cart ferry",
  hullLength: HULL_LENGTH,
  /** Hull plus the two raised flaps. */
  length: HULL_LENGTH + 2 * FLAP.length * Math.cos(FLAP.raised),
  /** Across the rubbing strakes. */
  beam: 3.4,
  /** Waterline to the top of the rope guide forks. */
  height: GUIDE.top,
  draft: DRAFT,
  /** Flat bottom to the deck. */
  depth: DECK_Y + DRAFT,
  /** Clear width between the wheel kerbs. */
  laneWidth: 2.76,
  flapLength: FLAP.length,
  note: "Schematic flat-bottomed river ferry for people, livestock and a cart with its team, hauled hand over hand along a rope stretched from bank to bank and poled in the shallows. Kuhn (Deutsches Schiffahrtsarchiv 6, 1983) describes the Rhine ferries before the reaction ferry of 1657 as broad, very flat, almost rectangular craft that took carts, wagons and coaches with their teams still harnessed; the Ename reconstruction of a ferry around 995 (Visual Dimension, 2015) is symmetric for the same reason and keeps its course along a chain across the river. Size: the Dieren ferry on the IJssel, recorded from 1269, still had a large pont of 12.27 × 3.19 m in 1889; the Magor Pill river boat (1239/40) was about 14 × 3.7 m and 1.2 m deep; the Ráckeve Danube boat 11 × 3 m; later hand-hauled cable ferries were 10–15 m long and 2.4–4.9 m wide. A 12 × 3.4 m hull with a 0.3 m light draft takes the 6.4 × 2.5 m freight wagon. The hinged loading flaps follow nineteenth-century cable ferries such as the Aller ferry at Barnstedt (2 m flaps); medieval ferries may have used loose planks instead. Landings need a floating stage or a sloping hard to follow the water level. Static model with the flaps raised for the crossing; the rope is shown only along the hull.",
  highNote:
    "High tier: individual deck planks, side strake seams and the raked end panels; iron straps on the flap hinges, cross cleats on the flaps and the chains holding them up; a roller in each rope guide fork; the notched hauling club; wheel chocks at both ends; a bailing scoop and iron shoes on the setting poles."
} as const;

export interface RopeFerryMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

const HALF = HULL_LENGTH / 2;
/** End of the flat bottom; the raked end panels rise from here to the deck ends. */
const BOTTOM_END = 4.5;
const HALF_TOP = 1.64;
const HALF_BOTTOM = 1.55;
const STRAKE_OUT = ROPE_FERRY.beam / 2;
const KERB_Z = ROPE_FERRY.laneWidth / 2 + 0.06;
const RAIL = { z: 1.6, end: 4.5, step: 1.5, top: DECK_Y + 1.1 };

export function createRopeFerryModel(quality: RopeFerryQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `rope-ferry-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const oak = new THREE.MeshLambertMaterial({ color: 0x7a5636, side: THREE.DoubleSide });
  const tarred = new THREE.MeshLambertMaterial({ color: 0x302821, side: THREE.DoubleSide });
  const deckWood = new THREE.MeshLambertMaterial({ color: 0xa98a5f });
  const worn = new THREE.MeshLambertMaterial({ color: 0x8e7350 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x3a3b39 });
  const hemp = new THREE.MeshLambertMaterial({ color: 0xa48e62 });
  const materials = [oak, tarred, deckWood, worn, iron, hemp];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const rod = new THREE.CylinderGeometry(1, 1, 1, high ? 10 : 6);
  geometries.add(cube).add(rod);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const Y = v(0, 1, 0);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = oak) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function bar(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, material = oak) {
    const mesh = add(name, rod, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
    return mesh;
  }
  function surface(name: string, points: number[], indices: number[], material: THREE.Material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(name, geometry, material);
  }

  // Hull: a flat bottom between raked end panels, with near-vertical sides.
  const stations: [x: number, base: number][] = [
    [-HALF, DECK_Y - 0.08],
    [-BOTTOM_END, -DRAFT],
    [BOTTOM_END, -DRAFT],
    [HALF, DECK_Y - 0.08]
  ];
  const ring = ([x, base]: [number, number]) => [
    [x, DECK_Y, -HALF_TOP],
    [x, base, -HALF_BOTTOM],
    [x, base, HALF_BOTTOM],
    [x, DECK_Y, HALF_TOP]
  ];
  const points = stations.flatMap(station => ring(station).flat());
  const sides: number[] = [],
    bottom: number[] = [],
    ends: number[] = [];
  for (let i = 0; i < stations.length - 1; i++) {
    const a = i * 4,
      b = a + 4;
    sides.push(a, b, a + 1, b, b + 1, a + 1, a + 2, b + 2, a + 3, b + 2, b + 3, a + 3);
    (i === 1 ? bottom : ends).push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
  }
  surface("hull-side", points, sides, oak);
  surface("flat-bottom", points, bottom, tarred);
  surface("raked-end", points, ends, tarred);
  for (const x of [-HALF, HALF]) {
    const r = ring([x, DECK_Y - 0.08]).flat();
    surface("end-board", r, [0, 1, 3, 1, 2, 3], oak);
  }
  for (const side of [-1, 1]) {
    box("rubbing-strake", 0, DECK_Y - 0.12, side * (STRAKE_OUT - 0.03), HULL_LENGTH - 0.2, 0.14, 0.06, tarred);
  }

  // Load deck, flush with the hull ends so a cart rolls straight on.
  if (high) {
    const planks = 12;
    const width = (2 * HALF_TOP) / planks;
    for (let i = 0; i < planks; i++) {
      const z = -HALF_TOP + width * (i + 0.5);
      box("deck-plank", 0, DECK_Y - 0.03, z, HULL_LENGTH, 0.06, width - 0.012, i % 3 === 1 ? worn : deckWood);
    }
    for (const side of [-1, 1]) {
      for (const y of [0.22, -0.02])
        box("strake-seam", 0, y, side * (HALF_TOP - 0.02), 2 * BOTTOM_END, 0.025, 0.03, tarred);
    }
  } else box("deck", 0, DECK_Y - 0.03, 0, HULL_LENGTH, 0.06, 2 * HALF_TOP, deckWood);
  for (const side of [-1, 1]) box("wheel-kerb", 0, DECK_Y + 0.08, side * KERB_Z, 2 * RAIL.end + 1, 0.16, 0.12);

  // Side rails keep animals aboard; the ends stay open for loading.
  for (const side of [-1, 1]) {
    for (let x = -RAIL.end; x <= RAIL.end + 1e-6; x += RAIL.step)
      box("rail-post", x, DECK_Y + 0.55, side * RAIL.z, 0.12, 1.1, 0.12);
    for (const y of [RAIL.top - 0.04, DECK_Y + 0.55]) box("rail", 0, y, side * RAIL.z, 2 * RAIL.end + 0.12, 0.08, 0.08);
    for (const x of [-HALF + 0.4, HALF - 0.4]) {
      bar("bollard", v(x, DECK_Y, side * (HALF_TOP - 0.3)), v(x, DECK_Y + 0.42, side * (HALF_TOP - 0.3)), 0.09);
    }
  }

  // Loading flaps, raised for the crossing.
  const c = Math.cos(FLAP.raised),
    s = Math.sin(FLAP.raised);
  for (const end of [-1, 1]) {
    const hinge = v(end * HALF, DECK_Y, 0);
    const along = v(end * c, s, 0);
    const up = v(-end * s, c, 0);
    const flap = box("loading-flap", 0, 0, 0, FLAP.length, FLAP.thickness, FLAP.width, worn);
    flap.position
      .copy(hinge)
      .addScaledVector(along, FLAP.length / 2)
      .addScaledVector(up, FLAP.thickness / 2);
    flap.rotation.z = end * FLAP.raised;
    if (!high) continue;
    for (let k = 1; k <= 5; k++) {
      const cleat = box("flap-cleat", 0, 0, 0, 0.05, 0.04, FLAP.width - 0.2, oak);
      cleat.position
        .copy(hinge)
        .addScaledVector(along, (FLAP.length * k) / 6)
        .addScaledVector(up, FLAP.thickness + 0.02);
      cleat.rotation.z = end * FLAP.raised;
    }
    for (const z of [-0.9, 0.9]) {
      const strap = box("hinge-strap", 0, 0, 0, 0.5, 0.012, 0.08, iron);
      strap.position
        .copy(hinge)
        .addScaledVector(along, 0.25)
        .addScaledVector(up, FLAP.thickness + 0.006);
      strap.position.z = z;
      strap.rotation.z = end * FLAP.raised;
      const top = hinge
        .clone()
        .addScaledVector(along, FLAP.length - 0.05)
        .addScaledVector(up, FLAP.thickness);
      top.z = z * 1.3;
      bar("flap-chain", top, v(end * RAIL.end, RAIL.top, Math.sign(z) * (RAIL.z - 0.08)), 0.012, iron);
    }
  }

  // Forked guide posts carry the hauling rope along one side.
  for (const x of [-GUIDE.x, GUIDE.x]) {
    bar("rope-guide-post", v(x, DECK_Y, GUIDE.z), v(x, GUIDE.ropeY - 0.05, GUIDE.z), 0.08);
    for (const dz of [-0.07, 0.07])
      box(
        "rope-guide-fork",
        x,
        (GUIDE.ropeY + GUIDE.top) / 2 - 0.05,
        GUIDE.z + dz,
        0.12,
        GUIDE.top - GUIDE.ropeY + 0.1,
        0.04
      );
    if (high)
      bar(
        "rope-roller",
        v(x, GUIDE.ropeY - 0.04, GUIDE.z - 0.06),
        v(x, GUIDE.ropeY - 0.04, GUIDE.z + 0.06),
        0.05,
        iron
      );
  }
  bar("hauling-rope", v(-HALF, GUIDE.ropeY, GUIDE.z), v(HALF, GUIDE.ropeY, GUIDE.z), 0.025, hemp);

  // A setting pole rests on each rail, between the posts.
  for (const side of [-1, 1]) {
    const y = RAIL.top + 0.035;
    bar("setting-pole", v(-2.8, y, side * RAIL.z), v(2.75, y, side * RAIL.z), 0.035, worn);
    if (high) bar("pole-shoe", v(2.75, y, side * RAIL.z), v(2.9, y, side * RAIL.z), 0.03, iron);
  }

  if (high) {
    const club = box("hauling-club", 3.6, DECK_Y + 0.04, GUIDE.z - 0.35, 0.7, 0.07, 0.09, worn);
    club.rotation.y = 0.3;
    for (const x of [-(HALF - 0.9), HALF - 0.9]) {
      for (const z of [-0.95, 0.95]) {
        const chock = box("wheel-chock", x, DECK_Y + 0.07, z, 0.28, 0.14, 0.22, oak);
        chock.rotation.y = 0.2 * Math.sign(z);
      }
    }
    box("bailing-scoop", -3.6, DECK_Y + 0.06, -(KERB_Z - 0.25), 0.32, 0.12, 0.22, worn);
  }

  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createRopeFerry(quality: RopeFerryQuality = "low"): RopeFerryMeshes {
  const model = createRopeFerryModel(quality);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
