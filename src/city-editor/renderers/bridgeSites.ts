import {
  BRIDGE_SKEW_MAX_DEGREES,
  type BridgeStructure,
  bridgeSkewDegrees,
  bridgeStructureForRouteGroup,
  resolveBridgeSkewLimit,
  withinBridgeSkewLimit
} from "../../utils/bridgeSkewPolicy";
import { bridgeDecks, riverRibbons } from "../generators/bridgeDeck";
import { nearestOnPolyline, segmentSegmentHit } from "../generators/geom";
import { defaultRoadWidthMeters, townExtentMeters } from "../generators/settlementExtent";
import type { BurgSiteRiver } from "../types/contracts/burgSiteDescriptor";
import type { CityDocument, Point } from "../types/document";
import { fixedDocumentGeometry } from "./fixedDocumentGeometry";

export interface BridgeSite {
  id: string;
  name: string;
  points: [Point, Point];
  widthMeters: number;
  material: BridgeStructure;
  skewDegrees: number;
  depthMeters?: number | null;
  openingMeters: number;
  /** Coarse structure replaced by this bridge, if one exists. */
  structureId?: string;
  /** Dry bank reference points supplied by the fixed FMG contract. */
  banks?: [Point, Point];
  approaches?: [Point[], Point[]];
}
const span = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function sameDeck(a: readonly Point[], b: readonly (readonly number[])[], tolerance = 3) {
  return (
    (span(a[0], b[0]) < tolerance && span(a.at(-1)!, b.at(-1)!) < tolerance) ||
    (span(a[0], b.at(-1)!) < tolerance && span(a.at(-1)!, b[0]) < tolerance)
  );
}
function straight(points: readonly Point[]): points is Point[] {
  if (points.length < 2 || points.some(p => !p.every(Number.isFinite))) return false;
  const a = points[0],
    b = points.at(-1)!,
    length = span(a, b);
  if (length < 2) return false;
  return points.every(p => {
    const cross = Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / length;
    const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (length * length);
    return cross < 0.05 && t >= -1e-6 && t <= 1 + 1e-6;
  });
}

/** Three FMG/CE representations describe the same bridge. Fixed surveyed decks take precedence. */
export function collectBridgeSites(document: CityDocument): BridgeSite[] {
  const descriptor = document.fabric?.generation?.settings.descriptor;
  const rivers = descriptor?.rivers ?? [];
  const roads = descriptor?.roads ?? [];
  const baseWidth = defaultRoadWidthMeters(townExtentMeters(document.frame));
  const fixed = fixedDocumentGeometry(document);
  const result: BridgeSite[] = [];
  const routeMaterial = (sourceIndex?: number, routeId?: number, fallback?: string) => {
    const road = sourceIndex === undefined ? undefined : roads[sourceIndex];
    return bridgeStructureForRouteGroup(road && (!routeId || road.routeId === routeId) ? road.group : fallback);
  };
  const allowed = (site: BridgeSite) =>
    withinBridgeSkewLimit(
      site.skewDegrees,
      Math.min(
        BRIDGE_SKEW_MAX_DEGREES,
        resolveBridgeSkewLimit(
          document.historicalPeriod,
          { maxBridgeSkewDegrees: document.maxBridgeSkewDegrees },
          site.material
        )
      )
    );
  const add = (site: BridgeSite) => {
    if (!straight(site.points) || !Number.isFinite(site.widthMeters) || site.widthMeters < 1 || !allowed(site)) return;
    const previous = result.find(other => sameDeck(other.points, site.points));
    if (previous) {
      previous.structureId ??= site.structureId;
      previous.approaches ??= site.approaches;
      return;
    }
    result.push(site);
  };
  for (const crossing of fixed?.crossings ?? []) {
    const points: [Point, Point] = [[...crossing.deckA], [...crossing.deckB]];
    const leg = document.frameRoads?.find(leg =>
      leg.pieces.some(p => p.kind === "bridge" && sameDeck(p.points, points, 25))
    );
    const sourceIndex = leg?.sourceIndex ?? roads.findIndex(road => road.sharedCrossingId === crossing.id);
    const river = rivers.find(r => r.riverId === crossing.riverId);
    add({
      id: `fixed-bridge:${crossing.id}`,
      name: `Bridge ${crossing.id}`,
      points,
      widthMeters: fixed!.roadWidthMeters,
      material: routeMaterial(sourceIndex >= 0 ? sourceIndex : undefined, leg?.routeId, "roads"),
      skewDegrees: bridgeSkewDegrees([points[1][0] - points[0][0], points[1][1] - points[0][1]], crossing.tangent),
      depthMeters: river?.depthMeters,
      openingMeters: crossing.kind === "movableBridge" ? (river?.crossing?.openingMeters ?? 8) : 0,
      banks: [[...crossing.approachA], [...crossing.approachB]],
      approaches: [
        [[...crossing.approachA], [...crossing.deckA]],
        [[...crossing.approachB], [...crossing.deckB]]
      ]
    });
  }
  const riverAt = (points: Point[]): { tangent: Point; river?: BurgSiteRiver; skewDegrees?: number } | null => {
    const a = points[0],
      b = points.at(-1)!,
      mid: Point = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const courses = [
      ...rivers.flatMap(river => river.segments.map(segment => ({ points: segment.points, river }))),
      ...riverRibbons(document).map(ribbon => ({ points: ribbon.points, river: undefined }))
    ];
    const hits: Array<{ tangent: Point; river?: BurgSiteRiver }> = [];
    let nearest: { tangent: Point; river?: BurgSiteRiver; distance: number } | undefined;
    for (const course of courses)
      for (let i = 1; i < course.points.length; i++) {
        const p = course.points[i - 1],
          q = course.points[i];
        const tangent: Point = [q[0] - p[0], q[1] - p[1]];
        if (Math.hypot(...tangent) < 1e-6) continue;
        if (segmentSegmentHit(a, b, p, q)) hits.push({ tangent, river: course.river });
        const distance = nearestOnPolyline(mid, [p, q]).dist;
        if (distance < (nearest?.distance ?? Infinity)) nearest = { tangent, river: course.river, distance };
      }
    if (hits.length)
      return {
        ...hits[0],
        skewDegrees: Math.max(...hits.map(hit => bridgeSkewDegrees([b[0] - a[0], b[1] - a[1]], hit.tangent)))
      };
    return nearest && nearest.distance <= Math.max(30, (nearest.river?.widthMeters ?? 0) * 0.75) ? nearest : null;
  };
  const addImported = (
    id: string,
    points: Point[],
    sourceIndex: number,
    routeId: number | undefined,
    movable: boolean | undefined,
    approaches?: [Point[], Point[]]
  ) => {
    if (!straight(points)) return;
    // A rejected surveyed crossing must not reappear through an overlapping frame reference.
    if (!fixed && document.importedFixedCrossings?.crossings.some(c => sameDeck(points, [c.deckA, c.deckB], 25)))
      return;
    const match = riverAt(points);
    if (!match) return;
    add({
      id,
      name: roads[sourceIndex]?.name ?? `Bridge ${routeId ?? sourceIndex}`,
      points: [points[0], points.at(-1)!],
      widthMeters: baseWidth,
      material: routeMaterial(sourceIndex, routeId),
      skewDegrees:
        match.skewDegrees ??
        bridgeSkewDegrees([points.at(-1)![0] - points[0][0], points.at(-1)![1] - points[0][1]], match.tangent),
      depthMeters: match.river?.depthMeters,
      openingMeters:
        (movable ?? match.river?.crossing?.kind === "movableBridge") ? (match.river?.crossing?.openingMeters ?? 8) : 0,
      approaches
    });
  };
  for (const leg of document.frameRoads ?? [])
    for (const [i, piece] of leg.pieces.entries())
      if (piece.kind === "bridge")
        addImported(
          `frame-bridge:${leg.routeId}:${leg.branchIndex ?? 0}:${i}`,
          piece.points,
          leg.sourceIndex,
          leg.routeId,
          piece.bridgeKind === undefined ? undefined : piece.bridgeKind === "movableBridge",
          [
            leg.pieces[i - 1]?.kind === "road" ? leg.pieces[i - 1].points : [],
            leg.pieces[i + 1]?.kind === "road" ? leg.pieces[i + 1].points : []
          ]
        );
  for (const [i, connection] of (document.riverConnections ?? []).entries())
    if (["fixedBridge", "movableBridge"].includes(connection.crossing.kind))
      addImported(
        `river-bridge:${i}`,
        connection.banks,
        connection.sourceIndex,
        roads[connection.sourceIndex]?.routeId,
        connection.crossing.kind === "movableBridge",
        [connection.townRoad, connection.farRoad]
      );
  for (const deck of bridgeDecks(document)) {
    const group = document.featureGroups.find(g => g.id === deck.groupId);
    add({
      id: `bridge:${deck.groupId}`,
      structureId: `bridge:${deck.groupId}`,
      name: deck.name,
      points: deck.points,
      widthMeters: deck.widthMeters,
      material: routeMaterial(
        group?.kind === "road" ? group.sourceRoad?.index : undefined,
        group?.kind === "road" ? group.sourceRoad?.routeId : undefined
      ),
      skewDegrees: deck.skewDegrees,
      openingMeters: 0
    });
  }
  return result;
}
