import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

export type TudorLodgingQuality = "low" | "high";

const YARD = 0.9144;
/** One breadth of tent canvas, inferred from the roof slopes of the tent drawings as about a yard. */
const BREADTH = YARD;

/** "Two round houses of 50 gores apiece 6¾ yards deep in the roof, 25 breadths in the walls, 2½ yards deep." */
const ROUND = { gores: 50, roofDepth: 6.75 * YARD, breadths: 25, wall: 2.5 * YARD };
const ROUND_R = (ROUND.breadths * BREADTH) / (2 * Math.PI);
const ROUND_RISE = Math.sqrt(ROUND.roofDepth ** 2 - ROUND_R ** 2);

/** Halls: 8 roof breadths, 16 gores to each round end, roof 4 yards deep, 32 wall breadths 2½ yards deep. */
const HALL = { roofBreadths: 8, goresPerEnd: 16, roofDepth: 4 * YARD, wallBreadths: 32, wall: 2.5 * YARD };
const HALL_STRAIGHT = HALL.roofBreadths * BREADTH;
/** The wall runs round both straight sides and both half-round ends. */
const HALL_R = (HALL.wallBreadths * BREADTH - 2 * HALL_STRAIGHT) / (2 * Math.PI);
const HALL_RISE = Math.sqrt(HALL.roofDepth ** 2 - HALL_R ** 2);

/** Tresauntes (covered passages): 2 roof breadths 2¼ yards deep over the ridge, 4 wall breadths 2½ yards deep. */
const PASSAGE = { roofBreadths: 2, roofDepth: 2.25 * YARD, wall: 2.5 * YARD };
const PASSAGE_LENGTH = PASSAGE.roofBreadths * BREADTH;
/** The passage's width is not recorded; a 45-degree roof over its two slopes. */
const PASSAGE_HALF = (PASSAGE.roofDepth / 2) * Math.SQRT1_2;
const PASSAGE_RISE = PASSAGE_HALF;

/** Hall along X at the origin; the passage leaves its +Z side to the round house. */
const ROUND_Z = HALL_R + PASSAGE_LENGTH + ROUND_R;
const VANE = { pole: 1.1, width: 0.55, height: 0.4 };

/**
 * Part of Henry VIII's lesser field lodging of canvas, from the inventory taken at his death in 1547: a hall, a
 * round house and the covered passage between them, in meters with the ground at y = 0.
 */
export const TUDOR_LODGING = {
  author: "Claude Opus 5.5" as Author,
  name: "Tudor royal field lodging (1547 inventory)",
  breadth: BREADTH,
  round: { ...ROUND, radius: ROUND_R, rise: ROUND_RISE, peak: ROUND.wall + ROUND_RISE },
  hall: { ...HALL, straight: HALL_STRAIGHT, radius: HALL_R, rise: HALL_RISE, ridge: HALL.wall + HALL_RISE },
  passage: { ...PASSAGE, length: PASSAGE_LENGTH, halfWidth: PASSAGE_HALF, ridge: PASSAGE.wall + PASSAGE_RISE },
  roundZ: ROUND_Z,
  note: "Schematic part of Henry VIII's lesser field lodging of canvas, 'garnished with great branch of blue buckram', as listed in the inventory taken at his death in 1547 (ed. D. Starkey, 1998; read by W. McLean, 'The Cut of Henry VIII's Tents', 2015): one of its three halls (8 roof breadths, 16 gores to each round end, roof 4 yards deep, 32 wall breadths 2½ yards deep), one of its two round houses (50 gores, roof 6¾ yards deep, 25 wall breadths 2½ yards deep, with roses of red say in the top inside and out) and a tresaunte, the covered passage that joined them (2 roof breadths 2¼ yards deep, 4 wall breadths). Round tents regularly had twice as many roof gores as wall breadths; halls had straight sides and half-round gored ends. A breadth of canvas is taken as about a yard, inferred from the roof slopes of the surviving tent drawings, so the plan sizes follow from the counts: a round house about 7.3 m across with its peak about 7.3 m up, a hall about 12 × 4.7 m. The inventory also lists ironwork vanes painted and gilded with the king's arms and badges for the poles. The passage's width, the poles, the guys and the placement of the buckram branches are interpreted. Royal and noble lodgings like this stood among rows of plain round, oval and wedge tents in camps such as Boulogne, 1544.",
  highNote:
    "High tier: the gore seams of every roof and the breadth seams of every wall, the blue buckram branches on the valances and roofs, the red say rose at the round house's top, the gilded vanes on the pole heads, door flaps tied back, guy ropes and pegs round all three tents."
} as const;

export interface TudorLodgingMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createTudorLodgingModel(quality: TudorLodgingQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `tudor-lodging-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const canvas = new THREE.MeshLambertMaterial({ color: 0xe6dcc4, side: THREE.DoubleSide });
  const roofCanvas = new THREE.MeshLambertMaterial({ color: 0xded3b8, side: THREE.DoubleSide });
  const buckram = new THREE.MeshLambertMaterial({ color: 0x2f4f8f, side: THREE.DoubleSide });
  const say = new THREE.MeshLambertMaterial({ color: 0xa3272b, side: THREE.DoubleSide });
  const pole = new THREE.MeshLambertMaterial({ color: 0x7b5a39 });
  const gilt = new THREE.MeshLambertMaterial({ color: 0xc9a23f, side: THREE.DoubleSide });
  const hemp = new THREE.MeshLambertMaterial({ color: 0xb8a57c });
  const seam = new THREE.MeshLambertMaterial({ color: 0xb9ad92 });
  const materials = [canvas, roofCanvas, buckram, say, pole, gilt, hemp, seam];
  const rod = new THREE.CylinderGeometry(1, 1, 1, 8);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(rod).add(cube);
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
  function bar(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material) {
    const mesh = add(name, rod, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
    return mesh;
  }
  function quad(name: string, corners: THREE.Vector3[], material: THREE.Material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        corners.flatMap(p => [p.x, p.y, p.z]),
        3
      )
    );
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    return add(name, geometry, material);
  }
  /** A wall (open cylinder) or roof (open cone) segment, optionally only an arc starting from +Z toward +X. */
  function shell(
    name: string,
    kind: "wall" | "roof",
    centre: THREE.Vector3,
    radius: number,
    height: number,
    segments: number,
    material: THREE.Material,
    arc: [number, number] = [0, Math.PI * 2]
  ) {
    const geometry =
      kind === "wall"
        ? new THREE.CylinderGeometry(radius, radius, height, segments, 1, true, arc[0], arc[1])
        : new THREE.ConeGeometry(radius, height, segments, 1, true, arc[0], arc[1]);
    const mesh = add(name, geometry, material);
    mesh.position.copy(centre).add(v(0, height / 2, 0));
    return mesh;
  }
  /** Seams down a cone from apex to eave at the given angles. */
  function gores(
    name: string,
    apex: THREE.Vector3,
    eaveCentre: THREE.Vector3,
    radius: number,
    angles: number[],
    material: THREE.Material,
    r = 0.012
  ) {
    for (const a of angles)
      bar(name, apex, eaveCentre.clone().add(v(Math.sin(a) * radius, 0, Math.cos(a) * radius)), r, material);
  }
  const angles = (n: number, from = 0, span = Math.PI * 2) =>
    Array.from({ length: n }, (_, i) => from + (span * i) / n);
  /** Guy ropes from the eave to pegs on the ground. */
  function guy(eave: THREE.Vector3, outward: THREE.Vector3) {
    const peg = eave.clone().addScaledVector(outward, 1.7).setY(0.15);
    bar("guy-rope", eave, peg, 0.01, hemp);
    bar("tent-peg", peg.clone().setY(0), peg.clone().setY(0.3), 0.025, pole);
  }

  // Round house.
  const rc = v(0, 0, ROUND_Z);
  shell("round-house-wall", "wall", rc, ROUND_R, ROUND.wall, high ? ROUND.breadths : 12, canvas);
  shell(
    "round-house-roof",
    "roof",
    rc.clone().setY(ROUND.wall),
    ROUND_R,
    ROUND_RISE,
    high ? ROUND.gores : 16,
    roofCanvas
  );
  const roundTop = rc.clone().setY(ROUND.wall + ROUND_RISE);
  bar("round-house-pole", rc, roundTop.clone().add(v(0, VANE.pole, 0)), 0.07, pole);

  // Hall: straight sides along X with half-round ends.
  const hx = HALL_STRAIGHT / 2;
  for (const side of [-1, 1]) {
    quad(
      "hall-wall",
      [
        v(-hx, 0, side * HALL_R),
        v(hx, 0, side * HALL_R),
        v(hx, HALL.wall, side * HALL_R),
        v(-hx, HALL.wall, side * HALL_R)
      ],
      canvas
    );
    quad(
      "hall-roof",
      [
        v(-hx, HALL.wall, side * HALL_R),
        v(hx, HALL.wall, side * HALL_R),
        v(hx, HALL.wall + HALL_RISE, 0),
        v(-hx, HALL.wall + HALL_RISE, 0)
      ],
      roofCanvas
    );
  }
  for (const end of [-1, 1]) {
    const c = v(end * hx, 0, 0);
    const arc: [number, number] = end > 0 ? [0, Math.PI] : [Math.PI, Math.PI];
    shell("hall-end-wall", "wall", c, HALL_R, HALL.wall, high ? 16 : 6, canvas, arc);
    shell(
      "hall-end-roof",
      "roof",
      c.clone().setY(HALL.wall),
      HALL_R,
      HALL_RISE,
      high ? HALL.goresPerEnd : 6,
      roofCanvas,
      arc
    );
    bar("hall-pole", c, c.clone().setY(HALL.wall + HALL_RISE + VANE.pole), 0.07, pole);
  }
  bar("ridge-tree", v(-hx, HALL.wall + HALL_RISE - 0.06, 0), v(hx, HALL.wall + HALL_RISE - 0.06, 0), 0.05, pole);

  // Tresaunte: a gabled passage from the hall's side to the round house.
  const z0 = HALL_R - 0.05,
    z1 = ROUND_Z - ROUND_R + 0.05;
  for (const side of [-1, 1]) {
    const x = side * PASSAGE_HALF;
    quad("passage-wall", [v(x, 0, z0), v(x, 0, z1), v(x, PASSAGE.wall, z1), v(x, PASSAGE.wall, z0)], canvas);
    quad(
      "passage-roof",
      [
        v(x, PASSAGE.wall, z0),
        v(x, PASSAGE.wall, z1),
        v(0, PASSAGE.wall + PASSAGE_RISE, z1),
        v(0, PASSAGE.wall + PASSAGE_RISE, z0)
      ],
      roofCanvas
    );
  }

  // Valances of blue buckram at the eaves.
  const valance = 0.35;
  shell(
    "valance",
    "wall",
    rc.clone().setY(ROUND.wall - valance),
    ROUND_R + 0.02,
    valance,
    high ? ROUND.gores : 16,
    buckram
  );
  for (const side of [-1, 1])
    quad(
      "valance",
      [
        v(-hx, HALL.wall - valance, side * (HALL_R + 0.02)),
        v(hx, HALL.wall - valance, side * (HALL_R + 0.02)),
        v(hx, HALL.wall, side * (HALL_R + 0.02)),
        v(-hx, HALL.wall, side * (HALL_R + 0.02))
      ],
      buckram
    );

  // Gilded vanes on every pole head.
  const vaneTops = [
    roundTop.clone().add(v(0, VANE.pole, 0)),
    v(-hx, HALL.wall + HALL_RISE + VANE.pole, 0),
    v(hx, HALL.wall + HALL_RISE + VANE.pole, 0)
  ];
  for (const top of vaneTops) {
    quad(
      "vane",
      [
        top.clone().add(v(0, -VANE.height - 0.05, 0)),
        top.clone().add(v(VANE.width, -VANE.height - 0.05, 0)),
        top.clone().add(v(VANE.width, -0.05, 0)),
        top.clone().add(v(0, -0.05, 0))
      ],
      gilt
    );
    const finial = add("finial", new THREE.SphereGeometry(0.08, 8, 6), gilt);
    finial.position.copy(top);
  }

  if (high) {
    // Gore and breadth seams.
    gores("gore-seam", roundTop, rc.clone().setY(ROUND.wall), ROUND_R + 0.005, angles(ROUND.gores), seam);
    for (const a of angles(ROUND.breadths))
      bar(
        "breadth-seam",
        v(Math.sin(a) * (ROUND_R + 0.005), 0, ROUND_Z + Math.cos(a) * (ROUND_R + 0.005)),
        v(Math.sin(a) * (ROUND_R + 0.005), ROUND.wall - valance, ROUND_Z + Math.cos(a) * (ROUND_R + 0.005)),
        0.01,
        seam
      );
    for (const end of [-1, 1]) {
      const apex = v(end * hx, HALL.wall + HALL_RISE, 0);
      gores(
        "gore-seam",
        apex,
        v(end * hx, HALL.wall, 0),
        HALL_R + 0.005,
        angles(HALL.goresPerEnd, end > 0 ? 0 : Math.PI, Math.PI).slice(1),
        seam
      );
    }
    for (const side of [-1, 1])
      for (let i = 1; i < HALL.roofBreadths; i++) {
        const x = -hx + i * BREADTH;
        bar(
          "breadth-seam",
          v(x, HALL.wall, side * (HALL_R + 0.005)),
          v(x, HALL.wall + HALL_RISE + 0.005, 0),
          0.01,
          seam
        );
        bar(
          "breadth-seam",
          v(x, 0, side * (HALL_R + 0.005)),
          v(x, HALL.wall - valance, side * (HALL_R + 0.005)),
          0.01,
          seam
        );
      }
    // Blue buckram branches on the round roof: every fifth gore carries a branch.
    gores(
      "buckram-branch",
      roundTop,
      rc.clone().setY(ROUND.wall),
      ROUND_R + 0.012,
      angles(10, Math.PI / 50),
      buckram,
      0.03
    );
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++) {
        const x = -hx + (i + 0.5) * (HALL_STRAIGHT / 4);
        bar(
          "buckram-branch",
          v(x, HALL.wall + 0.05, side * (HALL_R + 0.012)),
          v(x, HALL.wall + HALL_RISE - 0.15, side * 0.15),
          0.03,
          buckram
        );
      }
    // The red say rose at the round house's top.
    const rose = add("say-rose", new THREE.ConeGeometry(0.45, 0.6, 16, 1, true), say);
    rose.position.copy(roundTop).add(v(0, -0.28, 0));
    // A door in the hall's far side, its flaps tied back.
    for (const dx of [-1, 1])
      quad(
        "door-flap",
        [
          v(dx * 0.5, 0, -HALL_R - 0.02),
          v(dx * 1.2, 0.5, -HALL_R - 0.35),
          v(dx * 1.1, HALL.wall - valance, -HALL_R - 0.12),
          v(dx * 0.5, HALL.wall - valance, -HALL_R - 0.02)
        ],
        canvas
      );
    // Guys and pegs.
    for (const a of angles(12, Math.PI / 12)) {
      const out = v(Math.sin(a), 0, Math.cos(a));
      if (out.z < -0.9) continue; // the passage joins on this side
      guy(rc.clone().setY(ROUND.wall).addScaledVector(out, ROUND_R), out);
    }
    for (const side of [-1, 1])
      for (const x of [-hx + 0.6, 0, hx - 0.6]) {
        if (side > 0 && Math.abs(x) < PASSAGE_HALF + 0.2) continue;
        guy(v(x, HALL.wall, side * HALL_R), v(0, 0, side));
      }
    for (const end of [-1, 1])
      for (const a of [-0.6, 0, 0.6]) {
        const out = v(end * Math.cos(a), 0, Math.sin(a));
        guy(v(end * hx, HALL.wall, 0).addScaledVector(out, HALL_R), out);
      }
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

export function createTudorLodging(quality: TudorLodgingQuality = "low"): TudorLodgingMeshes {
  const model = createTudorLodgingModel(quality);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
