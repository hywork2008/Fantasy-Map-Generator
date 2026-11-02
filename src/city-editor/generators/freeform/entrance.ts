import { type BvFrontAxis, type FootprintBox, frontAxisOf, planAxes } from "../../../buildings/placementContract";
import { placementFootprint } from "../../../buildings/placementModels";
import type { CityDocument, CityElement, Point } from "../../types/document";
import type { FreeformWay } from "../../types/terrain";
import { nearestOnPolyline, polylineLength } from "../geom";
import { cityTerrain } from "../terrainElevation";
import { commitWay } from "./commitWay";
import { WAY_RISER_METERS, WAY_TREAD_METERS } from "./steppedWay";
import { previewWay, type WayPreview, type WayReject } from "./validateWay";

const CONNECTOR_WIDTH_METERS = 2;

/** Middle of the front edge. The footprint centre sits on `position`. */
export function buildingFrontPoint(
  position: Point,
  rotationY: number,
  footprint: Pick<FootprintBox, "halfX" | "halfZ">,
  front: BvFrontAxis
): Point {
  const axes = planAxes(rotationY);
  const forward = frontDirection(front, axes.axisX, axes.axisZ);
  const reach = front === "+x" || front === "-x" ? footprint.halfX : footprint.halfZ;
  return [position[0] + forward[0] * reach, position[1] + forward[1] * reach];
}

export function connectEntrance(
  document: CityDocument,
  elementId: string
): { document: CityDocument; preview: WayPreview } | { error: "missing" | "footprint" | "way" | WayReject } {
  const element = document.elements.find(item => item.id === elementId);
  if (!element?.point || !element.objectType) return { error: "missing" };
  const footprint = placementFootprint(element.objectType);
  if (!footprint) return { error: "footprint" };
  const ways = document.terrain?.ways ?? [];
  if (!ways.length) return { error: "way" };
  const front = frontAxisOf(element.objectType);
  const entrance = buildingFrontPoint(element.point, element.rotation ?? 0, footprint, front);
  const nearest = nearestWayPoint(entrance, ways);
  if (!nearest || nearest.dist < 0.4) return { error: "grade" };
  const forward = frontDirection(front, ...axisPair(element));
  const terrain = cityTerrain(document);
  const heightAt = (point: Point) => terrain.heightAt(point) + terrain.datumMeters;
  const rise = Math.abs(heightAt(nearest.point) - heightAt(entrance));
  const needed = Math.max(6, Math.round(rise / WAY_RISER_METERS) * WAY_TREAD_METERS + 6);
  let last: WayPreview | null = null;
  for (const centerline of connectorLines(entrance, forward, nearest.point, needed)) {
    if (polylineLength(centerline) < 3) continue;
    const preview = previewWay(document, {
      id: "preview",
      centerline,
      widthMeters: CONNECTOR_WIDTH_METERS,
      profile: "stepped",
      surface: "dirt"
    });
    last = preview;
    if (!preview.ok) continue;
    return commitWay(document, {
      id: `way-${crypto.randomUUID()}`,
      centerline,
      widthMeters: CONNECTOR_WIDTH_METERS,
      profile: "stepped",
      surface: "dirt"
    });
  }
  return { error: last?.reason ?? "grade" };
}

function axisPair(element: CityElement): [Point, Point] {
  return [planAxes(element.rotation ?? 0).axisX, planAxes(element.rotation ?? 0).axisZ];
}

function frontDirection(front: BvFrontAxis, axisX: Point, axisZ: Point): Point {
  switch (front) {
    case "+z":
      return axisZ;
    case "-z":
      return [-axisZ[0], -axisZ[1]];
    case "+x":
      return axisX;
    case "-x":
      return [-axisX[0], -axisX[1]];
  }
}

function nearestWayPoint(point: Point, ways: readonly FreeformWay[]): { point: Point; dist: number } | null {
  let best: { point: Point; dist: number } | null = null;
  for (const way of ways) {
    if (way.centerline.length < 2) continue;
    const hit = nearestOnPolyline(point, way.centerline);
    if (!best || hit.dist < best.dist) best = { point: hit.point, dist: hit.dist };
  }
  return best;
}

function connectorLines(entrance: Point, forward: Point, target: Point, needed: number): Point[][] {
  const out: Point = [entrance[0] + forward[0] * 2, entrance[1] + forward[1] * 2];
  const side: Point = [-forward[1], forward[0]];
  const reach = Math.max(0, needed - Math.hypot(target[0] - entrance[0], target[1] - entrance[1]));
  return [
    [entrance, target],
    [entrance, out, target],
    [
      entrance,
      [out[0] + side[0] * reach, out[1] + side[1] * reach],
      [target[0] + side[0] * reach, target[1] + side[1] * reach],
      target
    ]
  ];
}
