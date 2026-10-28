// Chunked height-field ground. Positions stay in the plan frame; Y includes the shared land offset.

import * as THREE from "three";
import { cutDitchGround, ditchGroundNearby } from "../../city-editor/generators/bastionedTown/ditchGeometry";
import { triangularInfillParts } from "../../city-editor/generators/lotGeometry";
import { bounds, boundsOverlap, subtractConvex } from "../../city-editor/generators/parcelGeometry";
import { suburbSpacingFactor } from "../../city-editor/generators/terrainField/constants";
import { type TerrainChunkGeometry, terrainChunkGeometry } from "../../city-editor/generators/terrainField/drawGrid";
import type { BastionedTownPlan, CityDocument, Point } from "../../city-editor/types/document";
import type { CityTerrain } from "../../city-editor/types/terrain";
import { LAND_Y } from "../core/waterGeometry";

/** Clip only the triangles near an excavation; interpolate the original height and color. */
export function clipDitchChunk(chunk: TerrainChunkGeometry, plan: BastionedTownPlan | undefined): TerrainChunkGeometry {
  if (!plan) return chunk;
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < chunk.positions.length; i += 3) {
    minX = Math.min(minX, chunk.positions[i]);
    maxX = Math.max(maxX, chunk.positions[i]);
    minY = Math.min(minY, -chunk.positions[i + 2]);
    maxY = Math.max(maxY, -chunk.positions[i + 2]);
  }
  if (
    !ditchGroundNearby(plan, [
      [minX, minY],
      [maxX, maxY]
    ])
  )
    return chunk;
  const positions: number[] = [],
    colors: number[] = [];
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < chunk.indices.length; i += 3) {
    const ids = [chunk.indices[i], chunk.indices[i + 1], chunk.indices[i + 2]];
    const points = ids.map(id => [chunk.positions[id * 3], -chunk.positions[id * 3 + 2]] as Point);
    const area = cross(points[0], points[1], points[2]);
    if (Math.abs(area) < 1e-12) continue;
    for (const piece of cutDitchGround(plan, points))
      for (const tri of triangularInfillParts(piece))
        for (let k = 1; k + 1 < tri.length; k++)
          for (const point of [tri[0], tri[k], tri[k + 1]]) {
            const weights = [
              cross(point, points[1], points[2]),
              cross(points[0], point, points[2]),
              cross(points[0], points[1], point)
            ].map(v => v / area);
            const height = ids.reduce((sum, id, j) => sum + weights[j] * chunk.positions[id * 3 + 1], 0);
            positions.push(point[0], height, -point[1]);
            for (let channel = 0; channel < 3; channel++)
              colors.push(ids.reduce((sum, id, j) => sum + weights[j] * chunk.colors[id * 3 + channel], 0));
          }
  }
  return {
    positions: Float32Array.from(positions),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i)
  };
}

/** One Lambert mesh per chunk. Not pickable. Empty when the terrain has no draw grid. */
export function terrainFieldMeshes(
  document: CityDocument,
  terrain: CityTerrain,
  wetPolygons: Point[][] = []
): THREE.Mesh[] {
  const grid = terrain.grid;
  if (!grid || !terrain.slopeAt) return [];
  const chunks = terrainChunkGeometry(
    grid,
    terrain.slopeAt,
    Math.max(40, document.frame.cityRadiusMeters),
    suburbSpacingFactor(document.frame.extentMeters)
  );
  const wetParts = wetPolygons.flatMap(triangularInfillParts).map(polygon => ({ polygon, box: bounds(polygon) }));
  return chunks.map((source, index) => {
    const chunk = clipWaterChunk(clipDitchChunk(source, document.bastionedTown), wetParts);
    const positions = new Float32Array(chunk.positions);
    for (let i = 1; i < positions.length; i += 3) positions[i] += LAND_Y;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(chunk.colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(chunk.indices, 1));
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.FrontSide }));
    mesh.name = `ce-field-${index}`;
    mesh.raycast = () => {};
    return mesh;
  });
}

/** Cut the rendered water footprint from the height field, preserving interpolated ground heights. */
export function clipWaterChunk(
  chunk: TerrainChunkGeometry,
  wetParts: { polygon: Point[]; box: ReturnType<typeof bounds> }[]
): TerrainChunkGeometry {
  if (!wetParts.length || !chunk.positions.length) return chunk;
  const points: Point[] = [];
  for (let i = 0; i < chunk.positions.length; i += 3) points.push([chunk.positions[i], -chunk.positions[i + 2]]);
  const chunkBox = bounds(points);
  wetParts = wetParts.filter(wet => boundsOverlap(chunkBox, wet.box));
  if (!wetParts.length) return chunk;
  const positions: number[] = [],
    colors: number[] = [];
  const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  for (let i = 0; i < chunk.indices.length; i += 3) {
    const ids = [chunk.indices[i], chunk.indices[i + 1], chunk.indices[i + 2]];
    const points = ids.map(id => [chunk.positions[id * 3], -chunk.positions[id * 3 + 2]] as Point);
    const area = cross(points[0], points[1], points[2]);
    if (Math.abs(area) < 1e-12) continue;
    const box = bounds(points);
    let pieces = [points];
    for (const wet of wetParts) {
      if (boundsOverlap(box, wet.box)) pieces = pieces.flatMap(piece => subtractConvex(piece, wet.polygon, 0.001));
      if (!pieces.length) break;
    }
    for (const piece of pieces)
      for (const tri of triangularInfillParts(piece))
        for (let k = 1; k + 1 < tri.length; k++)
          for (const point of [tri[0], tri[k], tri[k + 1]]) {
            const weights = [
              cross(point, points[1], points[2]),
              cross(points[0], point, points[2]),
              cross(points[0], points[1], point)
            ].map(v => v / area);
            positions.push(
              point[0],
              ids.reduce((sum, id, j) => sum + weights[j] * chunk.positions[id * 3 + 1], 0),
              -point[1]
            );
            for (let channel = 0; channel < 3; channel++)
              colors.push(ids.reduce((sum, id, j) => sum + weights[j] * chunk.colors[id * 3 + channel], 0));
          }
  }
  return {
    positions: Float32Array.from(positions),
    colors: Float32Array.from(colors),
    indices: Uint32Array.from({ length: positions.length / 3 }, (_, i) => i)
  };
}
