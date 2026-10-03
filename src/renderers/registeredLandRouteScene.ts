import type { LandConnectionSnapshot } from "../generators/landConnectionAdoption";
import { exportRegisteredLandRouteSections } from "../generators/registeredLandRouteSections";
import type { CorridorPiece } from "../services/approachCorridorGeometry";
import { corridorDelta, corridorUnit, sameCorridorDirection } from "../services/approachCorridorGeometry";
import type { RiverPoint } from "../services/riverGeometry";
import { validWaterPolygon } from "../services/riverPhysicalGeometry";

export interface RegisteredRouteSceneSettings {
  /** Uniform physical conversion only; never stretch or rotate a bridge. */
  metresPerUnit: number;
  originMeters: RiverPoint;
  maxChordErrorMeters: number;
  maxArcSections: number;
  maxPieces: number;
  maxPaths: number;
  maxPolygons: number;
}
export interface RegisteredRouteScenePath {
  id: number;
  part: number;
  svgPath: string;
  polygons: readonly (readonly RiverPoint[])[];
}
export interface RegisteredLandRouteScene {
  revision: number;
  roadWidth: number;
  roads: readonly RegisteredRouteScenePath[];
  bridges: readonly RegisteredRouteScenePath[];
}
type Current = Parameters<typeof exportRegisteredLandRouteSections>[1];
function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
/** Builds exact SVG centerlines and full-width WebGL polygons from the SAME
 * currently validated adopted sections. Mesh approximation is independently
 * checked over its occupied area. Failure returns no partial scene. */
export function buildRegisteredLandRouteScene(
  snapshot: LandConnectionSnapshot,
  current: Current,
  settings: RegisteredRouteSceneSettings
): { scene: RegisteredLandRouteScene } | { reason: string } {
  if (
    ![settings.metresPerUnit, settings.maxChordErrorMeters].every(v => Number.isFinite(v) && v > 0) ||
    ![settings.maxArcSections, settings.maxPieces, settings.maxPaths, settings.maxPolygons].every(
      v => Number.isSafeInteger(v) && v > 0
    ) ||
    settings.originMeters.length !== 2 ||
    !settings.originMeters.every(Number.isFinite)
  )
    return { reason: "invalid-input" };
  const exported = exportRegisteredLandRouteSections(snapshot, current);
  if (!("sections" in exported)) return exported;
  const source = exported.sections,
    half = source.roadWidthMeters / 2;
  const project = (p: RiverPoint): RiverPoint => [
    (p[0] - settings.originMeters[0]) / settings.metresPerUnit,
    (p[1] - settings.originMeters[1]) / settings.metresPerUnit
  ];
  const width = source.roadWidthMeters / settings.metresPerUnit;
  if (!Number.isFinite(width) || width <= 0) return { reason: "invalid-projection" };
  let pieces = 0,
    polygons = 0,
    failure: string | undefined;
  const roads: RegisteredRouteScenePath[] = [],
    bridges: RegisteredRouteScenePath[] = [];
  const at = (p: RiverPoint) => `${p[0]},${p[1]}`;
  const polygon = (points: RiverPoint[], bridge: boolean): RiverPoint[] | null => {
    if (++polygons > settings.maxPolygons) {
      failure = "polygon-budget";
      return null;
    }
    if (!validWaterPolygon({ id: 0, rings: [points] })) {
      failure = "invalid-mesh";
      return null;
    }
    if (
      !bridge &&
      (current.environment.water.touchesWater(points) || !current.environment.supportsDryFootprint(points))
    ) {
      failure = "blocked-mesh";
      return null;
    }
    const transformed = points.map(project);
    if (!validWaterPolygon({ id: 0, rings: [transformed] })) {
      failure = "invalid-projection";
      return null;
    }
    return transformed;
  };
  const path = (
    id: number,
    part: number,
    segments: readonly CorridorPiece[],
    bridge: boolean
  ): RegisteredRouteScenePath | null => {
    if (roads.length + bridges.length >= settings.maxPaths) {
      failure = "path-budget";
      return null;
    }
    const mesh: RiverPoint[][] = [];
    let svg = "";
    for (const p of segments) {
      if (++pieces > settings.maxPieces) {
        failure = "piece-budget";
        return null;
      }
      const start = project(p.start),
        end = project(p.end);
      if (![...start, ...end].every(Number.isFinite)) {
        failure = "invalid-projection";
        return null;
      }
      if (!svg) svg = `M${at(start)}`;
      if (p.kind === "line") {
        const axis = corridorUnit(corridorDelta(p.end, p.start));
        if (!axis) {
          failure = "invalid-piece";
          return null;
        }
        const normal: RiverPoint = [-axis[1] * half, axis[0] * half];
        const poly = polygon(
          [
            [p.start[0] + normal[0], p.start[1] + normal[1]],
            [p.end[0] + normal[0], p.end[1] + normal[1]],
            [p.end[0] - normal[0], p.end[1] - normal[1]],
            [p.start[0] - normal[0], p.start[1] - normal[1]]
          ],
          bridge
        );
        if (!poly) return null;
        mesh.push(poly);
        svg += `L${at(end)}`;
      } else {
        if (bridge) {
          failure = "curved-bridge";
          return null;
        }
        const outer = p.radiusMeters + half,
          inner = p.radiusMeters - half;
        const angle = Math.min(Math.PI / 4, 2 * Math.acos(Math.max(-1, 1 - settings.maxChordErrorMeters / outer)));
        const count = Math.ceil(Math.abs(p.sweep) / angle);
        if (inner <= 0 || !Number.isFinite(count) || count < 1 || count > settings.maxArcSections) {
          failure = "arc-budget";
          return null;
        }
        const point = (r: number, a: number): RiverPoint => [
          p.center[0] + r * Math.cos(a),
          p.center[1] + r * Math.sin(a)
        ];
        for (let i = 0; i < count; i++) {
          const a = p.startAngle + (p.sweep * i) / count,
            b = p.startAngle + (p.sweep * (i + 1)) / count;
          const poly = polygon([point(inner, a), point(outer, a), point(outer, b), point(inner, b)], false);
          if (!poly) return null;
          mesh.push(poly);
        }
        const radius = p.radiusMeters / settings.metresPerUnit;
        if (!Number.isFinite(radius) || radius <= 0) {
          failure = "invalid-projection";
          return null;
        }
        svg += `A${radius},${radius} 0 ${Math.abs(p.sweep) > Math.PI ? 1 : 0},${p.sweep > 0 ? 1 : 0} ${at(end)}`;
      }
    }
    return { id, part, svgPath: svg, polygons: mesh };
  };
  for (const connection of source.connections) {
    let run: CorridorPiece[] = [],
      part = 0;
    const flush = () => {
      if (!run.length) return true;
      const road = path(connection.id, part++, run, false);
      run = [];
      if (!road) return false;
      roads.push(road);
      return true;
    };
    for (const section of connection.sections) {
      if (section.kind === "bridge") {
        if (!flush()) return { reason: failure! };
      } else run.push(...section.pieces);
    }
    if (!flush()) return { reason: failure! };
  }
  for (const crossing of source.crossings) {
    const transformed = corridorUnit(corridorDelta(project(crossing.deckB), project(crossing.deckA)));
    if (!transformed || !sameCorridorDirection(transformed, crossing.nCrossing))
      return { reason: "invalid-projection" };
    if (!current.environment.allowsBridgeFootprint) return { reason: "missing-passage-policy" };
    const bridge = path(
      crossing.id,
      0,
      [
        {
          kind: "line",
          start: crossing.deckA,
          end: crossing.deckB,
          lengthMeters: Math.hypot(...corridorDelta(crossing.deckB, crossing.deckA))
        }
      ],
      true
    );
    if (!bridge) return { reason: failure! };
    bridges.push(bridge);
  }
  const scene = freeze({ revision: source.revision, roadWidth: width, roads, bridges });
  return { scene };
}
