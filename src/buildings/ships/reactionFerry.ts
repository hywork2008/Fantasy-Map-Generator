import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

export type ReactionFerryQuality = "low" | "high";

/** Kuhn's conversion for the St. Goar records: 82.5 Schuh = 23.5 m. */
const SCHUH = 23.5 / 82.5;
/** Each of the two identical bridge ships, 1772: 82.5 × 12.5 × 5.2 Schuh (Kuhn rounds to 23.5 × 3.5 × 1.5 m). */
const HULL = { length: 82.5 * SCHUH, beam: 12.5 * SCHUH, depth: 5.2 * SCHUH };
const HALF = HULL.length / 2;
const DRAFT = 0.6;
/** Clear water between the two hulls; not recorded, proportioned to a narrow ferry. */
const GAP = 1.2;
const HULL_Z = GAP / 2 + HULL.beam / 2;
/** The load floor stands on 6-Schuh posts inside the hulls and runs 60 Schuh over them. */
const DECK = { y: -DRAFT + 6 * SCHUH, fore: (60 * SCHUH) / 2, aft: -(60 * SCHUH) / 2, half: HULL_Z + HULL.beam / 2 };
/** An after platform for the rudders, the cabins and the rope winch. */
const AFT_PLATFORM = -10.6;
const RUB = 0.1;
const RUDDER_CHORD = 1.3;
/** The crossbars (Katze) about 7 m above the floor; the rope runs loose between them. */
const KATZE = { low: DECK.y + 7, high: DECK.y + 7.4 };
const MAST = { big: DECK.y + 10, small: DECK.y + 8.6, r: 0.2 };
const BELL_HOUSE = { size: 1, height: 1.1, roof: 0.8 };
/** Gates amidships on both long sides for carts coming off the landing stages. */
const GATE_HALF = 2.2;

/** Half-breadth of one hull: a broad raked bow (Kaffe) and a fine, raised stern. */
function hullHalf(x: number): number {
  const t = x / HALF;
  return t >= 0 ? Math.max(0.55, (HULL.beam / 2) * (1 - t ** 5)) : Math.max(0.08, (HULL.beam / 2) * (1 - (-t) ** 2.6));
}
const hullBottom = (x: number) => {
  const t = x / HALF;
  return -DRAFT + (t >= 0 ? 1.3 * t ** 6 : 0.9 * (-t) ** 4);
};
const hullSheer = (x: number) => {
  const t = x / HALF;
  return -DRAFT + HULL.depth + (t >= 0 ? 0.2 * t ** 2 : 0.3 * t ** 4);
};

/**
 * A reaction ferry (Gierponte, fliegende Brücke) of the Rhine, after the St. Goar ferry of 1772, in meters: waterline
 * at y = 0, the hulls along X with the bows upstream at positive X.
 */
export const REACTION_FERRY = {
  author: "Claude Opus 5.5" as Author,
  name: "Rhine reaction ferry (Gierponte)",
  hull: HULL,
  gap: GAP,
  /** Stem of the hulls to the trailing edge of the rudders. */
  length: HULL.length + RUDDER_CHORD,
  /** Across the rubbing timbers of the load floor. */
  width: 2 * (DECK.half + RUB),
  draft: DRAFT,
  deckY: DECK.y,
  deckLength: DECK.fore - DECK.aft,
  /** Waterline to the roof of the bell house on the great mast. */
  height: MAST.big + BELL_HOUSE.height + BELL_HOUSE.roof,
  katze: KATZE,
  gateWidth: 2 * GATE_HALF,
  note: "Schematic Rhine reaction ferry (Gierponte, 'flying bridge'). Two identical flat-bottomed river ships (Frankenschiffe) are joined by a load floor; the ferry hangs on a rope that runs loose between two crossbars (the Katze) high over the floor and on to a long chain anchored upstream in the river and held above the water by up to nine small boats (Buchtnachen). Set at an angle to the current with the two great rudders, it swings across like a pendulum from landing stage to landing stage without oars or sail. First at Nijmegen in 1657, on the Rhine from Mannheim (1669), Cologne-Deutz (1674) and St. Goar (1693); after about 150 years many gave way to standing pontoon bridges. After H. W. Kuhn, Frühe Gierponten (Deutsches Schiffahrtsarchiv 6, 1983): the St. Goar ships of 1772 measured 82.5 × 12.5 × 5.2 Schuh (23.5 × 3.56 × 1.48 m at Kuhn's 82.5 Schuh = 23.5 m; he rounds to 23.5 × 3.5 × 1.5 m); the estimate of that year lists 60-Schuh frames built into the ships, 132 posts of 6 Schuh to carry the floor, 116 turned balusters, two straight and four curved rubbing timbers, two cabins, two rudders, a great mast with a bell house, a smaller mast and a sentry box; the Katze stood about 7 m above the floor. The gap between the hulls, the floor width, the hull lines and the mast heights are proportioned, not recorded. The chain and its boats run far upstream and are shown only as the rope leaving the bow. Landings need floating stages to follow the river level.",
  highNote:
    "High tier: turned balusters round the floor, deck planking, the shrouds and backstays of both masts, the cornices and the bell in its house, a pennant, the two anchor capstans (Spills), two bilge pumps, the rope bollard (Bock) and the winch crank, iron rudder fittings and the rubbing timbers' curved corners."
} as const;

export interface ReactionFerryMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createReactionFerryModel(quality: ReactionFerryQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `reaction-ferry-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const oak = new THREE.MeshLambertMaterial({ color: 0x6b4c31, side: THREE.DoubleSide });
  const tarred = new THREE.MeshLambertMaterial({ color: 0x2a231d, side: THREE.DoubleSide });
  const deckWood = new THREE.MeshLambertMaterial({ color: 0xa88a60, side: THREE.DoubleSide });
  const fir = new THREE.MeshLambertMaterial({ color: 0x9a7448 });
  const paint = new THREE.MeshLambertMaterial({ color: 0x8c3b2a });
  const roofTile = new THREE.MeshLambertMaterial({ color: 0x4b5258 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x3a3b39 });
  const brass = new THREE.MeshLambertMaterial({ color: 0xa98a3f });
  const hemp = new THREE.MeshLambertMaterial({ color: 0x8d7a55 });
  const materials = [oak, tarred, deckWood, fir, paint, roofTile, iron, brass, hemp];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const rod = new THREE.CylinderGeometry(1, 1, 1, high ? 10 : 6);
  const pyramid = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
  pyramid.rotateY(Math.PI / 4);
  geometries.add(cube).add(rod).add(pyramid);
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
  const range = (from: number, to: number, n: number) =>
    Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);

  // Two identical bridge ships.
  const xs = range(-HALF, HALF, high ? 30 : 16);
  for (const zc of [-HULL_Z, HULL_Z]) {
    const rings = xs.map(x => {
      const hb = hullHalf(x),
        top = hullSheer(x),
        base = Math.min(hullBottom(x), top - 0.15);
      return [
        [x, top, zc - hb],
        [x, base, zc - hb * 0.9],
        [x, base, zc + hb * 0.9],
        [x, top, zc + hb]
      ];
    });
    const sides: number[] = [],
      bottom: number[] = [];
    for (let i = 0; i < rings.length - 1; i++) {
      const a = i * 4,
        b = a + 4;
      sides.push(a, b, a + 1, b, b + 1, a + 1, a + 2, b + 2, a + 3, b + 2, b + 3, a + 3);
      bottom.push(a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
    }
    surface("bridge-ship", rings.flat(2), sides, oak);
    surface("bridge-ship-bottom", rings.flat(2), bottom, tarred);
    surface("bow-kaffe", rings.at(-1)!.flat(), [0, 3, 1, 1, 3, 2], oak);
    surface("stern", rings[0].flat(), [0, 1, 3, 1, 2, 3], oak);
    // Wale along the sheer.
    const wale = range(-HALF + 1, HALF - 0.5, high ? 16 : 8);
    for (const side of [-1, 1])
      for (let i = 0; i < wale.length - 1; i++) {
        const a = wale[i],
          b = wale[i + 1];
        bar(
          "wale",
          v(a, hullSheer(a) - 0.15, zc + side * (hullHalf(a) - 0.04)),
          v(b, hullSheer(b) - 0.15, zc + side * (hullHalf(b) - 0.04)),
          0.05,
          tarred
        );
      }
    // Great blade rudder on the sternpost with its tiller over the after platform.
    const blade = new THREE.Shape();
    blade.moveTo(0, -DRAFT + 0.05);
    blade.lineTo(-RUDDER_CHORD, -DRAFT + 0.25);
    blade.lineTo(-RUDDER_CHORD * 0.6, hullSheer(-HALF) - 0.6);
    blade.lineTo(0, hullSheer(-HALF));
    blade.closePath();
    const rudderGeometry = new THREE.ExtrudeGeometry(blade, { depth: 0.14, bevelEnabled: false });
    rudderGeometry.translate(-HALF, 0, zc - 0.07);
    add("rudder", rudderGeometry, oak);
    bar("tiller", v(-HALF + 0.05, hullSheer(-HALF) - 0.1, zc), v(AFT_PLATFORM + 0.1, DECK.y + 0.9, zc), 0.07);
    if (high) for (const y of [-0.2, 0.6]) box("rudder-iron", -HALF - 0.05, y, zc, 0.2, 0.06, 0.2, iron);
  }

  // Load floor across both ships, with an after platform.
  box("load-floor", (DECK.fore + DECK.aft) / 2, DECK.y - 0.08, 0, DECK.fore - DECK.aft, 0.16, 2 * DECK.half, deckWood);
  box(
    "after-platform",
    (DECK.aft + AFT_PLATFORM) / 2,
    DECK.y - 0.08,
    0,
    DECK.aft - AFT_PLATFORM,
    0.16,
    2 * DECK.half - 0.6,
    deckWood
  );
  // Floor posts down into the ships at the deck ends, where they show.
  for (const zc of [-HULL_Z, HULL_Z])
    for (const x of [DECK.fore - 0.3, DECK.aft + 0.3])
      box("floor-post", x, (hullSheer(x) + DECK.y) / 2 - 0.1, zc, 0.25, DECK.y - hullSheer(x) + 0.2, 0.25);
  for (const side of [-1, 1])
    box(
      "rubbing-timber",
      (DECK.fore + DECK.aft) / 2,
      DECK.y - 0.12,
      side * (DECK.half + RUB / 2),
      DECK.fore - DECK.aft - 1.2,
      0.24,
      RUB,
      tarred
    );
  if (high) {
    for (const z of range(-DECK.half + 0.2, DECK.half - 0.2, 24))
      box("deck-seam", (DECK.fore + DECK.aft) / 2, DECK.y + 0.002, z, DECK.fore - DECK.aft - 0.1, 0.004, 0.02, tarred);
    // Curved corner timbers.
    for (const end of [-1, 1])
      for (const side of [-1, 1]) {
        const cx = end > 0 ? DECK.fore - 0.6 : DECK.aft + 0.6;
        const corner = add(
          "rubbing-timber-corner",
          new THREE.TorusGeometry(0.6 + RUB / 2, RUB / 2, 4, 6, Math.PI / 2),
          tarred
        );
        corner.rotation.x = -Math.PI / 2;
        corner.rotation.z = end > 0 ? (side > 0 ? 0 : -Math.PI / 2) : side > 0 ? Math.PI / 2 : Math.PI;
        corner.position.set(cx, DECK.y - 0.12, side * (DECK.half - 0.6));
      }
  }

  // Railing round the floor, open at the gates amidships on both sides and across the ends for the rudders.
  const railY = DECK.y + 1;
  const railRuns: [THREE.Vector3, THREE.Vector3][] = [];
  for (const side of [-1, 1]) {
    const z = side * (DECK.half - 0.08);
    railRuns.push(
      [v(DECK.aft + 0.1, railY, z), v(-GATE_HALF, railY, z)],
      [v(GATE_HALF, railY, z), v(DECK.fore - 0.1, railY, z)]
    );
  }
  railRuns.push([v(DECK.fore - 0.08, railY, -DECK.half + 0.1), v(DECK.fore - 0.08, railY, DECK.half - 0.1)]);
  for (const [a, b] of railRuns) {
    bar("rail", a, b, 0.05, paint);
    const n = Math.max(1, Math.round(a.distanceTo(b) / (high ? 0.45 : 1.6)));
    for (const t of range(0, 1, n)) {
      const p = a.clone().lerp(b, t);
      if (high) bar("baluster", v(p.x, DECK.y, p.z), v(p.x, railY - 0.05, p.z), 0.045, paint);
      else bar("rail-post", v(p.x, DECK.y, p.z), v(p.x, railY, p.z), 0.06, paint);
    }
  }

  // Masts on each ship and the two crossbars between them.
  const bigZ = HULL_Z,
    smallZ = -HULL_Z;
  bar("great-mast", v(0, DECK.y, bigZ), v(0, MAST.big, bigZ), MAST.r, fir);
  bar("small-mast", v(0, DECK.y, smallZ), v(0, MAST.small, smallZ), MAST.r * 0.85, fir);
  for (const y of [KATZE.low, KATZE.high]) box("katze", 0, y, 0, 0.3, 0.22, 2 * HULL_Z + 0.5, fir);
  // The bell house crowns the great mast.
  const bellBase = MAST.big;
  box(
    "bell-house",
    0,
    bellBase + BELL_HOUSE.height / 2,
    bigZ,
    BELL_HOUSE.size,
    BELL_HOUSE.height,
    BELL_HOUSE.size,
    paint
  );
  const roof = add("bell-roof", pyramid, roofTile);
  roof.position.set(0, bellBase + BELL_HOUSE.height + BELL_HOUSE.roof / 2, bigZ);
  roof.scale.set(BELL_HOUSE.size + 0.2, BELL_HOUSE.roof, BELL_HOUSE.size + 0.2);

  // The yaw rope: forward to the chain beyond the bows, between the crossbars, aft over the bollard to the winch.
  const ropeY = (KATZE.low + KATZE.high) / 2;
  const bollard = v(DECK.aft, DECK.y + 1.5, 0);
  const winch = v(-9.6, DECK.y + 0.75, 0);
  bar("yaw-rope", v(HALF - 0.05, DECK.y + 6, 0), v(0, ropeY, 0), 0.04, hemp);
  bar("yaw-rope", v(0, ropeY, 0), bollard, 0.04, hemp);
  bar("yaw-rope", bollard, winch, 0.04, hemp);
  box("rope-bollard", DECK.aft, DECK.y + 0.75, 0, 0.3, 1.5, 0.5, oak);
  box("winch-frame", -9.6, DECK.y + 0.5, 0, 0.8, 1, 1.6, oak);
  bar("winch-drum", v(-9.6, DECK.y + 0.75, -0.6), v(-9.6, DECK.y + 0.75, 0.6), 0.25, oak);

  // Crew cabins on the after platform, and the sentry box at the fore corner.
  for (const z of [-HULL_Z, HULL_Z]) {
    box("cabin", -9.4, DECK.y + 1.05, z * 1.05, 2, 2.1, 2.4, oak);
    const cabinRoof = add("cabin-roof", pyramid, roofTile);
    cabinRoof.position.set(-9.4, DECK.y + 2.4, z * 1.05);
    cabinRoof.scale.set(2.6, 0.6, 3);
  }
  box("sentry-box", DECK.fore - 0.8, DECK.y + 1.1, -(DECK.half - 0.8), 1, 2.2, 1, paint);

  if (high) {
    for (const [mz, top] of [
      [bigZ, MAST.big],
      [smallZ, MAST.small]
    ] as const) {
      const hound = v(0, top - 0.6, mz);
      // Shrouds outboard and inboard, fore and aft of the mast.
      for (const dx of [-3.2, 3.2])
        for (const dz of [-1.4, 1.4]) bar("shroud", hound, v(dx, DECK.y + 0.05, mz + dz), 0.02, tarred);
      box("cornice", 0, top - 0.3, mz, 0.65, 0.18, 0.65, paint);
    }
    const bell = add("bell", new THREE.ConeGeometry(0.28, 0.4, 12, 1, true), brass);
    bell.position.set(0, bellBase + 0.55, bigZ);
    surface(
      "pennant",
      [0, MAST.small - 0.2, smallZ, -2.2, MAST.small - 0.45, smallZ, 0, MAST.small - 0.7, smallZ],
      [0, 1, 2],
      paint
    );
    for (const z of [-HULL_Z, HULL_Z]) {
      bar("anchor-capstan", v(DECK.fore - 1.6, DECK.y, z), v(DECK.fore - 1.6, DECK.y + 0.9, z), 0.22, oak);
      for (const a of [0, Math.PI / 2])
        bar(
          "capstan-bar",
          v(DECK.fore - 1.6 - Math.cos(a) * 0.9, DECK.y + 0.75, z - Math.sin(a) * 0.9),
          v(DECK.fore - 1.6 + Math.cos(a) * 0.9, DECK.y + 0.75, z + Math.sin(a) * 0.9),
          0.04
        );
      box("bilge-pump", 1.4, DECK.y + 0.45, z, 0.3, 0.9, 0.3, oak);
      bar("pump-handle", v(1.4, DECK.y + 0.9, z), v(2.2, DECK.y + 1.1, z), 0.03, iron);
    }
    bar("winch-crank", v(-9.6, DECK.y + 0.75, 0.8), v(-9.6, DECK.y + 1.15, 0.8), 0.03, iron);
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

export function createReactionFerry(quality: ReactionFerryQuality = "low"): ReactionFerryMeshes {
  const model = createReactionFerryModel(quality);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
