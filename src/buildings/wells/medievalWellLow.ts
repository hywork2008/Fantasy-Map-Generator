import * as THREE from "three";
import { ModelKit, type Surface } from "../medieval/modelKit";

/** Site-scale well: open curb and bucket, two roof planes, and a readable hand windlass. */
export function createLowMedievalWellModel() {
  const k = new ModelKit("medieval-european-well-low");
  function ring(name: string, inner: number, outer: number, height: number, y: number, surface: Surface) {
    const shape = new THREE.Shape();
    shape.absarc(0, 0, outer, 0, Math.PI * 2, false);
    const hole = new THREE.Path();
    hole.absarc(0, 0, inner, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    const mesh = k.add(
      name,
      new THREE.ExtrudeGeometry(shape, {
        depth: height,
        bevelEnabled: false,
        curveSegments: 6
      }),
      surface
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    return mesh;
  }
  ring("well-curb", 0.72, 1.04, 0.92, 0, "stone");
  ring("well-coping", 0.69, 1.1, 0.18, 0.92, "stone");
  const water = k.add("shaft-water", new THREE.CircleGeometry(0.72, 12), "water");
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.025;
  for (const side of [-1, 1]) {
    k.box("post-footing", [side * 1.28, 0.12, 0], [0.5, 0.24, 0.52], "stone");
    k.box("oak-upright", [side * 1.28, 1.58, 0], [0.23, 2.96, 0.26], "oak");
    k.box("roof-wall-plate", [side * 1.28, 2.98, 0], [0.22, 0.2, 2.85], "oak");
    k.box("windlass-bearing", [side * 1.28, 1.98, 0], [0.35, 0.34, 0.34], "dark");
    for (const z of [-0.95, 0.95]) k.beam("knee-brace", [side * 1.28, 2.38, 0], [side * 1.28, 2.94, z], 0.11, "oak");
  }
  // Two thin roof planes meet above the axle; no individual shingles are needed at site scale.
  const roofAngle = Math.atan2(0.8, 1.65);
  for (const side of [-1, 1]) {
    const roof = k.box("well-roof", [side * 0.825, 3.32, 0], [Math.hypot(1.65, 0.8), 0.055, 3.16], "wood");
    roof.rotation.z = -side * roofAngle;
  }
  k.box("ridge-cap", [0, 3.74, 0], [0.13, 0.1, 3.16], "dark");
  function cylinder(name: string, x: number, length: number, radius: number, surface: Surface) {
    const mesh = k.add(name, new THREE.CylinderGeometry(radius, radius, length, 6), surface);
    mesh.position.set(x, 1.98, 0);
    mesh.rotation.z = Math.PI / 2;
  }
  cylinder("windlass-axle", 0.055, 3.17, 0.105, "oak");
  cylinder("windlass-drum", 0, 0.96, 0.18, "wood");
  k.beam("crank-arm", [1.65, 1.98, 0], [1.65, 1.62, 0], 0.065, "iron");
  k.beam("crank-handle", [1.63, 1.62, 0], [1.86, 1.62, 0], 0.065, "dark");
  k.beam("hanging-rope", [0.16, 1.98, 0.17], [0.16, 1.3, 0.17], 0.018, "wood");
  const bucket = ring("bucket-shell", 0.19, 0.225, 0.4, 0.63, "wood");
  bucket.position.x = 0.16;
  bucket.position.z = 0.17;
  const bottom = k.add("bucket-bottom", new THREE.CylinderGeometry(0.195, 0.195, 0.04, 8), "wood");
  bottom.position.set(0.16, 0.65, 0.17);
  for (const x of [-0.065, 0.385]) k.beam("bucket-bail", [x, 1.03, 0.17], [x, 1.3, 0.17], 0.025, "iron");
  k.beam("bucket-bail", [-0.065, 1.3, 0.17], [0.385, 1.3, 0.17], 0.025, "iron");
  return k.finish();
}
