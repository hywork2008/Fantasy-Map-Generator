import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../../utils/fixedBurgCrossings";
import { featureGroupVertices } from "./features";
import { defaultRoadWidthMeters, townExtentMeters } from "./gen/settlementExtent";
import type { CityDocument, Point } from "./types";
import { lineHitsDocumentWater } from "./waterGeometry";

type Leg = NonNullable<CityDocument["frameRoads"]>[number];
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/** The renderer and audit use the same full-width, dry attachment to a source street. */
export function frameRoadTownConnection(document: CityDocument, leg: Leg): [Point, Point] | null {
  const target = leg.pieces[0]?.points[0];
  if (!target) return null;
  const width = defaultRoadWidthMeters(townExtentMeters(document.frame));
  const points = document.featureGroups
    .flatMap(group => {
      if (group.kind !== "road" || group.sourceRoad?.index !== leg.sourceIndex) return [];
      const path = featureGroupVertices(document, group).map(id => document.mesh.vertices[id].point);
      if (path.length < 2 || lineHitsDocumentWater(document, path, group.style.widthMeters, true)) return [];
      return path;
    })
    .sort((a, b) => distance(a, target) - distance(b, target));
  for (const point of points) {
    if (distance(point, target) > Math.max(40, document.frame.blockSizeMeters * 3)) break;
    if (!lineHitsDocumentWater(document, [point, target], width, true)) return [point, target];
  }
  return null;
}

/** Check actual continuity through dry arms and certified fixed E→E spans.
 * Merely having a far-away rendered endpoint is not a connected road. */
export function frameRoadConnectedToTown(document: CityDocument, leg: Leg): boolean {
  const connection = frameRoadTownConnection(document, leg);
  if (!connection) return false;
  const width = defaultRoadWidthMeters(townExtentMeters(document.frame));
  const fixed = document.importedFixedCrossings;
  const lines: Point[][] = [connection];
  for (const piece of leg.pieces) {
    if (!piece.points.length) continue;
    if (piece.kind === "bridge") return false; // An unregistered CE guess is not a certified crossing.
    if (piece.points.length >= 2 && lineHitsDocumentWater(document, piece.points, width, true)) return false;
    lines.push(piece.points);
  }
  if (fixed && validFixedBurgCrossings(fixed, FIXED_SITE_CROSSING_BUDGETS))
    for (const c of fixed.crossings) lines.push([c.approachA, c.deckA, c.deckB, c.approachB].map(p => [p[0], p[1]]));
  const reached: Point[] = [connection[0]];
  const pending = [...lines];
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = pending.length - 1; i >= 0; i--) {
      const line = pending[i];
      if (!line.some(p => reached.some(q => distance(p, q) < 1e-5))) continue;
      reached.push(...line);
      pending.splice(i, 1);
      changed = true;
    }
  }
  const end = leg.pieces.at(-1)?.points.at(-1);
  return !!end && reached.some(p => distance(p, end) < 1e-5);
}
