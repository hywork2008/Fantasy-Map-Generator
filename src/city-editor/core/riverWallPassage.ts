import { clipPolylineOutsideRivers, type RiverRibbon, riverRibbons } from "./bridgeDeck";
import { featureGroupVertices } from "./features";
import { vertexHasCrossing } from "./passages";
import type { CityDocument, EdgeFeatureGroup, Id, Point } from "./types";
import { dryRuns, waterPolygons } from "./waterGeometry";

/** Follow the curtain through the full physical channel width to its dry bank. */
function bankArm(
  city: CityDocument,
  ring: Id[],
  index: number,
  step: number,
  closed: boolean,
  rivers: RiverRibbon[],
  physicalWater: Point[][]
): Point[] | null {
  const points = [city.mesh.vertices[ring[index]].point];
  for (let offset = 1; offset < ring.length; offset++) {
    const nextIndex = index + offset * step;
    if (!closed && (nextIndex < 0 || nextIndex >= ring.length)) break;
    const point = city.mesh.vertices[ring[(nextIndex + ring.length) % ring.length]]?.point;
    if (!point) return null;
    const dry = clipPolylineOutsideRivers([points.at(-1)!, point], rivers).flatMap(line =>
      dryRuns(line, physicalWater)
    );
    if (dry.length) return [...points, dry[0][0]];
    points.push(point);
  }
  return null;
}

/** Shared by rendering and defence validation so an invisible/unbounded grate
 * cannot be accepted merely because its centre vertex has four graph arms. */
export function riverWallPassagePath(
  city: CityDocument,
  wall: EdgeFeatureGroup,
  vertex: Id,
  rivers = riverRibbons(city)
): Point[] | null {
  if (wall.kind !== "wall" || !city.mesh.vertices[vertex] || !vertexHasCrossing(city, vertex, "wall", "river"))
    return null;
  const vertices = featureGroupVertices(city, wall);
  const closed = vertices.length > 2 && vertices[0] === vertices.at(-1);
  const ring = closed ? vertices.slice(0, -1) : vertices;
  const index = ring.indexOf(vertex);
  if (index < 0) return null;
  const physicalWater = waterPolygons(city);
  const left = bankArm(city, ring, index, -1, closed, rivers, physicalWater);
  const right = bankArm(city, ring, index, 1, closed, rivers, physicalWater);
  return left && right ? [...left.reverse(), ...right.slice(1)] : null;
}
