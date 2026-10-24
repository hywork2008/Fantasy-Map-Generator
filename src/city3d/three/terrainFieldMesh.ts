// Chunked height-field ground. Positions stay in the plan frame; Y includes the shared land offset.

import * as THREE from "three";
import { suburbSpacingFactor } from "../../city-editor/generators/terrainField/constants";
import { terrainChunkGeometry } from "../../city-editor/generators/terrainField/drawGrid";
import type { CityDocument } from "../../city-editor/types/document";
import type { CityTerrain } from "../../city-editor/types/terrain";
import { LAND_Y } from "../core/waterGeometry";

/** One Lambert mesh per chunk. Not pickable. Empty when the terrain has no draw grid. */
export function terrainFieldMeshes(document: CityDocument, terrain: CityTerrain): THREE.Mesh[] {
  const grid = terrain.grid;
  if (!grid || !terrain.slopeAt) return [];
  const chunks = terrainChunkGeometry(
    grid,
    terrain.slopeAt,
    Math.max(40, document.frame.cityRadiusMeters),
    suburbSpacingFactor(document.frame.extentMeters)
  );
  return chunks.map((chunk, index) => {
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
