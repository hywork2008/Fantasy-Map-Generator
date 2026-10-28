import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

/** An imagined roofed village well; dimensions are illustrative, in meters. */
export const MEDIEVAL_WELL = {
  author: "Codex GPT-6.1 Sol",
  name: "Medieval European well",
  width: 3.8,
  depth: 3.3,
  height: 3.8,
  note: "Imagined medieval European village well with an open stone curb, oak posts, a timber-shingled gable roof and a hand-cranked windlass. A rope suspends a staved wooden bucket inside the opening. Illustrative dimensions; not a reconstruction of a particular surviving well. The water surface represents the shaft in a shallow display cutaway; the underground lining and aquifer are omitted."
} as const;

export interface MedievalWellMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

/** Shared model for BV drawings and CE instances. */
export function createMedievalWellModel(): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "medieval-european-well";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const material = (color: number) => new THREE.MeshLambertMaterial({ color });
  const oak = material(0x765137);
  const endGrain = material(0xa37b4d);
  const darkWood = material(0x4c3828);
  const iron = material(0x383b38);
  const rope = material(0xb5a17a);
  const water = material(0x244446);
  const stone = [0xaaa18d, 0xb8af9c, 0x9e9686, 0xc0b6a0].map(material);
  const shingles = [0x756651, 0x88765a, 0x958164].map(material);
  const staves = [0x9d774d, 0x88613d, 0xb08b58].map(material);
  const materials = [oak, endGrain, darkWood, iron, rope, water, ...stone, ...shingles, ...staves];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 16);
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, surface: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, surface = oak) {
    const mesh = add(name, cube, surface);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function beam(name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number, surface = oak, round = false) {
    const mesh = add(name, round ? cylinder : cube, surface);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(v(0, 1, 0), b.clone().sub(a).normalize());
    return mesh;
  }
  // Annular wedges leave the shaft genuinely open, including the inner masonry faces.
  function wedge(inner: number, outer: number, height: number, sweep: number) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, 0, sweep, false);
    shape.lineTo(inner * Math.cos(sweep), inner * Math.sin(sweep));
    shape.absarc(0, 0, inner, sweep, 0, true);
    shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 3 });
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }
  const pitch = (Math.PI * 2) / 16;
  for (let course = 0; course < 5; course++) {
    const coping = course === 4;
    const geometry = wedge(coping ? 0.69 : 0.72, coping ? 1.1 : 1.04, coping ? 0.18 : 0.22, pitch - 0.012);
    for (let i = 0; i < 16; i++) {
      const block = add(coping ? "coping-stone" : "curb-stone", geometry, stone[(course + i * 3) % stone.length]);
      block.position.y = course * 0.23;
      block.rotation.y = (i + (course % 2) * 0.5) * pitch;
    }
  }
  const pool = add("shaft-water", new THREE.CircleGeometry(0.72, 32), water);
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.025;

  for (const side of [-1, 1]) {
    box("post-footing", side * 1.28, 0.12, 0, 0.5, 0.24, 0.52, stone[2]);
    box("oak-upright", side * 1.28, 1.58, 0, 0.23, 2.96, 0.26);
    for (const y of [0.43, 2.13]) box("post-iron-strap", side * 1.28, y, 0, 0.25, 0.075, 0.28, iron);
    box("roof-wall-plate", side * 1.28, 2.98, 0, 0.22, 0.2, 2.85, darkWood);
    for (const z of [-0.95, 0.95]) {
      beam("longitudinal-knee-brace", v(side * 1.28, 2.38, 0), v(side * 1.28, 2.94, z), 0.11);
    }
    beam("cross-knee-brace", v(side * 1.28, 2.42, 0), v(side * 0.65, 3, 0), 0.12);
  }
  box("cross-tie", 0, 3, 0, 2.86, 0.18, 0.2, darkWood);
  const rise = 0.8;
  const halfSpan = 1.65;
  const roofAngle = Math.atan2(rise, halfSpan);
  for (const z of [-1.38, 0, 1.38]) {
    for (const side of [-1, 1]) beam("rafter", v(0, 3.65, z), v(side * halfSpan, 2.85, z), 0.12, darkWood);
  }
  for (const side of [-1, 1]) {
    for (let row = 0; row < 7; row++) {
      const t = (row + 0.5) / 7;
      for (let col = 0; col < 12; col++) {
        const tile = box(
          "roof-shingle",
          side * t * halfSpan,
          3.72 - t * rise,
          -1.43 + col * 0.26,
          Math.hypot(halfSpan, rise) / 7 + 0.018,
          0.055,
          0.255,
          shingles[(row + col) % shingles.length]
        );
        tile.rotation.z = -side * roofAngle;
      }
    }
    for (const z of [-1.56, 1.56]) beam("bargeboard", v(0, 3.74, z), v(side * 1.68, 2.92, z), 0.1, endGrain);
  }
  box("ridge-cap", 0, 3.74, 0, 0.13, 0.1, 3.16, darkWood);

  // The axle crosses both bearings; its crank remains outside the right post.
  for (const side of [-1, 1]) {
    box("windlass-bearing", side * 1.28, 1.98, 0, 0.35, 0.34, 0.34, darkWood);
    beam("axle-collar", v(side * 1.45, 1.98, 0), v(side * 1.5, 1.98, 0), 0.14, iron, true);
  }
  beam("windlass-axle", v(-1.53, 1.98, 0), v(1.64, 1.98, 0), 0.105, oak, true);
  beam("windlass-drum", v(-0.48, 1.98, 0), v(0.48, 1.98, 0), 0.16, endGrain, true);
  const coilGeometry = new THREE.TorusGeometry(0.17, 0.014, 5, 24);
  for (let i = 0; i < 13; i++) {
    const coil = add("rope-winding", coilGeometry, rope);
    coil.rotation.y = Math.PI / 2;
    coil.position.set(-0.18 + i * 0.028, 1.98, 0);
  }
  beam("crank-arm", v(1.65, 1.98, 0), v(1.65, 1.62, 0), 0.065, iron);
  beam("crank-handle", v(1.63, 1.62, 0), v(1.86, 1.62, 0), 0.065, darkWood, true);
  beam("hanging-rope", v(0.16, 1.98, 0.17), v(0.16, 1.33, 0.17), 0.016, rope, true);

  // Open staves and separate hoops keep the suspended bucket visibly hollow.
  const bucketX = 0.16,
    bucketZ = 0.17,
    bucketBase = 0.63;
  const staveGeometry = wedge(0.19, 0.225, 0.4, Math.PI / 8 - 0.015);
  for (let i = 0; i < 16; i++) {
    const stave = add("bucket-stave", staveGeometry, staves[i % staves.length]);
    stave.position.set(bucketX, bucketBase, bucketZ);
    stave.rotation.y = (i * Math.PI) / 8;
  }
  const bottom = add("bucket-bottom", new THREE.CylinderGeometry(0.195, 0.195, 0.04, 16), darkWood);
  bottom.position.set(bucketX, bucketBase + 0.02, bucketZ);
  const hoopGeometry = new THREE.CylinderGeometry(0.23, 0.23, 0.045, 16, 1, true);
  for (const y of [bucketBase + 0.075, bucketBase + 0.33]) {
    const hoop = add("bucket-iron-hoop", hoopGeometry, iron);
    hoop.position.set(bucketX, y, bucketZ);
  }
  const handlePoints = Array.from({ length: 17 }, (_, i) => {
    const angle = (i * Math.PI) / 16;
    return v(bucketX + 0.225 * Math.cos(angle), 1.03 + 0.3 * Math.sin(angle), bucketZ);
  });
  add("bucket-bail", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(handlePoints), 20, 0.014, 6, false), iron);

  const model = {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
    }
  };
  return model;
}

export function createMedievalWell(): MedievalWellMeshes {
  const model = createMedievalWellModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
