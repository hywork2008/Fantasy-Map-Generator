import type { CityDocument, Point } from "../../types/document";
import { createCastleBuildingOnFace } from "../castles";
import { polygonCentroid } from "../geom";
import { facePoints, meshFromCells } from "../mesh";
import { setCastlePlatform } from "../terrainEditing";
import { buildTerrainFieldRecipe } from "./build";
import { fieldFromParts } from "./conform";
import { faceMeanElevation, markUnbuildableSlopes } from "./lots";
import { highestSample, sampleField, slopeField } from "./sample";

/** Editable tiny crag with a cliff-edged castle pad, for inspection and the acceptance check. */
export function createCliffFortressStudy(seed = 11): CityDocument {
  const extent = 600;
  const step = 50;
  const cells = [];
  for (let y = -5; y <= 5; y++)
    for (let x = -5; x <= 5; x++) {
      const cx = x * step;
      const cy = y * step;
      const polygon: Point[] = [
        [cx - step / 2, cy - step / 2],
        [cx + step / 2, cy - step / 2],
        [cx + step / 2, cy + step / 2],
        [cx - step / 2, cy + step / 2]
      ];
      cells.push({
        id: cells.length,
        site: [cx, cy] as Point,
        polygon,
        centroid: [cx, cy] as Point,
        neighbors: [],
        onBorder: Math.abs(x) === 5 || Math.abs(y) === 5
      });
    }
  const mesh = meshFromCells(cells);
  const recipe = buildTerrainFieldRecipe({ template: "crag", seed, extentMeters: extent, sampleMeters: 4 });
  const field = fieldFromParts(extent, recipe.sampleMeters, recipe.parts);
  for (const face of Object.values(mesh.faces)) {
    face.properties.water = "land";
    face.properties.buildable = true;
    face.properties.ward = "empty";
    face.properties.elevation = faceMeanElevation(facePoints(mesh, face), point => sampleField(field, point));
  }
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 2,
    historicalPeriod: "highMedieval",
    appearance: "town",
    frame: { extentMeters: extent, cityRadiusMeters: 120, blockSizeMeters: step },
    mesh,
    featureGroups: [],
    gates: [],
    elements: [],
    castles: [],
    defenseCircuits: [],
    terrain: { version: 1, features: [], field: recipe }
  };
  markUnbuildableSlopes(document, point => slopeField(field, point));
  const summit = highestSample(field).point;
  let host = Object.values(mesh.faces)[0];
  let best = Infinity;
  for (const face of Object.values(mesh.faces)) {
    const center = polygonCentroid(facePoints(mesh, face));
    const distance = Math.hypot(center[0] - summit[0], center[1] - summit[1]);
    if (distance < best) {
      best = distance;
      host = face;
    }
  }
  host.properties.buildable = true;
  host.properties.ward = "empty";
  const road = Object.values(mesh.edges).find(edge => {
    const a = mesh.vertices[edge.a].point;
    const b = mesh.vertices[edge.b].point;
    const midX = (a[0] + b[0]) / 2;
    const midY = (a[1] + b[1]) / 2;
    return midY < -70 && midY > -150 && Math.abs(midX) < 30 && Math.abs(a[1] - b[1]) < 1;
  });
  if (road)
    document.featureGroups.push({
      id: "study-approach",
      name: "Approach",
      kind: "road",
      segments: [{ edgeId: road.id, forward: true }],
      style: { widthMeters: 5, color: "#d5cfbf" },
      locked: false
    });
  for (const face of Object.values(mesh.faces)) {
    const center = polygonCentroid(facePoints(mesh, face));
    if (center[1] < -90 && Math.abs(center[0]) < 40 && face.properties.water === "land") {
      face.properties.buildable = true;
      face.properties.settlement = "core";
    }
  }
  const castle = createCastleBuildingOnFace(document, host.id);
  if (!castle?.castles?.[0]) throw new Error("Could not place the cliff study castle");
  const level = Math.max(
    ...facePoints(castle.mesh, castle.mesh.faces[host.id]).map(point => sampleField(field, point)),
    sampleField(field, polygonCentroid(facePoints(castle.mesh, castle.mesh.faces[host.id])))
  );
  const raised = setCastlePlatform(castle, castle.castles[0].id, { levelMeters: level, edge: { kind: "cliff" } });
  if (!raised) throw new Error("Could not raise the cliff study platform");
  return raised;
}
