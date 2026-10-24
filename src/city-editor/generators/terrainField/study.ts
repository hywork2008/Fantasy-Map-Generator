import type { CityDocument, Point } from "../../types/document";
import type { TerrainPlatform } from "../../types/terrain";
import { createCastleBuildingOnFace } from "../castles";
import { polygonCentroid } from "../geom";
import { edgeBetween, facePoints, meshFromCells } from "../mesh";
import { setCastlePlatform } from "../terrainEditing";
import { buildTerrainFieldRecipe } from "./build";
import { fieldFromParts } from "./conform";
import { buildRiverCorridors } from "./corridor";
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

/** Editable slope with a river corridor and three pads at different heights. */
export function createTerraceRiverStudy(seed = 5): CityDocument {
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
  const recipe = buildTerrainFieldRecipe({ template: "escarpment", seed, extentMeters: extent, sampleMeters: 4 });
  const field = fieldFromParts(extent, recipe.sampleMeters, recipe.parts);
  for (const face of Object.values(mesh.faces)) {
    face.properties.water = "land";
    face.properties.buildable = true;
    face.properties.ward = "empty";
    face.properties.elevation = faceMeanElevation(facePoints(mesh, face), point => sampleField(field, point));
  }
  const bank = Object.values(mesh.vertices)
    .filter(vertex => Math.abs(vertex.point[1] + 75) < 0.5)
    .sort((a, b) => a.point[0] - b.point[0]);
  const vertices: string[] = [];
  for (const vertex of bank) {
    const previous = vertices[vertices.length - 1];
    if (!previous || edgeBetween(mesh, previous, vertex.id)) vertices.push(vertex.id);
  }
  if (vertices.length < 4) throw new Error("Could not trace the terrace study river");
  const document: CityDocument = {
    format: "fmg-city-editor",
    version: 2,
    historicalPeriod: "highMedieval",
    appearance: "town",
    frame: { extentMeters: extent, cityRadiusMeters: 180, blockSizeMeters: step },
    mesh,
    featureGroups: [
      {
        id: "study-river",
        name: "Study river",
        kind: "river",
        vertices,
        source: { vertexId: vertices[0], kind: "spring" },
        mouth: { vertexId: vertices[vertices.length - 1], kind: "mapBoundary" },
        style: { widthMeters: 8, color: "#527f8b" },
        locked: false
      }
    ],
    gates: [],
    elements: [],
    castles: [],
    defenseCircuits: [],
    terrain: { version: 1, features: [], field: recipe }
  };
  const corridors = buildRiverCorridors(document, field);
  const specs: Array<{ level: number; a: Point; b: Point }> = [
    { level: 10, a: [-110, 10], b: [-40, 70] },
    { level: 16, a: [-20, 10], b: [50, 70] },
    { level: 22, a: [70, 10], b: [140, 70] }
  ];
  const pads: TerrainPlatform[] = specs.map((spec, index) => ({
    kind: "platform",
    id: `pad:study-${index}`,
    role: "pad",
    levelMeters: spec.level,
    edge: { kind: "wall" },
    summit: {
      kind: "polygon",
      points: [
        [spec.a[0], spec.a[1]],
        [spec.b[0], spec.a[1]],
        [spec.b[0], spec.b[1]],
        [spec.a[0], spec.b[1]]
      ]
    }
  }));
  document.terrain = { version: 1, features: [...corridors, ...pads], field: recipe };
  return document;
}
