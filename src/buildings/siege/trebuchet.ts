import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";

/** Illustrative hinged-counterweight engine in a static, lowered loading pose. Units are meters. */
export const TREBUCHET = {
  name: "Trebuchet",
  length: 17,
  width: 6,
  height: 10,
  pivotHeight: 7.4,
  longArm: 9,
  shortArm: 2.5,
  armAngle: -Math.PI / 6,
  note: "Imagined timber siege engine with twin braced A-frames, an asymmetric throwing arm, a hinged ballast chest, a loading trough, a leather sling and a twin-wheel winding drum. Shown lowered for loading. Dimensions are illustrative; this is a static exterior model, without a firing simulation."
} as const;

export interface TrebuchetMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createTrebuchet(): TrebuchetMeshes {
  const group = new THREE.Group();
  group.name = "trebuchet";
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const timber = new THREE.MeshLambertMaterial({ color: 0x89603c });
  const endGrain = new THREE.MeshLambertMaterial({ color: 0xb08a53 });
  const darkWood = new THREE.MeshLambertMaterial({ color: 0x573c28 });
  const iron = new THREE.MeshLambertMaterial({ color: 0x343b3b });
  const rope = new THREE.MeshLambertMaterial({ color: 0xc4ac77 });
  const leather = new THREE.MeshLambertMaterial({ color: 0x513126, side: THREE.DoubleSide });
  const stone = new THREE.MeshLambertMaterial({ color: 0x999487, flatShading: true });
  const materials = [timber, endGrain, darkWood, iron, rope, leather, stone];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
  const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    pickables.push(mesh);
    group.add(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, material = timber) {
    const mesh = add(name, cube, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function member(
    name: string,
    a: THREE.Vector3,
    b: THREE.Vector3,
    width: number,
    depth = width,
    material = timber,
    round = false
  ) {
    const mesh = add(name, round ? cylinder : cube, material);
    mesh.position.copy(a).add(b).multiplyScalar(0.5);
    mesh.scale.set(width, a.distanceTo(b), depth);
    mesh.quaternion.setFromUnitVectors(v(0, 1), b.clone().sub(a).normalize());
    return mesh;
  }
  const cord = (name: string, a: THREE.Vector3, b: THREE.Vector3) => member(name, a, b, 0.027, 0.027, rope, true);
  const armPoint = (distance: number) =>
    v(Math.cos(TREBUCHET.armAngle) * distance, TREBUCHET.pivotHeight + Math.sin(TREBUCHET.armAngle) * distance);
  const tip = armPoint(TREBUCHET.longArm),
    heel = armPoint(-TREBUCHET.shortArm);

  // Two long skids carry separate triangular frames, leaving the counterweight bay open.
  for (const side of [-1, 1]) {
    const z = side * 1.8;
    box("base-skid", 0, 0.28, z, 9.2, 0.56, 0.65, darkWood);
    for (const x of [-3.6, 3.6]) {
      const foot = v(x, 0.56, z),
        crown = v(0, TREBUCHET.pivotHeight, z);
      member("frame-leg", foot, crown, 0.52);
      member("longitudinal-brace", v(x, 0.65, z), v(-x * 0.32, 3.8, z), 0.25);
      // Outriggers broaden the stance without crossing the swinging ballast chest.
      member("outrigger-brace", v(x * 0.65, 0.55, side * 2.55), v(0, 5.5, z), 0.25);
      box("foot-strap", x, 0.6, z, 0.75, 0.12, 0.78, iron);
    }
    box("frame-tie", 0, 2.2, z, 5.6, 0.3, 0.3);
    box("bearing-block", 0, TREBUCHET.pivotHeight, z, 0.85, 0.85, 0.7, darkWood);
    for (const y of [TREBUCHET.pivotHeight - 0.27, TREBUCHET.pivotHeight + 0.27])
      box("bearing-strap", 0, y, z, 0.9, 0.1, 0.76, iron);
  }
  for (const x of [-3.6, 0, 3.6]) box("base-cross-tie", x, 0.3, 0, 0.5, 0.5, 5.6, darkWood);
  member("main-axle", v(0, TREBUCHET.pivotHeight, -2.4), v(0, TREBUCHET.pivotHeight, 2.4), 0.22, 0.22, iron, true);
  member("throwing-arm", heel, tip, 0.42, 0.46, endGrain);
  for (const d of [-1.8, -0.65, 0.65, 2.2, 5.8, 8.6]) {
    const center = armPoint(d);
    const collar = box("arm-binding", center.x, center.y, 0, 0.13, 0.48, 0.52, iron);
    collar.rotation.z = TREBUCHET.armAngle;
  }

  // The short arm ends in a hinge; the ballast chest hangs vertically from its own axle.
  member(
    "counterweight-hinge",
    heel.clone().add(v(0, 0, -0.95)),
    heel.clone().add(v(0, 0, 0.95)),
    0.13,
    0.13,
    iron,
    true
  );
  const chestTop = heel.y - 2.05,
    chestBottom = chestTop - 1.85;
  const cx = heel.x;
  for (const side of [-1, 1]) {
    member("counterweight-hanger", v(cx, heel.y, side * 0.8), v(cx, chestTop - 0.35, side * 0.8), 0.22, 0.22, darkWood);
    box("ballast-side", cx, chestTop - 0.925, side * 0.9, 2, 1.85, 0.18, darkWood);
    for (const dx of [-0.65, 0.65]) box("chest-strap", cx + dx, chestTop - 0.925, side * 1.005, 0.13, 1.95, 0.07, iron);
  }
  box("ballast-floor", cx, chestBottom + 0.1, 0, 2, 0.2, 1.8, darkWood);
  for (const dx of [-1, 1]) box("ballast-end", cx + dx, chestTop - 0.925, 0, 0.18, 1.85, 1.8, timber);
  const rockGeometry = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < 8; i++) {
    const rock = add("ballast-stone", rockGeometry, stone);
    rock.position.set(cx - 0.65 + (i % 4) * 0.43, chestTop - 0.18, i < 4 ? -0.4 : 0.4);
    rock.scale.set(0.34, 0.3, 0.37);
    rock.rotation.set(i * 0.7, i, 0);
  }

  // A low trough guides the sling and payload during the initial swing.
  box("loading-trough", 7.25, 0.6, 0, 10, 0.18, 1.05, endGrain);
  for (const side of [-1, 1]) box("trough-edge", 7.25, 0.77, side * 0.55, 10, 0.28, 0.13, darkWood);
  for (const x of [5, 9, 11.8]) box("trough-support", x, 0.27, 0, 0.22, 0.54, 1.5, darkWood);
  const pouch = v(11.1, 0.93);
  member("release-pin", tip, tip.clone().add(v(0.3, 0.4)), 0.055, 0.055, iron, true);
  for (const side of [-1, 1])
    cord(
      side < 0 ? "retained-sling-cord" : "release-sling-cord",
      tip.clone().add(v(0, 0, side * 0.22)),
      pouch.clone().add(v(-0.2, 0, side * 0.32))
    );
  const pouchGeometry = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const sling = add("sling-pouch", pouchGeometry, leather);
  sling.position.copy(pouch);
  sling.scale.set(0.65, 0.25, 0.44);
  const payload = add("projectile", rockGeometry, stone);
  payload.position.copy(pouch).add(v(0, 0.12));
  payload.scale.setScalar(0.35);

  // Winding drum, twin hand wheels and a taut draw-down rope; no implied firing mechanics.
  member("winch-drum", v(3, 1.65, -2.3), v(3, 1.65, 2.3), 0.23, 0.23, darkWood, true);
  for (const side of [-1, 1]) {
    box("winch-upright", 3, 1, side * 1.8, 0.4, 1.6, 0.4);
    const wheel = add("winding-wheel", new THREE.TorusGeometry(0.95, 0.075, 6, 20), timber);
    wheel.position.set(3, 1.65, side * 2.35);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      member(
        "wheel-spoke",
        v(3, 1.65, side * 2.35),
        v(3 + Math.cos(a) * 0.95, 1.65 + Math.sin(a) * 0.95, side * 2.35),
        0.09
      );
    }
    member("wheel-handle", v(3.8, 1.65, side * 2.35), v(3.8, 1.65, side * 2.7), 0.07, 0.07, endGrain, true);
  }
  for (let i = 0; i < 9; i++) {
    const coil = add("winch-rope-coil", new THREE.TorusGeometry(0.25, 0.026, 5, 12), rope);
    coil.position.set(3, 1.65, -0.3 + i * 0.075);
  }
  cord("draw-down-rope", v(3.25, 1.75), tip.clone().add(v(-0.45, 0.2)));
  const model = {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
  return { ...model, elevation: projection(model, "side"), plan: projection(model, "top") };
}

/** Orthographic drawings from the actual mesh faces keep both views aligned with the model. */
function projection(model: CityStructureMeshes, view: "side" | "top"): string {
  model.group.updateMatrixWorld(true);
  const faces: { depth: number; path: string }[] = [];
  const bounds = new THREE.Box3().setFromObject(model.group);
  const point = (p: THREE.Vector3) => `${p.x.toFixed(3)},${(view === "side" ? -p.y : p.z).toFixed(3)}`;
  for (const mesh of model.pickables) {
    const positions = mesh.geometry.getAttribute("position"),
      indices = mesh.geometry.index;
    const count = indices?.count ?? positions.count;
    const material = mesh.material as THREE.MeshLambertMaterial;
    for (let i = 0; i < count; i += 3) {
      const points = [0, 1, 2].map(j =>
        new THREE.Vector3()
          .fromBufferAttribute(positions, indices ? indices.getX(i + j) : i + j)
          .applyMatrix4(mesh.matrixWorld)
      );
      const normal = points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
      if ((view === "side" ? normal.z : normal.y) <= 0.001) continue;
      const color = material.color.clone().multiplyScalar(0.8 + 0.2 * Math.max(0, normal.y));
      const fill = `#${color.getHexString()}`;
      faces.push({
        depth: points.reduce((sum, p) => sum + (view === "side" ? p.z : p.y), 0) / 3,
        path: `<path d="M${points.map(point).join(" L")} Z" fill="${fill}" stroke="${fill}" stroke-width="0.008"/>`
      });
    }
  }
  const minY = view === "side" ? -bounds.max.y : bounds.min.z;
  const height = view === "side" ? bounds.max.y - bounds.min.y : bounds.max.z - bounds.min.z;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bounds.min.x - 0.5} ${minY - 0.5} ${bounds.max.x - bounds.min.x + 1} ${height + 1}">${faces
    .sort((a, b) => a.depth - b.depth)
    .map(face => face.path)
    .join("")}</svg>`;
}
