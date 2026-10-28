import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Point } from "../../city-editor/types/primitives";
import type { CityStructureMeshes } from "../../city3d/three/structureMeshes";
import { BUILDING_PALETTES, type BuildingPaletteId } from "../appearance/palette";
import type { RegionalHouseQuality } from "./regionalHouses";

export const EARTHEN_HOUSES = {
  author: "Codex GPT-6.1 Sol",
  note: "Mudbrick houses with polygonal footprints, earthen roof terraces, inset parapets, timber lintels, shuttered openings, exposed beam ends and roof drainage."
} as const;

export interface EarthenHouseSpec {
  /** Local X/Z wall outline, in metres. Never fitted to a rectangular bounding box. */
  footprint: readonly Point[];
  floorHeights: readonly number[];
  entranceEdge: number;
  groundUse: "residential" | "retail" | "craft" | "storage";
  wall: BuildingPaletteId;
  roof: BuildingPaletteId;
  shade: 0 | 1 | 2;
}

export function earthenHouseSpecKey(spec: EarthenHouseSpec): string {
  return JSON.stringify(spec);
}

export function defaultEarthenHouseSpec(variant: 0 | 1 | 2): EarthenHouseSpec {
  return {
    footprint:
      variant === 1
        ? [
            [-2.5, -4],
            [2.5, -4],
            [2, 4],
            [-2, 4]
          ]
        : [
            [-2.5, -4],
            [2.5, -4],
            [2.5, 4],
            [-2.5, 4]
          ],
    floorHeights: variant === 0 ? [3.2] : variant === 1 ? [3.2, 2.9] : [3.2, 2.9, 2.9],
    entranceEdge: 2,
    groundUse: variant === 2 ? "craft" : "residential",
    wall: "earth",
    roof: "turf",
    shade: variant
  };
}

/** One vertex-coloured prototype shared by BV and the CE instance layer. */
export function createEarthenHouseGeometry(
  spec: EarthenHouseSpec,
  quality: RegionalHouseQuality = "high"
): THREE.BufferGeometry {
  const detailed = quality === "high";
  const parts: THREE.BufferGeometry[] = [];
  const colors = new Map<string, THREE.Color>();
  const wall = BUILDING_PALETTES[spec.wall][spec.shade];
  const roof = BUILDING_PALETTES[spec.roof][spec.shade];
  const timber = BUILDING_PALETTES.timber[0];
  const dark = "#30281E";
  const height = spec.floorHeights.reduce((sum, floor) => sum + floor, 0);
  const area = spec.footprint.reduce((sum, a, i) => {
    const b = spec.footprint[(i + 1) % spec.footprint.length];
    return sum + a[0] * b[1] - b[0] * a[1];
  }, 0);
  const sign = Math.sign(area);
  const edges = spec.footprint.map((a, i) => {
    const b = spec.footprint[(i + 1) % spec.footprint.length];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const tx = (b[0] - a[0]) / length,
      tz = (b[1] - a[1]) / length;
    return { a, b, length, tx, tz, nx: sign * tz, nz: -sign * tx };
  });
  function add(geometry: THREE.BufferGeometry, color: string) {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    flat.deleteAttribute("uv");
    let rgb = colors.get(color);
    if (!rgb) {
      rgb = new THREE.Color(color);
      colors.set(color, rgb);
    }
    const values = new Float32Array(flat.getAttribute("position").count * 3);
    for (let i = 0; i < values.length; i += 3) {
      values[i] = rgb.r;
      values[i + 1] = rgb.g;
      values[i + 2] = rgb.b;
    }
    flat.setAttribute("color", new THREE.BufferAttribute(values, 3));
    parts.push(flat);
  }
  function solid(outline: readonly Point[], y: number, h: number, color: string, hole?: readonly Point[]) {
    const shape = new THREE.Shape(outline.map(p => new THREE.Vector2(p[0], -p[1])));
    if (hole) shape.holes.push(new THREE.Path(hole.map(p => new THREE.Vector2(p[0], -p[1]))));
    add(
      new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, y, 0),
      color
    );
  }
  function onEdge(
    index: number,
    u: number,
    y: number,
    out: number,
    w: number,
    h: number,
    depth: number,
    color: string
  ) {
    const e = edges[index];
    add(
      new THREE.BoxGeometry(w, h, depth)
        .rotateY(-Math.atan2(e.tz, e.tx))
        .translate((e.a[0] + e.b[0]) / 2 + e.tx * u + e.nx * out, y, (e.a[1] + e.b[1]) / 2 + e.tz * u + e.nz * out),
      color
    );
  }
  solid(spec.footprint, 0, height, wall);
  solid(spec.footprint, height, 0.12, roof);
  // Intersect offset edge lines to keep every parapet corner inside the actual lot.
  const inset = Math.min(0.18, ...edges.map(e => e.length * 0.08));
  const inner: Point[] = edges.map((e, i) => {
    const prev = edges[(i + edges.length - 1) % edges.length];
    const ax = prev.a[0] - prev.nx * inset,
      az = prev.a[1] - prev.nz * inset;
    const bx = e.a[0] - e.nx * inset,
      bz = e.a[1] - e.nz * inset;
    const cross = prev.tx * e.tz - prev.tz * e.tx;
    if (Math.abs(cross) < 1e-7) return [bx, bz];
    const t = ((bx - ax) * e.tz - (bz - az) * e.tx) / cross;
    return [ax + prev.tx * t, az + prev.tz * t];
  });
  solid(spec.footprint, height + 0.12, 0.42, wall, inner);
  let base = 0;
  for (const [level, floorHeight] of spec.floorHeights.entries()) {
    edges.forEach((edge, index) => {
      if (edge.length < 1.2) return;
      const entrance = level === 0 && index === spec.entranceEdge;
      const openingWidth = Math.min(entrance ? 1.0 : 0.65, edge.length * 0.35);
      const openingHeight = entrance ? Math.min(2.1, floorHeight - 0.35) : Math.min(0.95, floorHeight - 1.2);
      const y = base + (entrance ? openingHeight / 2 : 1.1 + openingHeight / 2);
      onEdge(index, 0, y, 0.015, openingWidth, openingHeight, 0.04, dark);
      if (detailed) {
        // Narrow reveals, a timber lintel and individual door/shutter boards.
        for (const side of [-1, 1])
          onEdge(
            index,
            side * (openingWidth / 2 + 0.06),
            y,
            0.035,
            0.12,
            openingHeight + (entrance ? 0 : 0.1),
            0.1,
            wall
          );
        onEdge(index, 0, y + openingHeight / 2 + 0.08, 0.045, openingWidth + 0.3, 0.16, 0.12, timber);
        for (let n = 0; n < 4; n++)
          onEdge(
            index,
            ((n - 1.5) * openingWidth) / 4,
            y,
            0.045,
            openingWidth / 4 - 0.018,
            openingHeight - 0.06,
            0.035,
            timber
          );
        for (const offset of [-0.3, 0.3])
          onEdge(index, 0, y + openingHeight * offset, 0.07, openingWidth * 0.9, 0.06, 0.035, "#574A37");
        if (!entrance) onEdge(index, 0, y - openingHeight / 2 - 0.07, 0.065, openingWidth + 0.22, 0.1, 0.16, wall);
        // Sparse exposed adobe patches respect openings rather than running across the door.
        for (let row = 0; row < Math.floor(floorHeight / 0.28); row++) {
          const yy = base + 0.16 + row * 0.28;
          for (let u = -edge.length / 2 + 0.35 + (row % 2) * 0.2; u < edge.length / 2 - 0.3; u += 0.55) {
            if (Math.abs(u) < openingWidth / 2 + 0.32 && Math.abs(yy - y) < openingHeight / 2 + 0.28) continue;
            if ((row + Math.round((u + edge.length) * 4) + index) % 4 !== 0) continue;
            onEdge(index, u, yy, 0.012, 0.42, 0.19, 0.035, BUILDING_PALETTES[spec.wall][(row + index) % 3]);
          }
        }
        for (let u = -edge.length / 2 + 0.45; u < edge.length / 2 - 0.35; u += 0.8)
          onEdge(index, u, base + floorHeight - 0.16, 0.06, 0.13, 0.14, 0.22, timber);
        if (entrance && spec.groundUse !== "residential")
          onEdge(
            index,
            openingWidth * 0.65,
            Math.min(2.6, floorHeight - 0.2),
            0.06,
            Math.min(0.65, edge.length * 0.2),
            0.25,
            0.1,
            timber
          );
      }
    });
    base += floorHeight;
  }
  if (detailed) {
    edges.forEach((edge, index) => {
      // Coping joints and one open timber scupper below the parapet.
      for (let u = -edge.length / 2 + 0.4; u < edge.length / 2 - 0.2; u += 0.55)
        onEdge(index, u, height + 0.53, -inset / 2, 0.025, 0.02, inset * 0.9, BUILDING_PALETTES[spec.wall][0]);
    });
    const drain = edges[spec.entranceEdge];
    if (drain.length > 2) {
      const u = drain.length * 0.32;
      for (const side of [-1, 1])
        onEdge(spec.entranceEdge, u + side * 0.09, height + 0.18, 0.12, 0.05, 0.12, 0.42, timber);
      onEdge(spec.entranceEdge, u, height + 0.13, 0.12, 0.23, 0.03, 0.42, timber);
    }
  }
  const geometry = mergeGeometries(parts)!;
  for (const part of parts) part.dispose();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createEarthenHouse(
  spec: EarthenHouseSpec,
  quality: RegionalHouseQuality = "high"
): CityStructureMeshes {
  const geometry = createEarthenHouseGeometry(spec, quality);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geometry, material);
  const group = new THREE.Group();
  group.name = "earthen-flat-roof-house";
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

export function createEarthenHouses(quality: RegionalHouseQuality = "high"): CityStructureMeshes {
  const group = new THREE.Group();
  group.name = "earthen-flat-roof-houses";
  const houses = ([0, 1, 2] as const).map(variant => {
    const house = createEarthenHouse(defaultEarthenHouseSpec(variant), quality);
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
