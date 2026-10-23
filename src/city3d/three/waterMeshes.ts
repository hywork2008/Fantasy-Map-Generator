// CE 3D land, water, and bank meshes. WebGL is created by the view, not here.

import * as THREE from "three";
import { fortWaterPolygons } from "../../city-editor/generators/fortSiteGeometry";
import { type CityTerrain, cityTerrain } from "../../city-editor/generators/terrainElevation";
import {
  classifyTownWater,
  strictWet,
  TOWN_WATER_COLOR,
  type TownWaterKind,
  type TownWaterPart,
  townGroundPolygons,
  townWaterTriangles
} from "../../city-editor/generators/townWater";
import type { CityDocument } from "../../city-editor/types/document";
import type { Point } from "../../city-editor/types/primitives";
import type { TriangleSoup } from "../core/massingGeometry";
import { planVertex } from "../core/planFrame";
import { LAND_Y, WATER_Y, waterSurfaceGeometry } from "../core/waterGeometry";

const LAND_COLOR = 0xd5cfbf;
const UNKNOWN_COLOR = 0xcfcdc6;
const ESCARPMENT_COLOR = 0x9a9284;
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
  /** Exact rendered wet footprints, shared with overlays that must leave physical openings. */
  wetPolygons: Point[][];
  dispose(): void;
}

/** Sample the rendered water triangles so floating models share the exact sea or river datum. */
export function townWaterHeightAt(water: TownWaterMeshes, point: Point): number {
  water.parent.updateMatrixWorld(true);
  const ray = new THREE.Raycaster(new THREE.Vector3(...planVertex(point, 1e6)), new THREE.Vector3(0, -1, 0));
  // Water meshes deliberately disable picking; query their triangles without enabling UI picking.
  const hits: THREE.Intersection[] = [];
  water.parent.traverse(object => {
    if (object instanceof THREE.Mesh) THREE.Mesh.prototype.raycast.call(object, ray, hits);
  });
  hits.sort((a, b) => a.distance - b.distance);
  return hits[0]?.point.y ?? WATER_Y;
}

/** Classify the document and build the meshes. Does not touch the scene. */
export function createTownWater(document: CityDocument, terrain: CityTerrain = cityTerrain(document)): TownWaterMeshes {
  if (document.fortSite) return createFortGround(document, terrain);
  const parent = new THREE.Object3D();
  parent.name = "ce-water";
  const water = classifyTownWater(document);
  const patches = new Map<string, Point[][]>();
  const escarpment: Point[][] = [];
  if (terrain.relief)
    for (const patch of terrain.triangles) {
      const parts = patches.get(patch.faceId) ?? [];
      (patch.escarpment ? escarpment : parts).push(patch.points);
      patches.set(patch.faceId, parts);
    }
  const ground = townGroundPolygons(document, water, terrain.relief ? patches : undefined);
  // Preserve the legacy flat frame. Relief and sea level share the terrain datum.
  const elevations = Object.values(document.mesh.faces)
    .filter(face => face.properties.water === "land")
    .map(face => face.properties.elevation)
    .filter(elevation => Number.isFinite(elevation) && elevation > 0);
  const landElevation = elevations.length ? elevations.reduce((sum, value) => sum + value, 0) / elevations.length : 1;
  const waterY = (kind: TownWaterKind) =>
    kind === "ocean" ? LAND_Y - (terrain.relief ? terrain.datumMeters : landElevation) : WATER_Y;
  const partLevel = (part: TownWaterPart) =>
    part.kind === "ocean" || !terrain.relief
      ? waterY(part.kind)
      : Math.min(...part.polygon.map(terrain.heightAt)) + WATER_Y;
  const partHeight = (part: TownWaterPart): ((point: Point) => number) =>
    terrain.relief && (part.kind === "river" || part.kind === "channel")
      ? point => terrain.heightAt(point) + WATER_Y
      : () => partLevel(part);
  const heights = water.parts.map(partHeight);
  const land = meshFrom(
    "ce-land",
    soupAt(ground.land, LAND_Y, terrain.relief ? terrain.heightAt : undefined),
    LAND_COLOR,
    THREE.FrontSide
  );
  const cliff = land
    ? meshFrom("ce-escarpment", soupAt(escarpment, LAND_Y, terrain.heightAt), ESCARPMENT_COLOR, THREE.DoubleSide)
    : null;
  if (cliff) parent.add(cliff);
  const unknown = land ? meshFrom("ce-unknown", soupAt(ground.unknown, LAND_Y), UNKNOWN_COLOR, THREE.FrontSide) : null;
  const bank = land
    ? bankMesh(
        water.parts.map(part => part.polygon),
        water.parts.map(partLevel),
        terrain.relief ? point => terrain.heightAt(point) + LAND_Y : undefined,
        terrain.relief ? (point, index) => heights[index](point) : undefined
      )
    : null;
  if (land) {
    for (const kind of KINDS) {
      const parts = water.parts.filter(part => part.kind === kind);
      if (!parts.length) continue;
      const positions: number[] = [],
        normals: number[] = [];
      for (const part of parts) {
        const top = waterSurfaceGeometry(townWaterTriangles([part]), [], () => false, {
          waterY: partLevel(part),
          waterHeightAt: terrain.relief ? partHeight(part) : undefined
        }).top;
        positions.push(...top.positions);
        normals.push(...top.normals);
      }
      const top = { positions: Float32Array.from(positions), normals: Float32Array.from(normals) };
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
    wetPolygons: land ? water.parts.map(part => part.polygon) : [],
    dispose() {
      parent.removeFromParent();
      land?.removeFromParent();
      unknown?.removeFromParent();
      bank?.removeFromParent();
      for (const object of owned) disposeMesh(object);
    }
  };
}

function bankMesh(
  polygons: Point[][],
  boundaryWaterY: number[],
  landHeightAt?: (point: Point) => number,
  boundaryWaterHeightAt?: (point: Point, index: number) => number
): THREE.Mesh | null {
  const skirt = waterSurfaceGeometry([], polygons, point => strictWet(point, polygons), {
    boundaryWaterY,
    landHeightAt,
    boundaryWaterHeightAt
  }).skirt;
  return meshFrom("ce-bank", skirt, LAND_COLOR, THREE.DoubleSide);
}

function soupAt(triangles: Point[][], y: number, heightAt?: (point: Point) => number): TriangleSoup {
  const soup = waterSurfaceGeometry(triangles, [], () => false, {
    waterY: y,
    waterHeightAt: heightAt ? point => y + heightAt(point) : undefined
  }).top;
  return soup;
}

function meshFrom(name: string, soup: TriangleSoup, color: number, side: THREE.Side): THREE.Mesh | null {
  if (!soup.positions.length) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(soup.positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(soup.normals, 3));
  geometry.computeVertexNormals();
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

/** Excavated terrain remains beneath one disjoint water surface, including moat junctions. */
function createFortGround(document: CityDocument, terrain: CityTerrain): TownWaterMeshes {
  const site = document.fortSite!,
    parent = new THREE.Object3D();
  parent.name = "ce-water";
  const land = meshFrom(
    "ce-land",
    soupAt(
      terrain.triangles.map(patch => patch.points),
      LAND_Y,
      terrain.heightAt
    ),
    LAND_COLOR,
    THREE.FrontSide
  );
  const polygons = fortWaterPolygons(site);
  const positions: number[] = [],
    normals: number[] = [];
  for (const part of polygons) {
    const top = soupAt(
      townWaterTriangles([{ kind: "lake", polygon: part.polygon }]),
      part.elevationMeters - terrain.datumMeters + LAND_Y + 0.02
    );
    positions.push(...top.positions);
    normals.push(...top.normals);
  }
  const water = meshFrom(
    "ce-water-moat",
    { positions: Float32Array.from(positions), normals: Float32Array.from(normals) },
    0x527f8b,
    THREE.FrontSide
  );
  if (water) parent.add(water);
  return {
    parent,
    land,
    unknown: null,
    bank: null,
    pickables: [],
    replacesDisc: !!land,
    wetPolygons: water ? polygons.map(part => part.polygon) : [],
    dispose() {
      parent.removeFromParent();
      land?.removeFromParent();
      if (land) disposeMesh(land);
      if (water) disposeMesh(water);
    }
  };
}
