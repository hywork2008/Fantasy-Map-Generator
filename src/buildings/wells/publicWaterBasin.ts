import * as THREE from "three";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { meshProjection } from "../meshProjection";

import type { WaterBasinKind } from "./publicWaterBasinSpec";

export {
  PUBLIC_WATER_BASIN_NOTE,
  PUBLIC_WATER_BASINS,
  WATER_BASIN_KINDS,
  type WaterBasinKind
} from "./publicWaterBasinSpec";

export interface PublicWaterBasinMeshes extends CityStructureMeshes {
  elevation: string;
  plan: string;
}

export function createPublicWaterBasinModel(kind: WaterBasinKind = "publicBasin"): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = `medieval-${kind}`;
  const pickables: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>();
  const material = (color: number) => new THREE.MeshLambertMaterial({ color });
  const stone = [0xa29a87, 0xb7ad97, 0xc6bba3].map(material);
  const water = material(0x6b999d);
  const metal = material(0x5b6658);
  const materials = [...stone, water, metal];
  const cube = new THREE.BoxGeometry(1, 1, 1);
  geometries.add(cube);
  function add(name: string, geometry: THREE.BufferGeometry, surface: THREE.Material) {
    geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, surface);
    mesh.name = name;
    group.add(mesh);
    pickables.push(mesh);
    return mesh;
  }
  function box(name: string, x: number, y: number, z: number, w: number, h: number, d: number, surface = stone[0]) {
    const mesh = add(name, cube, surface);
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    return mesh;
  }
  function cylinder(name: string, radius: number, y: number, height: number, surface = stone[0], segments = 8) {
    const mesh = add(name, new THREE.CylinderGeometry(radius, radius, height, segments), surface);
    mesh.position.y = y;
    return mesh;
  }
  function pipe(name: string, points: THREE.Vector3[], radius: number, surface: THREE.Material) {
    return add(name, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 16, radius, 8, false), surface);
  }
  if (kind === "publicBasin") {
    cylinder("basin-step", 1.65, 0.09, 0.18, stone[0]);
    cylinder("basin-floor", 1.48, 0.24, 0.14, stone[1]);
    // Annular masonry sectors have inner faces and open tops, rather than a solid cylinder.
    for (let row = 0; row < 3; row++) {
      const inner = row === 2 ? 1.17 : 1.2;
      const outer = row === 2 ? 1.53 : 1.46;
      const shape = new THREE.Shape();
      const a = Math.PI / 4;
      shape.moveTo(inner, 0);
      shape.lineTo(outer, 0);
      shape.lineTo(outer * Math.cos(a), outer * Math.sin(a));
      shape.lineTo(inner * Math.cos(a), inner * Math.sin(a));
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      geometries.add(geometry);
      for (let i = 0; i < 8; i++) {
        const block = add(
          row === 2 ? "basin-coping" : "basin-wall",
          geometry.clone().rotateY(i * a),
          stone[(row + i) % 3]
        );
        block.position.y = 0.3 + row * 0.22;
      }
    }
    cylinder("basin-water", 1.195, 0.71, 0.025, water);
    cylinder("spout-column-base", 0.34, 0.42, 0.4, stone[0]);
    cylinder("spout-column", 0.2, 1.28, 1.72, stone[1]);
    cylinder("spout-column-cap", 0.3, 2.18, 0.16, stone[2]);
    const finial = add("column-finial", new THREE.SphereGeometry(0.15, 12, 8), stone[1]);
    finial.position.y = 2.33;
    pipe(
      "bronze-spout",
      [new THREE.Vector3(0, 1.65, 0.12), new THREE.Vector3(0, 1.65, 0.4), new THREE.Vector3(0, 1.6, 0.47)],
      0.045,
      metal
    );
    pipe(
      "flowing-water",
      [new THREE.Vector3(0, 1.6, 0.47), new THREE.Vector3(0, 1.3, 0.58), new THREE.Vector3(0, 0.72, 0.64)],
      0.018,
      water
    );
  } else {
    const washing = kind === "washhouse";
    const width = washing ? 3.8 : 3.1;
    const depth = washing ? 2.5 : 2.05;
    box("basin-footing", 0, 0.08, 0, width, 0.16, depth);
    box("basin-floor", 0, 0.21, 0, width - 0.2, 0.1, depth - 0.2, stone[1]);
    for (const side of [-1, 1]) {
      box("basin-side-wall", side * (width / 2 - 0.2), 0.5, 0, 0.26, 0.58, depth - 0.2, stone[1]);
      box("basin-end-wall", 0, 0.5, side * (depth / 2 - 0.2), width - 0.3, 0.58, 0.26, stone[1]);
    }
    box("basin-water", 0, 0.6, 0, width - 0.67, 0.025, depth - 0.67, water);
    if (washing) {
      for (const side of [-1, 1])
        for (let i = 0; i < 5; i++) {
          const slab = box("washing-slab", -1.36 + i * 0.68, 0.85, side * 0.87, 0.66, 0.14, 0.65, stone[(i + 1) % 3]);
          slab.rotation.x = -side * 0.32;
        }
      box("supply-channel", 0, 0.8, -1.14, 0.3, 0.18, 0.32, stone[2]);
    } else {
      box("spring-source-wall", 0, 1.34, -0.83, 2.7, 2.36, 0.3, stone[0]);
      box("spring-wall-cap", 0, 2.53, -0.83, 2.94, 0.12, 0.43, stone[2]);
      box("source-surround", 0, 1.5, -0.62, 0.65, 0.65, 0.16, stone[1]);
      pipe(
        "bronze-spout",
        [new THREE.Vector3(0, 1.5, -0.55), new THREE.Vector3(0, 1.5, -0.28), new THREE.Vector3(0, 1.44, -0.25)],
        0.05,
        metal
      );
      pipe(
        "flowing-water",
        [new THREE.Vector3(0, 1.44, -0.25), new THREE.Vector3(0, 1.1, -0.16), new THREE.Vector3(0, 0.61, -0.1)],
        0.02,
        water
      );
    }
  }
  return {
    group,
    pickables,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const surface of materials) surface.dispose();
    }
  };
}

export function createPublicWaterBasin(kind: WaterBasinKind = "publicBasin"): PublicWaterBasinMeshes {
  const model = createPublicWaterBasinModel(kind);
  return { ...model, elevation: meshProjection(model, "side"), plan: meshProjection(model, "top") };
}
