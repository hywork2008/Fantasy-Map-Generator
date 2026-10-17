// CE 3D land, water, and bank meshes. WebGL is created by the view, not here.

import * as THREE from "three";
import {
  classifyTownWater,
  strictWet,
  TOWN_WATER_COLOR,
  type TownWaterKind,
  townGroundPolygons,
  townWaterTriangles
} from "../../city-editor/generators/townWater";
import type { CityDocument } from "../../city-editor/types/document";
import type { Point } from "../../city-editor/types/primitives";
import type { TriangleSoup } from "../core/massingGeometry";
import { LAND_Y, waterSurfaceGeometry } from "../core/waterGeometry";

const LAND_COLOR = 0xd5cfbf;
const UNKNOWN_COLOR = 0xcfcdc6;
const KINDS: readonly TownWaterKind[] = ["ocean", "lake", "channel", "river"];

export interface City3dRefreshPlan {
  buildings: boolean;
  water: boolean;
  roads: boolean;
}

/**
 * Closed views rebuild nothing. Buildings follow the fabric object.
 * Water follows the caller's water-stamp bit. Roads follow the road-stamp
 * bit alone: a water edit rebuilds roads only when that string changed.
 */
export function planCity3dRefresh(input: {
  fabricChanged: boolean;
  stampChanged: boolean;
  roadStampChanged: boolean;
  open: boolean;
}): City3dRefreshPlan {
  if (!input.open) return { buildings: false, water: false, roads: false };
  return { buildings: input.fabricChanged, water: input.stampChanged, roads: input.roadStampChanged };
}

/** Parent absence counts. Missing ce-water-* children do not. */
export function waterStampChanged(previous: string | null, next: string, parentPresent: boolean): boolean {
  return previous !== next || !parentPresent;
}

export interface TownWaterMeshes {
  parent: THREE.Object3D;
  land: THREE.Mesh | null;
  unknown: THREE.Mesh | null;
  bank: THREE.Mesh | null;
  /** Land, water, and banks are never picked. */
  pickables: THREE.Mesh[];
  /** False keeps the ground disc and draws no water. */
  replacesDisc: boolean;
  dispose(): void;
}

/** Classify the document and build the meshes. Does not touch the scene. */
export function createTownWater(document: CityDocument): TownWaterMeshes {
  const parent = new THREE.Object3D();
  parent.name = "ce-water";
  const water = classifyTownWater(document);
  const ground = townGroundPolygons(document, water);
  const land = meshFrom("ce-land", soupAt(ground.land, LAND_Y), LAND_COLOR, THREE.FrontSide);
  const unknown = land ? meshFrom("ce-unknown", soupAt(ground.unknown, LAND_Y), UNKNOWN_COLOR, THREE.FrontSide) : null;
  const bank = land ? bankMesh(water.parts.map(part => part.polygon)) : null;
  if (land) {
    for (const kind of KINDS) {
      const parts = water.parts.filter(part => part.kind === kind);
      if (!parts.length) continue;
      const top = waterSurfaceGeometry(townWaterTriangles(parts), [], () => false).top;
      const mesh = meshFrom(`ce-water-${kind}`, top, TOWN_WATER_COLOR[kind], THREE.FrontSide);
      if (mesh) parent.add(mesh);
    }
  }
  const owned = [land, unknown, bank, ...parent.children];
  return {
    parent,
    land,
    unknown,
    bank,
    pickables: [],
    replacesDisc: land !== null,
    dispose() {
      parent.removeFromParent();
      land?.removeFromParent();
      unknown?.removeFromParent();
      bank?.removeFromParent();
      for (const object of owned) disposeMesh(object);
    }
  };
}

function bankMesh(polygons: Point[][]): THREE.Mesh | null {
  const skirt = waterSurfaceGeometry([], polygons, point => strictWet(point, polygons)).skirt;
  return meshFrom("ce-bank", skirt, LAND_COLOR, THREE.DoubleSide);
}

function soupAt(triangles: Point[][], y: number): TriangleSoup {
  const soup = waterSurfaceGeometry(triangles, [], () => false).top;
  for (let i = 1; i < soup.positions.length; i += 3) soup.positions[i] = y;
  return soup;
}

function meshFrom(name: string, soup: TriangleSoup, color: number, side: THREE.Side): THREE.Mesh | null {
  if (!soup.positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(soup.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(soup.normals, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, side }));
  mesh.name = name;
  mesh.raycast = () => {};
  return mesh;
}

function disposeMesh(object: THREE.Object3D | null): void {
  if (!(object instanceof THREE.Mesh)) return;
  object.geometry.dispose();
  const material = object.material;
  if (Array.isArray(material)) for (const item of material) item.dispose();
  else material.dispose();
}
