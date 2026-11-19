import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";
import type { SailingShipState } from "./sailingAssembly";

export type FerrySmackQuality = "low" | "high";

const HULL_LENGTH = 14;
const BEAM = 4.5;
const DEPTH = 1.5;
const DRAFT = 0.8;
const FREEBOARD = DEPTH - DRAFT;
const HALF = HULL_LENGTH / 2;
/** Outboard rudder blade behind the sternpost. */
const RUDDER_CHORD = 0.75;
const MAST = { x: 4.6, top: 12.3, truck: 0.12, foot: 0.16, head: 0.09 };
const BOOM = { y: 2.1, aft: -6.3, r: 0.1 };
const GAFF = { throat: 9, peakX: -4.8, peakY: 11.3, r: 0.08 };
const LEEBOARD = { x: 1, length: 2.2, top: 0.7, bottom: 1.05, t: 0.08, trail: (65 * Math.PI) / 180 };
/** Open waist between the fore and after decks; the hold floor lies across it. */
const WAIST = { aft: -4.4, fore: 4.3 };
const FLOOR_Y = -0.5;

/** Half-breadth at the gunwale: a full, flat-sided body with rounded ends. */
function halfBeam(x: number): number {
  return Math.max(0.12, (BEAM / 2) * (1 - Math.abs(x / HALF) ** 4));
}
/** Flat bottom with rocker toward the ends. */
const bottomY = (x: number) => -DRAFT + 0.55 * Math.abs(x / HALF) ** 4;
/** Sheer rising to both ends. */
const sheerY = (x: number) => FREEBOARD + (x >= 0 ? 0.45 : 0.35) * (x / HALF) ** 2;

const LEEBOARD_Z = halfBeam(LEEBOARD.x) + 0.05;
/** The horse hold: four files of three, 2.5 m and 0.9 m a horse, tied to the rails between the files. */
const HOLD = {
  aft: -4,
  fore: 4,
  stall: 2.5,
  files: [-1.35, -0.45, 0.45, 1.35],
  horseHalfWidth: 0.45,
  rails: [-0.9, 0, 0.9]
};

/** Inside half-breadth of the hull at a station and height, between the bottom chine and the gunwale. */
export function ferrySmackHalfBreadth(x: number, y: number): number {
  const base = bottomY(x),
    top = sheerY(x),
    hb = halfBeam(x);
  const u = Math.min(1, Math.max(0, (y - base) / (top - base)));
  return hb * (0.88 + 0.12 * u) - 0.04;
}

/**
 * An open ferry smack of the Danish belts and sounds, in meters: waterline at y = 0, bow toward positive X. Sail
 * and oar, carrying passengers, cattle and up to a dozen horses across open water.
 */
export const FERRY_SMACK = {
  author: "Claude Opus 5.5" as Author,
  name: "Open ferry smack",
  hullLength: HULL_LENGTH,
  /** Stem to the trailing edge of the rudder. */
  length: HULL_LENGTH + RUDDER_CHORD,
  /** Moulded beam of the hull. */
  beam: BEAM,
  /** Across the leeboards. */
  width: 2 * (LEEBOARD_Z + LEEBOARD.t / 2),
  depth: DEPTH,
  draft: DRAFT,
  /** Waterline to the mast truck. */
  height: MAST.top + MAST.truck,
  /** Horses stand fore and aft in four files of three, tied to the rails between them. */
  horses: HOLD.files.length * Math.floor((HOLD.fore - HOLD.aft) / HOLD.stall),
  hold: HOLD,
  note: "Schematic open ferry smack (færgesmakke) of the kind that carried travellers, horses, cattle and carts across the Danish belts, under sail and with sweeps when the wind failed. Jonge's Danmarksbeskrivelse (1777) describes the ferries as open craft for travellers, vehicles, goods, horses and cattle; the Assens–Ærø crossing of about 15 km kept two open smacks for horses and wagons, and a smack at Middelfart–Snoghøj took passengers and 10 to 12 horses (a larger transport ferry 16 to 22). On the Great Belt, Nyborg and Korsør had held a privileged ferry since the 1300s; in 1785 ten smacks made 800 round trips across about 26 km with some 6,500 passengers, 5,405 cattle and about 2,000 horses. The smakke was flat-bottomed and full-ended with near-straight sides and leeboards; its sprit sail gave way to a standing gaff in the 1700s. No dimensions of a ferry smack were found: the hull follows the mid-1700s Danish sand skude (on average 14 m long, 4.5 m wide and 1.5 m deep, flat-bottomed, one mast), which also fits twelve horses standing in four files. Mast height, sail plan, sweeps and the loading plank are proportioned, not measured. How carts were loaded is not recorded, so none is shown aboard.",
  highNote:
    "High tier: hull strakes and the deck planking; mast hoops, the shrouds with their chainplates, the forestay, peak and throat halyards and the main sheet; reef points on the mainsail; the leeboard pendants and their pivots; rail posts and breast bars in the horse hold; tholes for the sweeps; the rudder pintles; a grapnel on the foredeck."
} as const;

export interface FerrySmackMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createFerrySmackModel(
  quality: FerrySmackQuality = "low",
  state: SailingShipState = {}
): CityStructureMeshes {
  const high = quality === "high";
  const furled = state.sails === "furled";
  const group = new THREE.Group();
  group.name = `ferry-smack-${quality}-${furled ? "furled" : "set"}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const oak = new THREE.MeshLambertMaterial({ color: 0x6f4f33, side: THREE.DoubleSide });
  const tarred = new THREE.MeshLambertMaterial({ color: 0x2b2520, side: THREE.DoubleSide });
  const paint = new THREE.MeshLambertMaterial({ color: 0x2f4a5c });
  const deckWood = new THREE.MeshLambertMaterial({ color: 0xa88a60, side: THREE.DoubleSide });
  const spar = new THREE.MeshLambertMaterial({ color: 0x9a7448 });
  const canvas = new THREE.MeshLambertMaterial({ color: 0xc9a77a, side: THREE.DoubleSide });
  const iron = new THREE.MeshLambertMaterial({ color: 0x3a3b39 });
  const hemp = new THREE.MeshLambertMaterial({ color: 0x8d7a55 });
  const materials = [oak, tarred, paint, deckWood, spar, canvas, iron, hemp];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const rod = new THREE.CylinderGeometry(1, 1, 1, high ? 10 : 6);
  const taper = new THREE.CylinderGeometry(MAST.head / MAST.foot, 1, 1, high ? 12 : 8);
  geometries.add(cube).add(rod).add(taper);
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
  function bar(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, material = oak, geometry = rod) {
    const mesh = add(name, geometry, material);
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
  /** A strip between two port-to-starboard edges sampled at the given stations. */
  function strip(
    name: string,
    xs: number[],
    y: (x: number) => number,
    half: (x: number) => number,
    material: THREE.Material
  ) {
    const points = xs.flatMap(x => [x, y(x), -half(x), x, y(x), half(x)]);
    const indices: number[] = [];
    for (let i = 0; i < xs.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    return surface(name, points, indices, material);
  }
  const range = (from: number, to: number, n: number) =>
    Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);

  // Hull: sampled rings from stern to stem, flat bottom and slightly flared sides.
  const xs = range(-HALF, HALF, high ? 28 : 14);
  const rings = xs.map(x => {
    const hb = halfBeam(x),
      top = sheerY(x),
      base = Math.min(bottomY(x), top - 0.2);
    return [
      [x, top, -hb],
      [x, base, -hb * 0.88],
      [x, base, hb * 0.88],
      [x, top, hb]
    ];
  });
  const sides: number[] = [],
    floor: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const a = i * 4,
      b = a + 4;
    sides.push(a, b, a + 1, b, b + 1, a + 1, a + 2, b + 2, a + 3, b + 2, b + 3, a + 3);
    floor.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
  }
  surface("hull-side", rings.flat(2), sides, oak);
  surface("flat-bottom", rings.flat(2), floor, tarred);
  surface("stern-end", rings[0].flat(), [0, 1, 3, 1, 2, 3], oak);
  surface("bow-end", rings.at(-1)!.flat(), [0, 3, 1, 1, 3, 2], oak);
  box("stem", HALF - 0.09, (bottomY(HALF) + sheerY(HALF) + 0.3) / 2, 0, 0.18, sheerY(HALF) + 0.3 - bottomY(HALF), 0.2);
  box(
    "sternpost",
    -HALF + 0.09,
    (bottomY(-HALF) + sheerY(-HALF) + 0.2) / 2,
    0,
    0.18,
    sheerY(-HALF) + 0.2 - bottomY(-HALF),
    0.2
  );
  // Painted wale just below the gunwale.
  for (const side of [-1, 1]) {
    const wale = range(-HALF + 0.3, HALF - 0.3, high ? 20 : 10);
    for (let i = 0; i < wale.length - 1; i++) {
      const a = wale[i],
        b = wale[i + 1];
      bar("wale", v(a, sheerY(a) - 0.12, side * halfBeam(a)), v(b, sheerY(b) - 0.12, side * halfBeam(b)), 0.06, paint);
      if (high)
        for (const dy of [0.45, 0.8, 1.1])
          bar(
            "strake-seam",
            v(a, sheerY(a) - dy, side * (halfBeam(a) - 0.012 - dy * 0.012)),
            v(b, sheerY(b) - dy, side * (halfBeam(b) - 0.012 - dy * 0.012)),
            0.012,
            tarred
          );
    }
  }

  // Short fore and after decks; the waist between them is the open hold.
  const deckHalf = (x: number) => halfBeam(x) * 0.97;
  strip("foredeck", range(WAIST.fore, HALF - 0.15, 6), x => sheerY(x) - 0.1, deckHalf, deckWood);
  strip("afterdeck", range(-HALF + 0.15, WAIST.aft, 4), x => sheerY(x) - 0.1, deckHalf, deckWood);
  const floorHalf = (x: number) => ferrySmackHalfBreadth(x, FLOOR_Y);
  strip("hold-floor", range(WAIST.aft, WAIST.fore, 8), () => FLOOR_Y, floorHalf, deckWood);
  for (const x of [WAIST.aft, WAIST.fore]) {
    box("hold-bulkhead", x, (FLOOR_Y + sheerY(x) - 0.1) / 2, 0, 0.08, sheerY(x) - 0.1 - FLOOR_Y, 2 * floorHalf(x));
  }
  if (high) {
    for (const z of range(-1.9, 1.9, 9)) {
      for (const [from, to] of [
        [WAIST.fore, HALF - 0.6],
        [-HALF + 0.6, WAIST.aft]
      ]) {
        if (Math.abs(z) > Math.min(deckHalf(from), deckHalf(to)) - 0.05) continue;
        box("deck-seam", (from + to) / 2, sheerY((from + to) / 2) - 0.095, z, to - from, 0.01, 0.015, tarred);
      }
    }
  }

  // Horse hold: four files between the hull sides and three tie rails.
  const RAIL = { aft: HOLD.aft, fore: HOLD.fore, y: FLOOR_Y + 1.1 };
  for (const z of HOLD.rails) {
    box("tie-rail", (RAIL.aft + RAIL.fore) / 2, RAIL.y, z, RAIL.fore - RAIL.aft, 0.1, 0.1);
    for (const x of high ? range(RAIL.aft, RAIL.fore, 4) : [RAIL.aft, RAIL.fore])
      box("rail-post", x, (FLOOR_Y + RAIL.y) / 2, z, 0.1, RAIL.y - FLOOR_Y, 0.1);
  }
  if (high)
    for (let k = 1; k < 3; k++) {
      const x = HOLD.aft + k * HOLD.stall;
      const half = ferrySmackHalfBreadth(x, FLOOR_Y + 0.9) - 0.05;
      bar("breast-bar", v(x, FLOOR_Y + 0.9, -half), v(x, FLOOR_Y + 0.9, half), 0.03);
    }
  // Sweeps stowed on the outer tie rails, the loading plank on the centre one.
  for (const z of [HOLD.rails[0], HOLD.rails[2]])
    bar("sweep", v(-3.6, RAIL.y + 0.09, z), v(2.8, RAIL.y + 0.09, z), 0.045, spar);
  box("loading-plank", -2.4, RAIL.y + 0.09, 0, 4, 0.08, 0.6, deckWood);
  if (high) {
    for (const side of [-1, 1])
      for (const x of [-3.2, -1, 1.2]) {
        const top = sheerY(x);
        bar("thole", v(x, top, side * (halfBeam(x) - 0.04)), v(x, top + 0.22, side * (halfBeam(x) - 0.04)), 0.025);
      }
  }

  // Leeboards, half raised so they trail aft along the sides.
  for (const side of [-1, 1]) {
    const pivot = v(LEEBOARD.x, sheerY(LEEBOARD.x), side * LEEBOARD_Z);
    const shape = new THREE.Shape();
    shape.moveTo(-LEEBOARD.top / 2, 0);
    shape.lineTo(LEEBOARD.top / 2, 0);
    shape.lineTo(LEEBOARD.bottom / 2, -LEEBOARD.length);
    shape.quadraticCurveTo(0, -LEEBOARD.length - 0.25, -LEEBOARD.bottom / 2, -LEEBOARD.length);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: LEEBOARD.t, bevelEnabled: false });
    geometry.translate(0, 0, -LEEBOARD.t / 2);
    const board = add("leeboard", geometry, oak);
    board.position.copy(pivot);
    board.rotation.z = -LEEBOARD.trail;
    if (high) {
      bar(
        "leeboard-pivot",
        v(pivot.x, pivot.y, side * (LEEBOARD_Z - 0.06)),
        v(pivot.x, pivot.y, side * (LEEBOARD_Z + 0.035)),
        0.04,
        iron
      );
      const tip = v(0, -LEEBOARD.length, 0).applyEuler(board.rotation).add(pivot);
      bar(
        "leeboard-pendant",
        tip,
        v(pivot.x - 1.2, sheerY(pivot.x - 1.2) + 0.1, side * (LEEBOARD_Z - 0.08)),
        0.015,
        hemp
      );
    }
  }

  // Rudder hung on the sternpost with a tiller over the afterdeck.
  const rudderTop = sheerY(-HALF) + 0.25;
  const blade = new THREE.Shape();
  blade.moveTo(0, -0.75);
  blade.lineTo(-RUDDER_CHORD, -0.6);
  blade.lineTo(-RUDDER_CHORD * 0.55, rudderTop - 0.4);
  blade.lineTo(-0.2, rudderTop);
  blade.lineTo(0, rudderTop);
  blade.closePath();
  const bladeGeometry = new THREE.ExtrudeGeometry(blade, { depth: 0.1, bevelEnabled: false });
  bladeGeometry.translate(-HALF, 0, -0.05);
  add("rudder", bladeGeometry, oak);
  bar("tiller", v(-HALF - 0.1, rudderTop - 0.05, 0), v(-HALF + 1.6, rudderTop + 0.2, 0), 0.05);
  if (high) for (const y of [-0.3, 0.3]) box("rudder-pintle", -HALF - 0.05, y, 0, 0.14, 0.05, 0.16, iron);

  // Mast, boom and gaff.
  const deckAtMast = sheerY(MAST.x) - 0.1;
  bar("mast", v(MAST.x, FLOOR_Y, 0), v(MAST.x, MAST.top, 0), MAST.foot, spar, taper);
  bar("mast-truck", v(MAST.x, MAST.top, 0), v(MAST.x, MAST.top + MAST.truck, 0), 0.11, spar);
  const boomFore = MAST.x - MAST.foot - 0.05;
  bar("boom", v(boomFore, BOOM.y, 0), v(BOOM.aft, BOOM.y, 0), BOOM.r, spar);
  const throat = v(boomFore, furled ? BOOM.y + 0.32 : GAFF.throat, 0);
  const gaffLength = Math.hypot(boomFore - GAFF.peakX, GAFF.peakY - GAFF.throat);
  const peak = furled ? v(boomFore - gaffLength, BOOM.y + 0.38, 0) : v(GAFF.peakX, GAFF.peakY, 0);
  bar("gaff", throat, peak, GAFF.r, spar);
  const stemHead = v(HALF - 0.12, sheerY(HALF) + 0.25, 0);
  const forestayTop = v(MAST.x, 10.6, 0);
  if (furled) {
    bar("furled-mainsail", v(boomFore - 0.3, BOOM.y + 0.17, 0), v(BOOM.aft + 0.3, BOOM.y + 0.17, 0), 0.16, canvas);
    bar("furled-foresail", stemHead.clone().add(v(-0.3, 0.05, 0)), v(MAST.x + 0.6, deckAtMast + 0.2, 0), 0.12, canvas);
  } else {
    // Mainsail between mast, gaff and boom, with a little belly to leeward.
    const luffFoot = v(boomFore, BOOM.y + 0.05, 0);
    const clew = v(BOOM.aft + 0.15, BOOM.y + 0.05, 0);
    const n = 6;
    const points: number[] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const bottom = luffFoot.clone().lerp(clew, u);
      const top = throat.clone().lerp(peak, u);
      for (let j = 0; j <= n; j++) {
        const w = j / n;
        const p = bottom.clone().lerp(top, w);
        p.z = 0.6 * Math.sin(Math.PI * u) * Math.sin(Math.PI * w);
        points.push(p.x, p.y, p.z);
      }
    }
    const indices: number[] = [];
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const a = i * (n + 1) + j,
          b = a + n + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    surface("mainsail", points, indices, canvas);
    // Foresail set flying on the forestay.
    const head = stemHead.clone().lerp(forestayTop, 0.9);
    const tack = stemHead.clone().add(v(-0.15, 0.1, 0));
    const sheet = v(MAST.x + 0.5, deckAtMast + 0.9, 0.5);
    surface("foresail", [tack.x, tack.y, tack.z, head.x, head.y, head.z, sheet.x, sheet.y, sheet.z], [0, 1, 2], canvas);
    if (high)
      for (const u of [0.25, 0.5, 0.75])
        for (const w of [0.14, 0.24]) {
          const p = luffFoot.clone().lerp(clew, u).lerp(throat.clone().lerp(peak, u), w);
          p.z = 0.6 * Math.sin(Math.PI * u) * Math.sin(Math.PI * w);
          bar("reef-point", v(p.x, p.y, p.z - 0.12), v(p.x, p.y, p.z + 0.12), 0.01, hemp);
        }
  }

  if (high) {
    for (let y = BOOM.y + 0.6; y < (furled ? BOOM.y + 1.4 : GAFF.throat); y += 0.8) {
      const hoop = add("mast-hoop", new THREE.TorusGeometry(MAST.foot * 0.9 + 0.03, 0.02, 4, 12), spar);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.set(MAST.x, y, 0);
    }
    const hound = v(MAST.x, 10.5, 0);
    for (const side of [-1, 1]) {
      for (const dx of [-0.4, -1.1]) {
        const x = MAST.x + dx;
        const plate = v(x, sheerY(x) - 0.25, side * (halfBeam(x) + 0.02));
        box("chainplate", plate.x, plate.y + 0.1, plate.z, 0.06, 0.4, 0.03, iron);
        bar("shroud", plate.clone().add(v(0, 0.3, 0)), hound, 0.018, tarred);
      }
    }
    bar("forestay", stemHead, forestayTop, 0.018, tarred);
    bar("throat-halyard", v(MAST.x + 0.12, MAST.top - 0.6, 0), throat, 0.012, hemp);
    bar("peak-halyard", v(MAST.x + 0.12, MAST.top - 0.3, 0), peak.clone().lerp(throat, 0.35), 0.012, hemp);
    bar("main-sheet", v(BOOM.aft + 0.4, BOOM.y, 0), v(-HALF + 0.8, sheerY(-HALF + 0.8) - 0.05, 0), 0.015, hemp);
    const grapnel = v(5.6, sheerY(5.6) - 0.02, -0.9);
    bar("grapnel-shank", grapnel, grapnel.clone().add(v(0.9, 0, 0)), 0.03, iron);
    for (const dz of [-0.2, 0.2]) bar("grapnel-fluke", grapnel, grapnel.clone().add(v(-0.15, 0.03, dz)), 0.025, iron);
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

export function createFerrySmack(quality: FerrySmackQuality = "low", state: SailingShipState = {}): FerrySmackMeshes {
  const model = createFerrySmackModel(quality, state);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
