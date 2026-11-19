import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

export type FerryNachenQuality = "low" | "high";

/** 40 × 5 × 2¼ Prussian feet (0.3139 m). */
const LENGTH = 12.56;
const BEAM = 1.57;
const DEPTH = 0.7;
const DRAFT = 0.2;
const HALF = LENGTH / 2;
const FREEBOARD = DEPTH - DRAFT;
/** The bottom sweeps up to the pointed ends like a spoon. */
const END_RISE = 0.85;
const SHEER_RISE = 0.35;
/** Bottom half-breadth as a share of the gunwale: the sides flare outward. */
const FLARE = 0.72;
const THWARTS = [-3.5, -1.75, 0, 1.75, 3.5];

const halfBeam = (x: number) => Math.max(0.04, (BEAM / 2) * (1 - Math.abs(x / HALF) ** 2.4));
const sheerY = (x: number) => FREEBOARD + SHEER_RISE * (x / HALF) ** 2;
const bottomY = (x: number) => Math.min(-DRAFT + END_RISE * Math.abs(x / HALF) ** 3, sheerY(x) - 0.08);

/**
 * A rowed and poled river ferry boat (Fährnachen) for foot passengers and small loads, in meters: waterline at y = 0,
 * double-ended with the long axis on X.
 */
export const FERRY_NACHEN = {
  author: "Claude Opus 5.5" as Author,
  name: "Rowed river ferry boat (Fährnachen)",
  length: LENGTH,
  beam: BEAM,
  depth: DEPTH,
  draft: DRAFT,
  /** Waterline to the top of the raised ends. */
  height: sheerY(HALF),
  /** Two to a thwart, besides the boatman. */
  passengers: 2 * THWARTS.length,
  note: "Schematic flat-bottomed river ferry boat of the Rhine and its tributaries, for foot passengers, small goods and small animals; carts and large livestock crossed by ford, by the larger Ponte or not at all. The size follows the larger of the two ferry boats at Weldergoven on the Sieg in the register of Sieg ferries of 15 April 1846: 40 × 5 × 2¼ Prussian feet, 12.56 m long, 1.57 m wide and 0.70 m deep, kept mainly to set people across (the smaller was 9.42 × 0.86 × 0.47 m). The form follows the Mosel 'Dreibord' built from three stout boards, one for the bottom and two for the sides, worked by one or two boatmen with the pole (Deibaam) and hand oars; purpose-built passenger Nachen took six to ten people. Dieren on the IJssel kept two such boats of just over 5 × 0.95 m beside its large pont. Bottom rocker, flare, sheer, thwart spacing and the oars are proportioned, not measured. Static model with the oars shipped.",
  highNote:
    "High tier: frames along both sides, loose floor boards, the gunwale cap and the seams of the side boards; tholes with their grommets, the pole's iron shoe, a painter at each end and a wooden bailer."
} as const;

export interface FerryNachenMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createFerryNachenModel(quality: FerryNachenQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `ferry-nachen-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const oak = new THREE.MeshLambertMaterial({ color: 0x6b4c31, side: THREE.DoubleSide });
  const tarred = new THREE.MeshLambertMaterial({ color: 0x2a231d, side: THREE.DoubleSide });
  const plank = new THREE.MeshLambertMaterial({ color: 0xa3845b });
  const spar = new THREE.MeshLambertMaterial({ color: 0x9a7448 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x3a3b39 });
  const hemp = new THREE.MeshLambertMaterial({ color: 0x8d7a55 });
  const materials = [oak, tarred, plank, spar, iron, hemp];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const rod = new THREE.CylinderGeometry(1, 1, 1, high ? 8 : 6);
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
  const range = (from: number, to: number, n: number) =>
    Array.from({ length: n + 1 }, (_, i) => from + ((to - from) * i) / n);
  /** Inside half-breadth at a station and height. */
  const insideHalf = (x: number, y: number) => {
    const base = bottomY(x),
      top = sheerY(x);
    const u = Math.min(1, Math.max(0, (y - base) / (top - base)));
    return halfBeam(x) * (FLARE + (1 - FLARE) * u) - 0.03;
  };

  // Hull: one bottom board and one side board each side, closed at the pointed ends.
  const xs = range(-HALF, HALF, high ? 32 : 16);
  const rings = xs.map(x => {
    const hb = halfBeam(x);
    return [
      [x, sheerY(x), -hb],
      [x, bottomY(x), -hb * FLARE],
      [x, bottomY(x), hb * FLARE],
      [x, sheerY(x), hb]
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
  surface("side-board", rings.flat(2), sides, oak);
  surface("bottom-board", rings.flat(2), bottom, tarred);
  surface("end-post", rings[0].flat(), [0, 1, 3, 1, 2, 3], oak);
  surface("end-post", rings.at(-1)!.flat(), [0, 3, 1, 1, 3, 2], oak);

  // Gunwale cap.
  const cap = range(-HALF + 0.25, HALF - 0.25, high ? 16 : 8);
  for (const side of [-1, 1])
    for (let i = 0; i < cap.length - 1; i++) {
      const a = cap[i],
        b = cap[i + 1];
      bar(
        "gunwale",
        v(a, sheerY(a) - 0.02, side * (halfBeam(a) - 0.025)),
        v(b, sheerY(b) - 0.02, side * (halfBeam(b) - 0.025)),
        0.025,
        tarred
      );
      if (high) {
        const seam = (x: number) =>
          v(x, (sheerY(x) + bottomY(x)) / 2, side * (halfBeam(x) * (FLARE + 1) * 0.5 + 0.004));
        bar("side-seam", seam(a), seam(b), 0.008, tarred);
      }
    }

  // Thwarts for passengers; the boatman stands aft with the pole.
  for (const x of THWARTS) {
    const y = sheerY(x) - 0.22;
    box("thwart", x, y, 0, 0.26, 0.05, 2 * insideHalf(x, y));
  }
  if (high) {
    for (const x of range(-HALF + 1.1, HALF - 1.1, 16)) {
      for (const side of [-1, 1]) {
        const a = v(x, bottomY(x) + 0.03, side * (insideHalf(x, bottomY(x)) - 0.01));
        const b = v(x, sheerY(x) - 0.04, side * (insideHalf(x, sheerY(x)) - 0.01));
        bar("frame", a, b, 0.025);
      }
    }
    // Loose floor boards in short lengths that follow the rocker of the bottom.
    const boards = range(-4.2, 4.2, 12);
    for (let i = 0; i < boards.length - 1; i++) {
      const a = boards[i],
        b = boards[i + 1];
      const y = Math.max(bottomY(a), bottomY(b)) + 0.06;
      for (const z of [-0.3, 0, 0.3]) box("floor-board", (a + b) / 2, y, z, b - a - 0.02, 0.025, 0.22, plank);
    }
  }

  // Oars shipped along the thwarts, the pole along the side.
  for (const z of [-0.25, 0.25]) {
    const y = sheerY(0) - 0.22 + 0.05;
    bar("oar", v(-3.2, y, z), v(0.8, y, z), 0.025, spar);
    box("oar-blade", 1.15, y, z, 0.7, 0.02, 0.14, spar);
  }
  const poleY = sheerY(0) - 0.22 + 0.05;
  bar("pole", v(-2.6, poleY, -0.5), v(2.4, poleY, -0.5), 0.03, spar);
  if (high) {
    bar("pole-shoe", v(2.4, poleY, -0.5), v(2.6, poleY, -0.5), 0.028, iron);
    for (const side of [-1, 1]) {
      const x = 0.95;
      const base = v(x, sheerY(x), side * (halfBeam(x) - 0.06));
      bar("thole", base, base.clone().add(v(0, 0.16, 0)), 0.018);
      const grommet = add("thole-grommet", new THREE.TorusGeometry(0.035, 0.01, 4, 10), hemp);
      grommet.rotation.x = Math.PI / 2;
      grommet.position.copy(base).add(v(0, 0.06, 0));
    }
    for (const end of [-1, 1]) {
      const x = end * (HALF - 0.5);
      bar("painter", v(x, sheerY(x) - 0.05, 0), v(x - end * 0.8, bottomY(x - end * 0.8) + 0.12, 0.1), 0.012, hemp);
    }
    box("bailer", -4.9, bottomY(-4.9) + 0.07, 0.15, 0.24, 0.1, 0.16, plank);
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

export function createFerryNachen(quality: FerryNachenQuality = "low"): FerryNachenMeshes {
  const model = createFerryNachenModel(quality);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
