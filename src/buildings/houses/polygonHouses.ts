import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { BuildingMassing } from "../../city-editor/types/contracts/buildingMassing";
import type { Point } from "../../city-editor/types/primitives";
import { buildingSurfaces } from "../../city3d/core/massingGeometry";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { BUILDING_PALETTES } from "../appearance/palette";
import type { BuildingAppearance } from "../appearance/types";
import type { RegionalHouseQuality } from "./regionalHouses";

export const POLYGON_HOUSES = {
  author: "Codex GPT-6.1 Sol",
  note: "Measured polygonal houses with street-facing timber doors, shuttered windows, relief joinery and roof courses. Narrow, trapezoidal and concave footprints retain their original walls and roof geometry."
} as const;

export interface PolygonHouseSpec {
  /** CE plan coordinates relative to the placement origin, in metres. */
  footprint: Point[];
  massing: BuildingMassing;
  appearance: BuildingAppearance;
  entrance: Point;
}

export function polygonHouseSpecKey(spec: PolygonHouseSpec): string {
  return JSON.stringify(spec);
}

export function createPolygonHouseGeometry(spec: PolygonHouseSpec, quality: RegionalHouseQuality = "high") {
  const surfaces = buildingSurfaces(spec.footprint, spec.massing, { includeWallPanels: true });
  if (!surfaces) throw new Error("Invalid polygon house footprint");
  const detailed = quality === "high";
  const parts: THREE.BufferGeometry[] = [];
  const palette = spec.appearance;
  const wall = BUILDING_PALETTES[palette.wallPaletteId][palette.shadeBin];
  const roof = BUILDING_PALETTES[palette.roofPaletteId][palette.shadeBin];
  const timber = palette.framePaletteId ? BUILDING_PALETTES[palette.framePaletteId][palette.shadeBin] : "#69513B";
  function add(geometry: THREE.BufferGeometry, color: string) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    const rgb = new THREE.Color(color);
    const values = new Float32Array(flat.getAttribute("position").count * 3);
    for (let i = 0; i < values.length; i += 3) values.set([rgb.r, rgb.g, rgb.b], i);
    flat.setAttribute("color", new THREE.BufferAttribute(values, 3));
    parts.push(flat);
  }
  for (const [soup, color] of [
    [surfaces.walls, wall],
    [surfaces.roofs, roof]
  ] as const) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(soup.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(soup.normals, 3));
    add(geometry, color);
  }
  for (const panel of surfaces.wallPanels!) {
    const dx = panel.b[0] - panel.a[0],
      dz = -(panel.b[1] - panel.a[1]);
    const length = Math.hypot(dx, dz);
    if (length < 1.2) continue;
    const tx = dx / length,
      tz = dz / length;
    const nx = -tz,
      nz = tx;
    function box(u: number, y: number, w: number, h: number, depth: number, color: string, out = 0.035) {
      add(
        new THREE.BoxGeometry(w, h, depth)
          .rotateY(-Math.atan2(tz, tx))
          .translate(panel.a[0] + tx * u + nx * out, panel.base + y, -panel.a[1] + tz * u + nz * out),
        color
      );
    }
    const entrance =
      panel.level === 0 &&
      Math.hypot((panel.a[0] + panel.b[0]) / 2 - spec.entrance[0], (panel.a[1] + panel.b[1]) / 2 - spec.entrance[1]) <
        1e-5;
    const bays = Math.max(1, Math.floor(length / 2.8));
    const bay = length / bays;
    for (let b = 0; b < bays; b++) {
      const door = entrance && b === Math.floor(bays / 2);
      // The entrance candidate is always the middle of its wall, even with an even bay count.
      if (entrance && !door && Math.abs((b + 0.5) * bay - length / 2) < 1.2) continue;
      const u = door ? length / 2 : (b + 0.5) * bay;
      const w = Math.min(door ? 0.95 : 0.7, bay * 0.48);
      const h = door ? 2.05 : 1.0;
      const y = door ? h / 2 : Math.min(panel.height - 0.7, 1.7);
      box(u, y, w, h, 0.05, door ? "#5A3B26" : "#29333A");
      if (!detailed) continue;
      for (const side of [-1, 1]) {
        box(u + side * (w / 2 + 0.055), y + (door ? 0.04 : 0), 0.11, h + (door ? 0.08 : 0.16), 0.12, timber, 0.06);
        if (!door || side === 1) box(u, y + side * (h / 2 + 0.055), w + 0.22, 0.11, 0.14, timber, 0.07);
        if (!door) box(u + side * w * 0.78, y, w * 0.4, h, 0.06, timber, 0.07);
      }
      if (door) {
        for (let n = 1; n < 5; n++) box(u - w / 2 + (w * n) / 5, y, 0.018, h, 0.03, "#30281E", 0.07);
        for (const sign of [-1, 1]) box(u, y + sign * h * 0.3, w * 0.9, 0.055, 0.035, "#30281E", 0.085);
      } else {
        box(u, y, 0.045, h, 0.06, timber, 0.08);
        box(u, y, w, 0.045, 0.06, timber, 0.08);
      }
    }
    if (detailed && palette.wallFinish === "plaster-infill") {
      box(length / 2, panel.height - 0.1, length, 0.18, 0.12, timber);
      if (!entrance) box(length / 2, 0.1, length, 0.18, 0.12, timber);
      for (let b = 0; b <= bays; b++) {
        const u = Math.max(0.08, Math.min(length - 0.08, b * bay));
        if (entrance && Math.abs(u - length / 2) < 0.65) continue;
        box(u, panel.height / 2, 0.14, panel.height, 0.12, timber);
      }
    }
  }
  if (detailed) {
    // Horizontal courses are clipped to each actual roof triangle, including skew hips.
    const positions = surfaces.roofs.positions;
    const seam = new THREE.Color(roof).multiplyScalar(0.75).getStyle();
    for (let i = 0; i < positions.length; i += 9) {
      const triangle = [0, 3, 6].map(j => new THREE.Vector3().fromArray(positions, i + j));
      const normal = new THREE.Vector3().fromArray(surfaces.roofs.normals, i);
      const lo = Math.min(...triangle.map(p => p.y)),
        hi = Math.max(...triangle.map(p => p.y));
      for (let y = Math.ceil((lo + 0.02) / 0.18) * 0.18; y < hi - 0.02; y += 0.18) {
        const hits: THREE.Vector3[] = [];
        triangle.forEach((a, j) => {
          const b = triangle[(j + 1) % 3];
          if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) hits.push(a.clone().lerp(b, (y - a.y) / (b.y - a.y)));
        });
        if (hits.length !== 2) continue;
        const direction = hits[1].clone().sub(hits[0]);
        if (direction.length() < 0.04) continue;
        const midpoint = hits[0].clone().add(hits[1]).multiplyScalar(0.5).addScaledVector(normal, 0.012);
        const geometry = new THREE.BoxGeometry(direction.length(), 0.025, 0.025);
        geometry.applyQuaternion(
          new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction.normalize())
        );
        geometry.translate(midpoint.x, midpoint.y, midpoint.z);
        add(geometry, seam);
      }
    }
  }
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createPolygonHouse(
  spec: PolygonHouseSpec,
  quality: RegionalHouseQuality = "high"
): CityStructureMeshes {
  const geometry = createPolygonHouseGeometry(spec, quality);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.name = "polygon-regional-house";
  group.add(mesh);
  return {
    group,
    pickables: [mesh],
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}

export function defaultPolygonHouseSpec(variant: 0 | 1 | 2): PolygonHouseSpec {
  const footprint: Point[] =
    variant === 0
      ? [
          [-1.2, -4],
          [1.2, -4],
          [1.2, 4],
          [-1.2, 4]
        ]
      : variant === 1
        ? [
            [-2.5, -4],
            [2.5, -4],
            [1.7, 4],
            [-2, 4]
          ]
        : [
            [-3, -4],
            [3, -4],
            [3, 4],
            [0, 4],
            [0, 1],
            [-3, 1]
          ];
  return {
    footprint,
    entrance: [0, -4],
    massing: {
      storeys: 2,
      floors: [
        { level: 0, use: "residential", heightMeters: 3.2 },
        { level: 1, use: "residential", heightMeters: 2.9 }
      ],
      cellar: false,
      jettyMeters: 0,
      eaveHeightMeters: 6.1,
      baseElevationMeters: 0,
      tint: 1,
      wall: "timber-frame",
      roof: {
        form: variant === 0 ? "gable" : variant === 1 ? "hip" : "flat",
        pitchDeg: 38,
        ridgeAzimuth: Math.PI / 2,
        material: "shingle"
      }
    },
    appearance: {
      version: 1,
      profileId: "atlantic",
      wallPaletteId: "plaster",
      roofPaletteId: "shingle",
      framePaletteId: "frame",
      shadeBin: variant,
      wallFinish: "plaster-infill"
    }
  };
}

export function createPolygonHouses(quality: RegionalHouseQuality = "high"): CityStructureMeshes {
  const group = new THREE.Group();
  const houses = ([0, 1, 2] as const).map(variant => {
    const house = createPolygonHouse(defaultPolygonHouseSpec(variant), quality);
    house.group.position.x = (variant - 1) * 8;
    group.add(house.group);
    return house;
  });
  return {
    group,
    pickables: houses.flatMap(house => house.pickables),
    dispose() {
      for (const house of houses) house.dispose();
    }
  };
}
