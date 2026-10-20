import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";
import { createMedievalWagonModel } from "./medievalWagon";

/** Imagined pre-industrial covered freight wagon; meters, front at +X. */
export const COVERED_WAGON = {
  name: "Covered wagon",
  length: 6.4,
  width: 2.5,
  height: 3.5,
  note: "Imagined timber freight wagon with an unbleached canvas cover over wooden bows, stitched seams, rope lashings and rolled end curtains. Both ends remain open above the plank end boards, revealing the empty load bed. Four iron-bound spoked wheels, a driver's bench and twin shafts; no draft animals or harness. Illustrative dimensions, not a reconstruction of a particular historical vehicle."
} as const;

export interface CoveredWagonMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createCoveredWagonModel(): CityStructureMeshes {
  const base = createMedievalWagonModel();
  const { group, pickables } = base;
  group.name = "covered-wagon";
  // Place the bench fully ahead of the canvas opening, keeping its supports on the bed.
  for (const mesh of pickables) {
    if (mesh.name === "driver-seat-plank" || mesh.name === "bench-support") mesh.position.x += 0.15;
  }
  const geometries = new Set<THREE.BufferGeometry>();
  const canvas = new THREE.MeshLambertMaterial({ color: 0xd8c9a6, side: THREE.DoubleSide });
  const seams = new THREE.MeshLambertMaterial({ color: 0xb5a17a, side: THREE.DoubleSide });
  const timber = new THREE.MeshLambertMaterial({ color: 0x765337 });
  const rope = new THREE.MeshLambertMaterial({ color: 0x9c8457 });
  const materials = [canvas, seams, timber, rope];
  function add(name: string, geometry: THREE.BufferGeometry, material: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const bows = [-2.14, -1.5, -0.86, -0.22, 0.42];
  function profile(x: number, radius: number): THREE.Vector3[] {
    return [
      v(x, 1.98, radius),
      ...Array.from({ length: 25 }, (_, i) => {
        const angle = (i * Math.PI) / 24;
        return v(x, 2.5 + radius * Math.sin(angle), radius * Math.cos(angle));
      }),
      v(x, 1.98, -radius)
    ];
  }
  function cover(start: number, end: number, radius: number, sag: boolean) {
    const positions: number[] = [];
    for (let section = 0; section < 8; section++) {
      const rows = [section, section + 1].map(index => {
        const t = index / 8;
        const row = profile(start + (end - start) * t, radius);
        if (sag) {
          for (const p of row) p.y -= 0.025 * Math.sin(t * Math.PI) * Math.max(0, (p.y - 1.98) / 1.42);
        }
        return row;
      });
      for (let i = 0; i < rows[0].length - 1; i++) {
        for (const p of [rows[0][i], rows[1][i], rows[1][i + 1], rows[0][i], rows[1][i + 1], rows[0][i + 1]]) {
          positions.push(p.x, p.y, p.z);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
  function cord(name: string, points: THREE.Vector3[], radius: number, material: THREE.Material) {
    // Linear segments keep the bow feet and lashings from overshooting their anchors.
    const path = new THREE.CurvePath<THREE.Vector3>();
    for (let i = 0; i < points.length - 1; i++) path.add(new THREE.LineCurve3(points[i], points[i + 1]));
    return add(name, new THREE.TubeGeometry(path, Math.max(2, points.length * 2), radius, 6, false), material);
  }
  for (let i = 0; i < bows.length - 1; i++) add("canvas-panel", cover(bows[i], bows[i + 1], 0.9, true), canvas);
  for (const x of bows) {
    cord("wooden-canopy-bow", profile(x, 0.85), 0.025, timber);
    add("stitched-canopy-seam", cover(x - 0.012, x + 0.012, 0.905, false), seams);
    for (const side of [-1, 1]) {
      cord(
        "canvas-lashing",
        [v(x, 2.01, side * 0.91), v(x, 1.7, side * 0.95), v(x + 0.045, 1.79, side * 0.93)],
        0.012,
        rope
      );
    }
  }
  for (const side of [-1, 1]) {
    cord("canvas-lower-hem", [v(-2.17, 1.99, side * 0.905), v(0.45, 1.99, side * 0.905)], 0.018, seams);
  }
  for (const x of [bows[0], bows[bows.length - 1]]) {
    cord("end-opening-hem", profile(x, 0.908), 0.024, seams);
    const roll = add("rolled-end-curtain", new THREE.CylinderGeometry(0.075, 0.075, 0.82, 12), canvas);
    roll.rotation.x = Math.PI / 2;
    roll.position.set(x, 3.2, 0);
    for (const z of [-0.28, 0.28]) {
      cord(
        "curtain-roll-tie",
        [v(x, 3.35, z), v(x + 0.085, 3.2, z), v(x, 3.12, z), v(x - 0.085, 3.2, z), v(x, 3.35, z)],
        0.012,
        rope
      );
    }
  }
  return {
    group,
    pickables,
    dispose() {
      base.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
    }
  };
}

export function createCoveredWagon(): CoveredWagonMeshes {
  const model = createCoveredWagonModel();
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
