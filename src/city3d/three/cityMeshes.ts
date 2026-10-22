import * as THREE from "three";
import { buildingAppearanceColors } from "../../buildings/appearance/colors";
import type { BuildingAppearance } from "../../buildings/appearance/types";
import type { BuildingMassing } from "../../city-editor/types/contracts/buildingMassing";
import type { Point } from "../../city-editor/types/primitives";
import { buildingSurfaces, type TriangleSoup } from "../core/massingGeometry";
import { ROOF_COLOR, tinted, WALL_COLOR } from "./palette";

export interface CityMassingMeshes {
  group: THREE.Group;
  pickables: THREE.Mesh[];
  dispose(): void;
  updateAppearance?(lots: readonly MassingLot[]): boolean;
}

interface MassingLot {
  polygon: Point[];
  massing?: BuildingMassing;
  appearance?: BuildingAppearance;
}
function geometryKey(lots: readonly MassingLot[]): string {
  return JSON.stringify(
    lots.map(lot =>
      lot.massing
        ? [
            lot.polygon,
            lot.massing.floors.map(f => f.heightMeters),
            lot.massing.jettyMeters,
            lot.massing.eaveHeightMeters,
            lot.massing.roof.form,
            lot.massing.roof.pitchDeg,
            lot.massing.roof.ridgeAzimuth
          ]
        : null
    )
  );
}

interface Parts {
  positions: number[];
  normals: number[];
  colors: number[];
  buildingIndex: number[];
}

function append(parts: Parts, soup: TriangleSoup, color: readonly [number, number, number], index: number): void {
  parts.positions.push(...soup.positions);
  parts.normals.push(...soup.normals);
  const vertices = soup.positions.length / 3;
  for (let i = 0; i < vertices; i++) {
    parts.colors.push(color[0], color[1], color[2]);
    parts.buildingIndex.push(index);
  }
}

function meshFrom(parts: Parts): THREE.Mesh | null {
  if (!parts.positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(parts.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(parts.normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(parts.colors, 3));
  geometry.setAttribute("buildingIndex", new THREE.Float32BufferAttribute(parts.buildingIndex, 1));
  return new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
}

/** One wall mesh and one roof mesh for every lot that has massing. `buildingIndex` matches the input array. */
export function createCityMassing(
  lots: readonly MassingLot[],
  foundationAt?: (ring: Point[]) => number
): CityMassingMeshes {
  const walls: Parts = { positions: [], normals: [], colors: [], buildingIndex: [] };
  const sourceKey = geometryKey(lots);
  const roofs: Parts = { positions: [], normals: [], colors: [], buildingIndex: [] };
  const colorCache = new Map<string, [number, number, number]>();
  const linear = (hex: string): [number, number, number] => {
    let color = colorCache.get(hex);
    if (!color) {
      const c = new THREE.Color(hex);
      color = [c.r, c.g, c.b];
      colorCache.set(hex, color);
    }
    return color;
  };
  const colorFor = (lot: MassingLot, roof: boolean): readonly [number, number, number] => {
    const massing = lot.massing!;
    const colors = buildingAppearanceColors(lot.appearance);
    return colors
      ? linear(roof ? colors.roof : colors.wall)
      : tinted(roof ? ROOF_COLOR[massing.roof.material] : WALL_COLOR[massing.wall], massing.tint);
  };
  for (let index = 0; index < lots.length; index++) {
    const massing = lots[index].massing;
    if (!massing) continue;
    const surfaces = buildingSurfaces(lots[index].polygon, massing);
    if (!surfaces) continue;
    const elevation = foundationAt?.(lots[index].polygon) ?? 0;
    if (elevation)
      for (const surface of [surfaces.walls, surfaces.roofs])
        for (let i = 1; i < surface.positions.length; i += 3) surface.positions[i] += elevation;
    append(walls, surfaces.walls, colorFor(lots[index], false), index);
    append(roofs, surfaces.roofs, colorFor(lots[index], true), index);
  }
  const group = new THREE.Group();
  group.name = "massing";
  const pickables: THREE.Mesh[] = [];
  for (const parts of [walls, roofs]) {
    const mesh = meshFrom(parts);
    if (!mesh) continue;
    mesh.userData.surface = parts === roofs ? "roof" : "wall";
    group.add(mesh);
    pickables.push(mesh);
  }
  return {
    group,
    pickables,
    updateAppearance(next) {
      if (geometryKey(next) !== sourceKey) return false;
      for (const mesh of pickables) {
        const colors = mesh.geometry.getAttribute("color");
        const indices = mesh.geometry.getAttribute("buildingIndex");
        const resolved = next.map(lot => (lot.massing ? colorFor(lot, mesh.userData.surface === "roof") : null));
        for (let i = 0; i < colors.count; i++) colors.setXYZ(i, ...resolved[indices.getX(i)]!);
        colors.needsUpdate = true;
      }
      return true;
    },
    dispose() {
      for (const mesh of pickables) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    }
  };
}
