import * as THREE from "three";
import type { ArchitectureKit } from "../architectureKit";

const SEGMENTS = 32;

/** World-plan centers and facade normals shared by paint and corridor placement. */
export function babelEntranceCenters(radius: number) {
  const faceWidth = 2 * radius * Math.sin(Math.PI / SEGMENTS);
  const count = Math.max(1, Math.floor(faceWidth / 8));
  const width = Math.min(4.2, (faceWidth / (count + 1)) * 0.65);
  const faceRadius = radius * Math.cos(Math.PI / SEGMENTS) + 0.025;
  return Array.from({ length: SEGMENTS * count }, (_, index) => {
    const angle = ((Math.floor(index / count) + 0.5) * Math.PI * 2) / SEGMENTS;
    const offset = faceWidth * (((index % count) + 1) / (count + 1) - 0.5);
    return {
      angle,
      width,
      x: Math.sin(angle) * faceRadius + Math.cos(angle) * offset,
      z: Math.cos(angle) * faceRadius - Math.sin(angle) * offset
    };
  });
}

/** Painted round-headed entrances, coplanar with each polygonal wall face. */
export function addBabelEntrances(
  k: ArchitectureKit,
  name: string,
  radius: number,
  base: number,
  height: number,
  pointed = false
) {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, 0);
  shape.lineTo(0.5, 0);
  shape.lineTo(0.5, 0.65);
  if (pointed) {
    shape.quadraticCurveTo(0.45, 0.87, 0, 1);
    shape.quadraticCurveTo(-0.45, 0.87, -0.5, 0.65);
  } else shape.absellipse(0, 0.65, 0.5, 0.35, 0, Math.PI, false, 0);
  shape.closePath();
  const indexedArch = new THREE.ShapeGeometry(shape, 4);
  const arch = indexedArch.toNonIndexed();
  indexedArch.dispose();
  const vertices = arch.getAttribute("position");
  const positions: number[] = [];
  const doorHeight = Math.min(12, height * 0.62);
  for (const entrance of babelEntranceCenters(radius)) {
    for (let vertex = 0; vertex < vertices.count; vertex++) {
      const x = vertices.getX(vertex) * entrance.width;
      positions.push(
        entrance.x + Math.cos(entrance.angle) * x,
        base + 0.3 + vertices.getY(vertex) * doorHeight,
        entrance.z - Math.sin(entrance.angle) * x
      );
    }
  }
  arch.dispose();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const painted = k.add(name, geometry, "dark");
  // Keep facade paint stable at the long viewing distance of this 509 m study.
  const material = painted.material as THREE.MeshLambertMaterial;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -4;
}
