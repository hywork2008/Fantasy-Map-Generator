import { harborCraneFoundationFootprint } from "../../buildings/medieval/harborCraneDimensions";
import type { CityDocument, Point } from "../types/document";
import type { DistrictFabric } from "./blockInfill";
import { nearestOnPolyline } from "./geom";
import { activeCargoAssignment } from "./harborCargo";
import { corridor } from "./parcelGeometry";

export interface HarborMarketReservations {
  areas: Point[][];
  cargoAccessPaths: Point[][];
}

/** A market cannot consume idle cargo space or pass customers beneath a moving load. */
export function marketHarborReservations(document: CityDocument, fabric: DistrictFabric): HarborMarketReservations {
  const areas: Point[][] = [];
  const cargoAccessPaths: Point[][] = [];
  const harbor = fabric.harbor;
  if (!harbor) return { areas, cargoAccessPaths };
  const line = (points: Point[], width = 4) => {
    if (points.length < 2) return;
    cargoAccessPaths.push(points);
    for (let i = 1; i < points.length; i++) areas.push(corridor(points[i - 1], points[i], Math.max(4, width), 2));
  };
  for (const space of harbor.spaces) areas.push(space.polygon);
  for (const frontage of harbor.frontages) line([frontage.a, frontage.b], frontage.widthMeters);
  for (const parcel of fabric.parcels ?? []) {
    for (const access of parcel.access) if (access.kind === "cargo") line(access.points, access.widthMeters);
    for (const space of parcel.openSpaces) if (space.access === "private") areas.push(space.polygon);
  }
  for (const space of fabric.openSpaces ?? []) if (space.access === "private") areas.push(space.polygon);
  for (const farm of fabric.farms) areas.push(farm.polygon);
  for (const park of fabric.parks ?? []) areas.push(...park.lawnPolygons);
  for (const crane of harbor.cranes) {
    areas.push(harborCraneFoundationFootprint(crane.point, crane.armAngleRad, 1));
    areas.push(circle(crane.point, Math.max(crane.radiusMeters, crane.armLengthMeters) + 1.5));
  }
  for (const quay of harbor.cargoQuays ?? []) {
    areas.push(quay.reservedWater, circle(quay.axis, quay.reach + 1.5), circle(quay.landDrop, 2));
    line([quay.a, quay.b], 8);
  }
  for (const pile of harbor.cargoPiles) areas.push(circle(pile.point, pile.widthMeters * Math.SQRT1_2 + 1));
  for (const pier of harbor.piers) {
    areas.push(pier.polygon);
    if (!pier.start || !pier.end) continue;
    const dx = pier.start[0] - pier.end[0],
      dy = pier.start[1] - pier.end[1];
    const length = Math.hypot(dx, dy);
    if (length > 0)
      line([pier.start, [pier.start[0] + (dx / length) * 8, pier.start[1] + (dy / length) * 8]], pier.width ?? 4);
  }
  for (const warehouse of fabric.aerialLandmarks?.quayWarehouses ?? []) {
    areas.push(warehouse.footprint);
    if (warehouse.cut) areas.push(warehouse.cut);
    // Door coordinates are not stored. Keep every frontage and its shortest approach clear.
    for (let i = 0; i < warehouse.footprint.length; i++) {
      const a = warehouse.footprint[i],
        b = warehouse.footprint[(i + 1) % warehouse.footprint.length];
      line([a, b], 4);
    }
    const pairs = harbor.frontages
      .flatMap(frontage =>
        warehouse.footprint.map(point => {
          const hit = nearestOnPolyline(point, [frontage.a, frontage.b]);
          return { point, target: hit.point, distance: hit.dist };
        })
      )
      .sort((a, b) => a.distance - b.distance);
    if (pairs[0] && pairs[0].distance <= 80) line([pairs[0].point, pairs[0].target]);
  }
  for (const ship of document.elements) {
    const assignment = activeCargoAssignment(ship);
    if (assignment) line([assignment.hook, assignment.landDrop]);
  }
  return { areas: areas.filter(area => area.length >= 3), cargoAccessPaths };
}

function circle(center: Point, radius: number): Point[] {
  const count = 24;
  const r = radius / Math.cos(Math.PI / count);
  return Array.from(
    { length: count },
    (_, i): Point => [
      center[0] + Math.cos((i * Math.PI * 2) / count) * r,
      center[1] + Math.sin((i * Math.PI * 2) / count) * r
    ]
  );
}
