import { type RegionalContext, validRegionalContext } from "../../types/cityRegional";
import { frameRoadConnectedToTown, frameRoadTownConnection } from "./frameRoadConnection";
import { isSimplePolygon } from "./gen/geom";
import type { CityDocument, Point } from "./types";

export interface RegionConnector {
  routeId: number;
  branchId: number;
  boundaryPoint: Point;
  corePoint?: Point;
  status: "connected" | "unresolved";
}
export interface CitySceneRegions {
  version: 1;
  coreBoundary: Point[];
  regionalContext: RegionalContext;
  connectors: RegionConnector[];
}

/** First migration uses the existing fitted mesh; no editable cells are deleted. */
export function attachSceneRegions(document: CityDocument, region: RegionalContext): void {
  const points = Object.values(document.mesh.vertices).map(v => v.point);
  const minX = Math.min(...points.map(p => p[0])),
    maxX = Math.max(...points.map(p => p[0]));
  const minY = Math.min(...points.map(p => p[1])),
    maxY = Math.max(...points.map(p => p[1]));
  document.version = 4;
  document.sceneRegions = {
    version: 1,
    coreBoundary: [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY]
    ],
    regionalContext: structuredClone(region),
    connectors: (document.frameRoads ?? []).flatMap(leg => {
      const boundaryPoint = leg.pieces[0]?.points[0];
      if (!boundaryPoint) return [];
      const connection = frameRoadTownConnection(document, leg);
      const connected = connection && frameRoadConnectedToTown(document, leg);
      return [
        {
          routeId: leg.routeId,
          branchId: leg.branchIndex ?? 0,
          boundaryPoint: [...boundaryPoint] as Point,
          ...(connected ? { corePoint: [...connection[0]] as Point } : {}),
          status: connected ? ("connected" as const) : ("unresolved" as const)
        }
      ];
    })
  };
}

export function validSceneRegions(value: unknown): value is CitySceneRegions {
  if (!value || typeof value !== "object") return false;
  const r = value as CitySceneRegions;
  const point = (p: unknown) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  return (
    r.version === 1 &&
    validRegionalContext(r.regionalContext) &&
    Array.isArray(r.coreBoundary) &&
    r.coreBoundary.length >= 3 &&
    r.coreBoundary.length <= 2000 &&
    r.coreBoundary.every(point) &&
    isSimplePolygon(r.coreBoundary) &&
    Array.isArray(r.connectors) &&
    r.connectors.length <= 2000 &&
    r.connectors.every(
      c =>
        c &&
        Number.isInteger(c.routeId) &&
        Number.isInteger(c.branchId) &&
        point(c.boundaryPoint) &&
        (c.status === "unresolved" ? c.corePoint === undefined : c.status === "connected" && point(c.corePoint))
    )
  );
}

/** The existing frame-road snapshot is the regional road geometry owner. */
export function validRegionalFrameRoads(roads: CityDocument["frameRoads"]): boolean {
  if (roads === undefined) return true;
  if (!Array.isArray(roads) || roads.length > 1000) return false;
  let vertices = 0;
  return roads.every(
    leg =>
      leg &&
      Number.isInteger(leg.sourceIndex) &&
      Number.isInteger(leg.routeId) &&
      (leg.branchIndex === undefined || Number.isInteger(leg.branchIndex)) &&
      Array.isArray(leg.pieces) &&
      leg.pieces.length <= 100 &&
      leg.pieces.every(piece => {
        if (
          !piece ||
          !["road", "bridge"].includes(piece.kind) ||
          !Array.isArray(piece.points) ||
          !piece.points.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
        )
          return false;
        vertices += piece.points.length;
        return vertices <= 20000;
      })
  );
}
