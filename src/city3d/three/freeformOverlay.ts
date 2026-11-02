import * as THREE from "three";
import { polygonArea } from "../../city-editor/generators/geom";
import type { CityTerrain } from "../../city-editor/generators/terrainElevation";
import { TOWN_WATER_COLOR } from "../../city-editor/generators/townWater";
import type { CityDocument } from "../../city-editor/types/document";
import type { LandZone } from "../../city-editor/types/freeformCity";
import type { Point } from "../../city-editor/types/primitives";
import type { TerrainRiverCorridor } from "../../city-editor/types/terrain";
import { LAND_Y } from "../core/waterGeometry";

const ZONE_COLOR: Record<LandZone["kind"], number> = {
  forest: 0x3d6b45,
  farm: 0xc4b06a,
  park: 0x7d9a6a
};

/** Water ribbon for a ledger river. The bed itself is already carved into the height field. */
export function freeformRiverMesh(document: CityDocument, terrain: CityTerrain): THREE.Mesh | null {
  const corridors = (document.terrain?.features ?? []).filter(
    (feature): feature is TerrainRiverCorridor => feature.kind === "riverCorridor"
  );
  if (!document.freeform || !corridors.length) return null;
  const positions: number[] = [];
  for (const corridor of corridors) {
    const line = corridor.centerline;
    for (let i = 1; i < line.length; i++) {
      const halfA = (corridor.widthsMeters[Math.min(i - 1, corridor.widthsMeters.length - 1)] ?? 1) / 2;
      const halfB = (corridor.widthsMeters[Math.min(i, corridor.widthsMeters.length - 1)] ?? halfA) / 2;
      const a = line[i - 1];
      const b = line[i];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const leftA = shift(a, dx, dy, halfA, true);
      const rightA = shift(a, dx, dy, halfA, false);
      const leftB = shift(b, dx, dy, halfB, true);
      const rightB = shift(b, dx, dy, halfB, false);
      const ya = waterY(terrain, a);
      const yb = waterY(terrain, b);
      push(positions, leftA, ya, rightA, ya, leftB, yb);
      push(positions, rightA, ya, rightB, yb, leftB, yb);
    }
  }
  return meshFrom("ce-freeform-river", positions, TOWN_WATER_COLOR.river, false);
}

/** Land-use polygons draped on the height field. One mesh per zone, so disposal walks the water parent. */
export function freeformZoneMeshes(document: CityDocument, terrain: CityTerrain): THREE.Mesh[] {
  const zones = document.freeform?.zones ?? [];
  const meshes: THREE.Mesh[] = [];
  for (const zone of zones) {
    const ring = polygonArea(zone.polygon) > 0 ? [...zone.polygon].reverse() : zone.polygon;
    const shape = new THREE.Shape();
    shape.moveTo(ring[0][0], -ring[0][1]);
    for (let i = 1; i < ring.length; i++) shape.lineTo(ring[i][0], -ring[i][1]);
    const geometry = new THREE.ShapeGeometry(shape);
    geometry.rotateX(Math.PI / 2);
    const position = geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const planY = -position.getZ(i);
      position.setY(i, terrain.heightAt([x, planY]) + LAND_Y + 0.2);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({
      color: ZONE_COLOR[zone.kind],
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `ce-freeform-zone-${zone.kind}`;
    mesh.raycast = () => {};
    meshes.push(mesh);
  }
  return meshes;
}

function waterY(terrain: CityTerrain, point: Point): number {
  const local = terrain.waterAt?.(point);
  return (local ?? terrain.heightAt(point)) + LAND_Y + 0.05;
}

function shift(origin: Point, dx: number, dy: number, half: number, left: boolean): Point {
  const length = Math.hypot(dx, dy) || 1;
  const sign = left ? 1 : -1;
  return [origin[0] + (-dy / length) * half * sign, origin[1] + (dx / length) * half * sign];
}

function push(positions: number[], a: Point, ya: number, b: Point, yb: number, c: Point, yc: number): void {
  positions.push(a[0], ya, -a[1], b[0], yb, -b[1], c[0], yc, -c[1]);
}

function meshFrom(name: string, positions: number[], color: number, transparent: boolean): THREE.Mesh | null {
  if (positions.length < 9) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(Float32Array.from(positions), 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(
    geometry,
    new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, transparent, opacity: transparent ? 0.85 : 1 })
  );
  mesh.name = name;
  mesh.raycast = () => {};
  return mesh;
}
