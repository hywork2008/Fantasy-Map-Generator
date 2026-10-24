// CE 3D land, water, and bank meshes. WebGL is created by the view, not here.

import * as THREE from "three";
import { clipEscarpmentTriangles } from "../../city-editor/generators/cellPlateClip";
import { fortWaterPolygons } from "../../city-editor/generators/fortSiteGeometry";
import { riverDropMeters, townWaterElevations } from "../../city-editor/generators/riverSurface";
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
import type { TerrainRiverCorridor } from "../../city-editor/types/terrain";
import type { TriangleSoup } from "../core/massingGeometry";
import { planVertex } from "../core/planFrame";
import { LAND_Y, WATER_Y, waterSurfaceGeometry } from "../core/waterGeometry";
import { terrainFieldMeshes } from "./terrainFieldMesh";

/** Highest the river surface may stand above the carved bed under it, in metres. */
const RIVER_RISE_MAX = 1.2;

/** Corners this close share one river-bed level. */
const BED_REACH_METERS = 30;

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

/**
 * Classify the document and build the meshes. Does not touch the scene.
 * `dropMeters` is how far a river sits below the land it touches. 1 keeps the
 * flat-map gap. A drop as large as the land puts the river back at elevation 0.
 */
export function createTownWater(
  document: CityDocument,
  terrain: CityTerrain = cityTerrain(document),
  dropMeters?: number
): TownWaterMeshes {
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
  const wetWalls = terrain.field
    ? []
    : water.parts.filter(part => part.kind === "river" || part.kind === "channel").map(part => part.polygon);
  const wallTriangles = wetWalls.length ? clipEscarpmentTriangles(escarpment, wetWalls) : escarpment;
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
  // A carved valley keeps its water near the bed. The rim only lifts the surface to the nearby bank, and
  // never more than RIVER_RISE_MAX above the local bed, so a deep gorge does not hold a floating sheet.
  const rimAt = (point: Point) => {
    const bed = terrain.heightAt(point);
    let rim = bed;
    for (const delta of [
      [4, 0],
      [-4, 0],
      [0, 4],
      [0, -4]
    ] as const)
      rim = Math.max(rim, terrain.heightAt([point[0] + delta[0], point[1] + delta[1]]));
    return Math.min(rim, bed + RIVER_RISE_MAX) + WATER_Y;
  };
  // Cell relief steps between banks, so the river's own corners can read different cells. The surface takes
  // the lowest ground among corners within BED_REACH_METERS, which keeps it level across the width and
  // still follows the river's fall along its length.
  const cellBedAt = (part: TownWaterPart) => {
    const corners = part.polygon.map(corner => ({ corner, ground: terrain.heightAt(corner) }));
    return (point: Point) => {
      let bed = terrain.heightAt(point);
      for (const { corner, ground } of corners)
        if (ground < bed && Math.hypot(corner[0] - point[0], corner[1] - point[1]) <= BED_REACH_METERS) bed = ground;
      return bed + WATER_Y;
    };
  };
  // Relief used to pin every river to the datum, so a high bank became a trench down to 0.
  // The profile follows the centre line: highest upstream, never above the bank.
  const absoluteWater =
    terrain.relief && !terrain.field ? townWaterElevations(document, riverDropMeters(dropMeters)) : null;
  const sceneY = (absolute: number) => LAND_Y + (absolute - terrain.datumMeters);
  const partHeight = (part: TownWaterPart): ((point: Point) => number) => {
    if (terrain.field && terrain.waterAt && (part.kind === "river" || part.kind === "channel"))
      return point => {
        const level = terrain.waterAt?.(point);
        return level === null || level === undefined ? rimAt(point) : level + WATER_Y;
      };
    if (terrain.field && (part.kind === "river" || part.kind === "channel")) return rimAt;
    if (absoluteWater && part.kind === "river")
      return point => {
        const absolute = absoluteWater.riverAt(point);
        return absolute === null ? cellBedAt(part)(point) : sceneY(absolute);
      };
    if (absoluteWater && part.kind === "channel") {
      const absolute = absoluteWater.channelAt(part.polygon);
      if (absolute === null) return cellBedAt(part);
      // The stored cell elevation is the centre. On an empty slope the shore can be lower, and a sheet
      // taken from the centre would float. Keep it level, under the lower of that centre and the shore.
      let shore = Infinity;
      for (const point of part.polygon) shore = Math.min(shore, terrain.heightAt(point));
      const y = Math.min(sceneY(absolute), shore + WATER_Y);
      return () => y;
    }
    return () => partLevel(part);
  };
  const heights = water.parts.map(partHeight);
  const fieldMeshes = terrain.grid ? terrainFieldMeshes(document, terrain) : [];
  for (const mesh of fieldMeshes) parent.add(mesh);
  const land = fieldMeshes.length
    ? null
    : meshFrom(
        "ce-land",
        soupAt(ground.land, LAND_Y, terrain.relief ? terrain.heightAt : undefined),
        LAND_COLOR,
        THREE.FrontSide
      );
  const hasGround = land !== null || fieldMeshes.length > 0;
  const cliff = hasGround
    ? meshFrom("ce-escarpment", soupAt(wallTriangles, LAND_Y, terrain.heightAt), ESCARPMENT_COLOR, THREE.DoubleSide)
    : null;
  if (cliff) parent.add(cliff);
  const quay = hasGround ? quayMesh(document, terrain) : null;
  if (quay) parent.add(quay);
  const unknown = land ? meshFrom("ce-unknown", soupAt(ground.unknown, LAND_Y), UNKNOWN_COLOR, THREE.FrontSide) : null;
  const bank = hasGround
    ? bankMesh(
        water.parts.map(part => part.polygon),
        water.parts.map(partLevel),
        terrain.relief ? point => terrain.heightAt(point) + LAND_Y : undefined,
        terrain.relief ? (point, index) => heights[index](point) : undefined
      )
    : null;
  if (land || fieldMeshes.length) {
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
    replacesDisc: land !== null || fieldMeshes.length > 0,
    wetPolygons: land || fieldMeshes.length ? water.parts.map(part => part.polygon) : [],
    dispose() {
      parent.removeFromParent();
      land?.removeFromParent();
      unknown?.removeFromParent();
      bank?.removeFromParent();
      for (const object of owned) disposeMesh(object);
    }
  };
}

/** Vertical quay from just below the corridor water to the bank ground. */
function quayMesh(document: CityDocument, terrain: CityTerrain): THREE.Mesh | null {
  const corridors = (document.terrain?.features ?? []).filter(
    (feature): feature is TerrainRiverCorridor => feature.kind === "riverCorridor" && feature.bank.kind === "quay"
  );
  if (!corridors.length) return null;
  const positions: number[] = [];
  const normals: number[] = [];
  const push = (point: Point, y: number) => {
    const vertex = planVertex(point, y);
    positions.push(vertex[0], vertex[1], vertex[2]);
    normals.push(0, 1, 0);
  };
  for (const corridor of corridors) {
    const line = corridor.centerline;
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const length = Math.hypot(dx, dy) || 1;
      const normal: Point = [-dy / length, dx / length];
      const halfA = corridor.widthsMeters[Math.min(i - 1, corridor.widthsMeters.length - 1)] / 2;
      const halfB = corridor.widthsMeters[Math.min(i, corridor.widthsMeters.length - 1)] / 2;
      const waterA = corridor.bedMeters[i - 1] + corridor.depthMeters - terrain.datumMeters + WATER_Y - 0.15;
      const waterB = corridor.bedMeters[i] + corridor.depthMeters - terrain.datumMeters + WATER_Y - 0.15;
      for (const side of [-1, 1] as const) {
        const left: Point = [a[0] + normal[0] * halfA * side, a[1] + normal[1] * halfA * side];
        const right: Point = [b[0] + normal[0] * halfB * side, b[1] + normal[1] * halfB * side];
        const outside = (point: Point): Point => [point[0] + normal[0] * 0.4 * side, point[1] + normal[1] * 0.4 * side];
        const topA = terrain.heightAt(outside(left)) + LAND_Y;
        const topB = terrain.heightAt(outside(right)) + LAND_Y;
        push(left, waterA);
        push(right, waterB);
        push(left, topA);
        push(right, waterB);
        push(right, topB);
        push(left, topA);
      }
    }
  }
  return meshFrom(
    "ce-quay",
    { positions: Float32Array.from(positions), normals: Float32Array.from(normals) },
    ESCARPMENT_COLOR,
    THREE.DoubleSide
  );
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
