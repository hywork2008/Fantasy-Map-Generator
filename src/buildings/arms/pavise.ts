import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";

export type PaviseQuality = "low" | "high";

const INCH = 0.0254;
/** The Metropolitan Museum's Bohemian pavise of about 1450 (acc. 23333). */
const MET = { height: 42.5 * INCH, width: 20.5 * INCH, curvature: 5 * INCH, thickness: 1 * INCH, mass: 7.569 };
/** Limewood, the usual board for pavises, kg/m³; the leather, gesso and paint are thin. */
const LIMEWOOD = 530;
/** Half-profile across the face, from the edge to the middle: wings sweeping forward into a central ridge. */
const HALF_PROFILE: readonly [z: number, forward: number][] = [
  [MET.width / 2, 0],
  [0.17, 0.02],
  [0.1, 0.05],
  [0.07, MET.curvature],
  [0, MET.curvature]
];
/** Leaning back on its prop. */
const LEAN = (10 * Math.PI) / 180;
const PROP = { length: 1.05, radius: 0.017 };

const profile = [
  ...HALF_PROFILE.map(([z, x]) => [-z, x] as const),
  ...[...HALF_PROFILE].reverse().map(([z, x]) => [z, x] as const)
].filter(([z], i, all) => i === 0 || z !== all[i - 1][0]);
const profileLength = profile
  .slice(1)
  .reduce((sum, [z, x], i) => sum + Math.hypot(z - profile[i][0], x - profile[i][1]), 0);

/**
 * A 15th-century Bohemian pavise standing on its prop, in meters: ground at y = 0, the face toward positive X.
 */
export const PAVISE = {
  author: "Claude Opus 5.5" as Author,
  name: "Bohemian pavise (c. 1450)",
  height: MET.height,
  width: MET.width,
  curvature: MET.curvature,
  thickness: MET.thickness,
  recordedMass: MET.mass,
  /** Board volume across the curved profile, for comparison with the recorded weight. */
  boardVolume: profileLength * MET.height * MET.thickness,
  boardDensity: LIMEWOOD,
  lean: LEAN,
  note: "Schematic standing shield (pavise) of the kind carried by crossbowmen and other foot soldiers in central Europe in the 15th century, after the Metropolitan Museum's Bohemian pavise of about 1450, possibly from Chomutov: 107.95 cm high, 52.07 cm wide, 12.7 cm of curvature, about 2.5 cm thick and 7.57 kg, of wood covered with leather and gesso, with silver foil and paint. A limewood board 2.5 cm thick across this section would weigh about 9.3 kg, a quarter more than recorded, so the wings were probably thinner or the wood lighter (poplar). The museum notes that such shields were often fitted with a prop so that they stood free while the crossbowman spanned and loaded behind them. Its painted badge is a crown with three ostrich feathers of the kings of Bohemia. The section with a central ridge, the prop, the grip and the strap are proportioned from surviving Bohemian pavises; the paint is simplified.",
  highNote:
    "High tier: the leather-covered rim, the painted field with a crown and three ostrich feathers, the hollow of the ridge behind with its hand grip and carrying strap, the iron staple and pin of the prop, and the prop's iron foot."
} as const;

export interface PaviseMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createPaviseModel(quality: PaviseQuality = "low"): CityStructureMeshes {
  const high = quality === "high";
  const group = new THREE.Group();
  group.name = `pavise-${quality}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const field = new THREE.MeshLambertMaterial({ color: 0x8e2a26, side: THREE.DoubleSide });
  const back = new THREE.MeshLambertMaterial({ color: 0x8a6c49, side: THREE.DoubleSide });
  const leather = new THREE.MeshLambertMaterial({ color: 0x3b2618 });
  const gold = new THREE.MeshLambertMaterial({ color: 0xc9a23f, side: THREE.DoubleSide });
  const silver = new THREE.MeshLambertMaterial({ color: 0xd8d8d0, side: THREE.DoubleSide });
  const wood = new THREE.MeshLambertMaterial({ color: 0x7b5a39 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x353a3a });
  const materials = [field, back, leather, gold, silver, wood, iron];
  const rod = new THREE.CylinderGeometry(1, 1, 1, 8);
  const cube = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(rod).add(cube);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const Y = v(0, 1, 0);
  // Everything on the shield is built upright in the board's frame, then leaned back.
  const board = new THREE.Group();
  board.name = "board";
  board.rotation.z = LEAN;
  // Leaning back drops the rear corner of the foot below the ground; lift the board by that much.
  board.position.y = MET.thickness * Math.sin(LEAN);
  group.add(board);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = board) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    parent.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function bar(
    name: string,
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius: number,
    material: THREE.Material,
    parent: THREE.Object3D = board
  ) {
    const mesh = add(name, rod, material, parent);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
    return mesh;
  }
  /** A sheet following the profile between two heights, offset back from the face by `back` meters. */
  function sheet(name: string, offset: number, y0: number, y1: number, material: THREE.Material) {
    const points: number[] = [];
    for (const [z, x] of profile) points.push(x - offset, y0, z, x - offset, y1, z);
    const indices: number[] = [];
    for (let i = 0; i < profile.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return add(name, geometry, material);
  }

  // The board: painted face, back and the edge between them.
  const H = MET.height,
    t = MET.thickness;
  sheet("face", 0, 0, H, field);
  sheet("back", t, 0, H, back);
  for (const y of [0, H]) {
    const points: number[] = [];
    for (const [z, x] of profile) points.push(x, y, z, x - t, y, z);
    const indices: number[] = [];
    for (let i = 0; i < profile.length - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    add(y === 0 ? "bottom-edge" : "top-edge", geometry, back);
  }
  for (const side of [-1, 1]) {
    const edge = add("side-edge", cube, back);
    edge.position.set(-t / 2, H / 2, side * (MET.width / 2));
    edge.scale.set(t, H, 0.004);
  }

  // Prop: hinged on the back of the ridge, its foot on the ground behind.
  const hinge = v(MET.curvature - t - 0.005, H * 0.72, 0);
  const hingeWorld = hinge.clone().applyEuler(board.rotation).add(board.position);
  const footX = hingeWorld.x - Math.sqrt(PROP.length ** 2 - hingeWorld.y ** 2);
  // Lift the foot so the rim of the slanting end just touches the ground.
  const footY = PROP.radius * Math.sqrt(1 - (hingeWorld.y / PROP.length) ** 2);
  bar("prop", hingeWorld, v(footX, footY, 0), PROP.radius, wood, group);

  if (high) {
    // Leather-covered rim.
    for (const side of [-1, 1]) {
      const rim = add("rim", cube, leather);
      rim.position.set(0.002, H / 2, side * (MET.width / 2 - 0.012));
      rim.scale.set(0.006, H, 0.024);
    }
    for (const y of [0.012, H - 0.012]) {
      const rim = add("rim", cube, leather);
      rim.position.set(0.006, y, 0);
      rim.scale.set(0.004, 0.024, 0.14);
      for (const side of [-1, 1]) {
        const wing = add("rim", cube, leather);
        wing.position.set(0.012, y, side * 0.175);
        wing.scale.set(0.004, 0.024, 0.16);
      }
    }
    // The Bohemian badge on the ridge: a crown and three ostrich feathers.
    const badgeX = MET.curvature + 0.003;
    const crown = new THREE.Shape();
    crown.moveTo(-0.06, 0);
    crown.lineTo(0.06, 0);
    crown.lineTo(0.065, 0.06);
    crown.lineTo(0.035, 0.035);
    crown.lineTo(0, 0.07);
    crown.lineTo(-0.035, 0.035);
    crown.lineTo(-0.065, 0.06);
    crown.closePath();
    const crownGeometry = new THREE.ShapeGeometry(crown);
    crownGeometry.rotateY(Math.PI / 2);
    const crownMesh = add("crown", crownGeometry, gold);
    crownMesh.position.set(badgeX, H * 0.55, 0);
    for (const dz of [-0.035, 0, 0.035]) {
      const feather = add("ostrich-feather", new THREE.CircleGeometry(1, 12), silver);
      feather.rotation.y = Math.PI / 2;
      feather.position.set(badgeX, H * 0.55 + 0.17, dz);
      feather.scale.set(0.018, 0.1, 1);
      feather.rotation.x = dz * 4;
    }
    // Behind the ridge: the hand grip and the carrying strap.
    const behind = MET.curvature - t - 0.02;
    bar("grip", v(behind, H * 0.42, 0), v(behind, H * 0.58, 0), 0.014, leather);
    for (const y of [H * 0.42, H * 0.58]) bar("grip-rivet", v(behind, y, 0), v(MET.curvature - t, y, 0), 0.006, iron);
    bar("carrying-strap", v(-t - 0.01, H * 0.82, -0.17), v(-t - 0.04, H * 0.52, 0.17), 0.008, leather);
    // Iron staple and pin for the prop, and the prop's foot.
    const staple = add("prop-staple", cube, iron);
    staple.position.copy(hinge).add(v(-0.01, 0, 0));
    staple.scale.set(0.02, 0.05, 0.05);
    const shoe = add("prop-foot", cube, iron, group);
    shoe.position.set(footX + 0.01, 0.02, 0);
    shoe.scale.set(0.05, 0.04, 0.04);
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

export function createPavise(quality: PaviseQuality = "low"): PaviseMeshes {
  const model = createPaviseModel(quality);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
