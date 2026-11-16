import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import type { Author } from "../authors";
import { meshProjection } from "../meshProjection";
import type { ModelPart } from "../modelParts";

/**
 * Illustrative European infantry flintlock, in meters.
 * Muzzle faces +X. The lock is on +Z so a side elevation shows the mechanism.
 * The stock toe rests on Y = 0. Static full-cock pose, frizzen closed.
 */
export const FLINTLOCK_MUSKET = {
  author: "Grok 4.7" as Author,
  name: "Flintlock musket",
  length: 1.6,
  width: 0.12,
  height: 0.2,
  note: "Illustrative 18th-century European infantry flintlock, about 1.5 m overall. Walnut full stock, tapered iron barrel with a crowned muzzle, flintlock at full cock with the frizzen closed, and brass butt plate, side plate, trigger guard, ramrod pipes and three barrel bands. Muzzle faces +X. The lock is on +Z so the side elevation shows the mechanism. Static study model for turning the mesh into product pictures. Not a measured copy of one surviving gun, and not placed in towns."
} as const;

export interface FlintlockMusketMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

interface StockSection {
  x: number;
  top: number;
  bottom: number;
  halfWidth: number;
}

interface PartBucket {
  role: string;
  meshes: THREE.Mesh[];
}

const DROP = 0.004;
const BARREL_X = 0.42;
const BARREL_Y = 0.07;
const BARREL_LEN = 1.07;
/** Wood surface on the lock side, before the plate thickness. */
const LOCK_FACE = 0.022;

const STOCK: readonly StockSection[] = [
  { x: 0.02, top: 0.142, bottom: 0.086, halfWidth: 0.016 },
  { x: 0.07, top: 0.132, bottom: 0.04, halfWidth: 0.023 },
  { x: 0.115, top: 0.118, bottom: 0.004, halfWidth: 0.024 },
  { x: 0.19, top: 0.116, bottom: 0.032, halfWidth: 0.02 },
  { x: 0.3, top: 0.074, bottom: 0.03, halfWidth: 0.015 },
  { x: 0.41, top: 0.076, bottom: 0.024, halfWidth: 0.021 },
  { x: 0.56, top: 0.07, bottom: 0.032, halfWidth: 0.018 },
  { x: 0.82, top: 0.068, bottom: 0.036, halfWidth: 0.016 },
  { x: 1.1, top: 0.066, bottom: 0.04, halfWidth: 0.014 },
  { x: 1.36, top: 0.064, bottom: 0.044, halfWidth: 0.012 }
];

export function createFlintlockMusketModel(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "flintlock-musket";
  group.position.y = -DROP;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const buckets = new Map<string, PartBucket>([
    ["stock", { role: "Stock", meshes: [] }],
    ["barrel", { role: "Barrel", meshes: [] }],
    ["lock", { role: "Lock", meshes: [] }],
    ["furniture", { role: "Furniture", meshes: [] }]
  ]);
  const walnut = new THREE.MeshStandardMaterial({ color: 0x6e4228, roughness: 0.86, metalness: 0 });
  const ramrodWood = new THREE.MeshStandardMaterial({ color: 0x3d2918, roughness: 0.8, metalness: 0 });
  const barrelIron = new THREE.MeshStandardMaterial({ color: 0x6e675f, roughness: 0.38, metalness: 0.55 });
  const lockSteel = new THREE.MeshStandardMaterial({ color: 0xb7c0c6, roughness: 0.28, metalness: 0.62 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xe0b45a, roughness: 0.34, metalness: 0.58 });
  const bore = new THREE.MeshStandardMaterial({ color: 0x161412, roughness: 0.9, metalness: 0.1 });
  const flint = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.72, metalness: 0.04 });
  const materials = [walnut, ramrodWood, barrelIron, lockSteel, brass, bore, flint];

  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, part: string) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    buckets.get(part)?.meshes.push(mesh);
    return mesh;
  }
  function along(
    name: string,
    a: THREE.Vector3,
    b: THREE.Vector3,
    radius: number,
    material: THREE.Material,
    part: string,
    segments = 14
  ) {
    const mesh = add(name, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), segments), material, part);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  function box(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    material: THREE.Material,
    part: string
  ) {
    const mesh = add(name, new THREE.BoxGeometry(w, h, d), material, part);
    mesh.position.set(x, y, z);
    return mesh;
  }

  add("stock", loftGeometry(STOCK), walnut, "stock");

  const barrel = add("barrel", barrelGeometry(), barrelIron, "barrel");
  barrel.rotation.z = -Math.PI / 2;
  barrel.position.set(BARREL_X, BARREL_Y, 0);
  const muzzle = add("muzzle-bore", new THREE.CircleGeometry(0.0094, 20), bore, "barrel");
  muzzle.rotation.y = Math.PI / 2;
  muzzle.position.set(BARREL_X + BARREL_LEN - 0.001, BARREL_Y, 0);
  for (const [x, y, height, width] of [
    [0.7, 0.058, 0.056, 0.044],
    [0.97, 0.06, 0.05, 0.04],
    [1.24, 0.062, 0.046, 0.034]
  ] as const) {
    const band = add("barrel-band", sleeveGeometry(width, height, 0.014), brass, "furniture");
    band.position.set(x, y, 0);
  }
  const nose = add("nose-cap", sleeveGeometry(0.032, 0.03, 0.018), brass, "furniture");
  nose.position.set(1.348, 0.054, 0);
  box("tang", 0.355, 0.078, 0, 0.14, 0.005, 0.012, barrelIron, "barrel");
  box("rear-sight", 0.4, 0.084, 0, 0.01, 0.008, 0.004, barrelIron, "barrel");
  box("front-sight", 1.45, 0.086, 0, 0.004, 0.01, 0.0025, barrelIron, "barrel");
  const vent = add("touch-hole", new THREE.CircleGeometry(0.0022, 10), bore, "barrel");
  vent.position.set(0.455, BARREL_Y, 0.0175);

  const plate = add("lock-plate", extrude(lockPlateShape(), 0.0055), lockSteel, "lock");
  plate.position.set(0.43, 0.052, LOCK_FACE + 0.0036);
  const cock = add("cock", extrude(cockShape(), 0.008), lockSteel, "lock");
  cock.position.set(0.398, 0.05, 0.034);
  const pivot = add("cock-pivot", new THREE.CylinderGeometry(0.007, 0.007, 0.006, 16), lockSteel, "lock");
  pivot.rotation.x = Math.PI / 2;
  pivot.position.set(0.398, 0.05, 0.039);
  const jawScrew = add("jaw-screw", new THREE.CylinderGeometry(0.0022, 0.0022, 0.007, 10), lockSteel, "lock");
  jawScrew.position.set(0.386, 0.132, 0.034);
  const flintMesh = add("flint", new THREE.BoxGeometry(0.014, 0.005, 0.004), flint, "lock");
  flintMesh.position.set(0.392, 0.116, 0.034);
  flintMesh.rotation.z = -0.45;
  const frizzen = add("frizzen", extrude(frizzenShape(), 0.012), lockSteel, "lock");
  frizzen.position.set(0.4, 0.058, 0.033);
  box("priming-pan", 0.412, 0.052, 0.032, 0.024, 0.005, 0.012, lockSteel, "lock");
  along(
    "frizzen-spring",
    new THREE.Vector3(0.414, 0.048, 0.032),
    new THREE.Vector3(0.456, 0.034, 0.032),
    0.0022,
    lockSteel,
    "lock",
    8
  );
  along(
    "frizzen-spring-leaf",
    new THREE.Vector3(0.456, 0.034, 0.032),
    new THREE.Vector3(0.448, 0.056, 0.032),
    0.002,
    lockSteel,
    "lock",
    8
  );
  for (const x of [0.368, 0.492]) {
    const screw = add("lock-screw", new THREE.CylinderGeometry(0.0032, 0.0032, 0.003, 10), lockSteel, "lock");
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, 0.05, 0.0295);
  }

  const side = add("side-plate", extrude(sidePlateShape(), 0.003), brass, "furniture");
  side.position.set(0.44, 0.05, -0.0225);
  for (const x of [0.4, 0.478]) {
    const screw = add("side-screw", new THREE.CylinderGeometry(0.003, 0.003, 0.003, 10), brass, "furniture");
    screw.rotation.x = Math.PI / 2;
    screw.position.set(x, 0.05, -0.027);
  }

  const heel = new THREE.Vector3(0.016, 0.14, 0);
  const toe = new THREE.Vector3(0.1, 0.018, 0);
  const butt = add("butt-plate", new THREE.BoxGeometry(0.007, heel.distanceTo(toe), 0.042), brass, "furniture");
  butt.position.copy(heel).add(toe).multiplyScalar(0.5);
  butt.position.x += 0.003;
  butt.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), toe.clone().sub(heel).normalize());

  add("trigger-guard", guardGeometry(), brass, "furniture");
  const trigger = add("trigger", extrude(triggerShape(), 0.004), lockSteel, "lock");
  trigger.position.set(0.39, 0.046, 0);
  const swivel = add("sling-swivel", new THREE.TorusGeometry(0.008, 0.0016, 6, 14), brass, "furniture");
  swivel.position.set(0.5, 0.028, 0);

  along("ramrod", new THREE.Vector3(0.5, 0.03, 0), new THREE.Vector3(1.43, 0.03, 0), 0.0042, ramrodWood, "stock", 10);
  along(
    "ramrod-tip",
    new THREE.Vector3(1.4, 0.03, 0),
    new THREE.Vector3(1.445, 0.03, 0),
    0.0048,
    brass,
    "furniture",
    10
  );
  for (const x of [0.64, 0.92, 1.2]) {
    const pipe = add("ramrod-pipe", new THREE.CylinderGeometry(0.007, 0.007, 0.016, 12), brass, "furniture");
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(x, 0.03, 0);
  }

  const parts: ModelPart[] = [];
  for (const [id, bucket] of buckets) {
    if (!bucket.meshes.length) continue;
    let triangles = 0;
    for (const mesh of bucket.meshes) {
      mesh.userData.modelPartId = id;
      const geometry = mesh.geometry;
      const count = geometry.index?.count ?? geometry.getAttribute("position").count;
      triangles += Math.floor(Math.max(0, count) / 3);
    }
    parts.push({
      id,
      role: bucket.role,
      quality: "high",
      author: FLINTLOCK_MUSKET.author,
      meshes: bucket.meshes.length,
      triangles
    });
  }
  group.userData.modelParts = parts;

  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createFlintlockMusket(): FlintlockMusketMeshes {
  const model = createFlintlockMusketModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}

function lockPlateShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-0.09, 0);
  shape.lineTo(-0.02, 0.017);
  shape.lineTo(0.045, 0.017);
  shape.quadraticCurveTo(0.075, 0.017, 0.075, 0);
  shape.quadraticCurveTo(0.075, -0.017, 0.045, -0.017);
  shape.lineTo(-0.02, -0.017);
  shape.closePath();
  return shape;
}

function sidePlateShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, 0.058, 0.013, 0, Math.PI * 2, false, 0);
  return shape;
}

function triggerShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.009, -0.002);
  shape.lineTo(0.014, -0.03);
  shape.lineTo(0.005, -0.032);
  shape.closePath();
  return shape;
}

function cockShape(): THREE.Shape {
  // Flat doghead at full cock. Pivot is the origin; jaws are up and slightly rearward.
  const shape = new THREE.Shape();
  shape.moveTo(0.011, -0.003);
  shape.lineTo(0.012, 0.012);
  shape.bezierCurveTo(0.006, 0.034, -0.004, 0.05, -0.008, 0.062);
  shape.lineTo(-0.016, 0.066);
  shape.lineTo(-0.018, 0.074);
  shape.lineTo(-0.002, 0.078);
  shape.lineTo(0.002, 0.06);
  shape.bezierCurveTo(0.006, 0.046, 0.01, 0.028, 0.004, 0.012);
  shape.lineTo(-0.008, 0.004);
  shape.lineTo(-0.01, -0.01);
  shape.lineTo(0.002, -0.011);
  shape.closePath();
  return shape;
}

function frizzenShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.018, -0.002);
  shape.lineTo(0.014, 0.014);
  shape.lineTo(0.007, 0.056);
  shape.lineTo(-0.001, 0.058);
  shape.lineTo(-0.002, 0.01);
  shape.closePath();
  return shape;
}

function sleeveGeometry(width: number, height: number, length: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, width / 2, height / 2, 0, Math.PI * 2, false, 0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, curveSegments: 18 });
  geometry.translate(0, 0, -length / 2);
  geometry.rotateY(Math.PI / 2);
  return geometry;
}

function guardGeometry(): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.3, 0.038, 0),
    new THREE.Vector3(0.34, 0.016, 0),
    new THREE.Vector3(0.4, 0.012, 0),
    new THREE.Vector3(0.46, 0.018, 0),
    new THREE.Vector3(0.5, 0.042, 0)
  ]);
  return new THREE.TubeGeometry(curve, 28, 0.004, 8, false);
}

function extrude(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

function barrelGeometry(): THREE.BufferGeometry {
  const profile = [
    [0, 0],
    [0.019, 0],
    [0.019, 0.012],
    [0.017, 0.022],
    [0.0164, 0.08],
    [0.0152, 0.3],
    [0.014, 0.64],
    [0.0131, 1.0],
    [0.0128, 1.045],
    [0.0154, 1.056],
    [0.0154, 1.07],
    [0.0095, 1.07],
    [0.0095, 0.82],
    [0, 0.82]
  ].map(([radius, y]) => new THREE.Vector2(radius, y));
  return new THREE.LatheGeometry(profile, 36);
}

/** Smooth stock loft. Sections stand in the YZ plane and run from butt to muzzle along X. */
function loftGeometry(sections: readonly StockSection[], segments = 28): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  const rings: number[] = [];
  for (const section of sections) {
    rings.push(positions.length / 3);
    const cy = (section.top + section.bottom) / 2;
    const ry = (section.top - section.bottom) / 2;
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const cosine = Math.cos(theta);
      const sine = Math.sin(theta);
      const shaped = cosine >= 0 ? cosine : -((-cosine) ** 0.62);
      positions.push(section.x, cy + shaped * ry, sine * section.halfWidth * (cosine < 0 ? 0.9 : 1));
    }
  }
  const outward = new THREE.Vector3();
  const corner = (index: number) =>
    new THREE.Vector3(positions[index * 3], positions[index * 3 + 1], positions[index * 3 + 2]);
  const push = (a: number, b: number, c: number, direction: THREE.Vector3) => {
    const normal = corner(b)
      .sub(corner(a))
      .cross(corner(c).sub(corner(a)));
    if (normal.dot(direction) < 0) indices.push(a, c, b);
    else indices.push(a, b, c);
  };
  for (let ring = 0; ring < rings.length - 1; ring++) {
    const midX = (sections[ring].x + sections[ring + 1].x) / 2;
    const midY = (sections[ring].top + sections[ring].bottom + sections[ring + 1].top + sections[ring + 1].bottom) / 4;
    for (let i = 0; i < segments; i++) {
      const j = (i + 1) % segments;
      const a = rings[ring] + i;
      const b = rings[ring] + j;
      const c = rings[ring + 1] + i;
      const d = rings[ring + 1] + j;
      outward
        .copy(corner(a))
        .add(corner(d))
        .multiplyScalar(0.5)
        .sub(new THREE.Vector3(midX, midY, 0));
      push(a, b, c, outward);
      push(b, d, c, outward);
    }
  }
  const cap = (ring: number, x: number, cy: number, direction: THREE.Vector3) => {
    const center = positions.length / 3;
    positions.push(x, cy, 0);
    for (let i = 0; i < segments; i++) push(center, ring + i, ring + ((i + 1) % segments), direction);
  };
  const first = sections[0];
  const last = sections[sections.length - 1];
  cap(rings[0], first.x, (first.top + first.bottom) / 2, new THREE.Vector3(-1, 0, 0));
  cap(rings[rings.length - 1], last.x, (last.top + last.bottom) / 2, new THREE.Vector3(1, 0, 0));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
