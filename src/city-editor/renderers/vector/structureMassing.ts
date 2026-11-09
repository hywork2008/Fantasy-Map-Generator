import { nearestOnPolyline, polygonCentroid } from "../../generators/geom";
import { evaluateAnchor, pathIsClosed } from "../../generators/vector/geometry/curves";
import { bridgeGeometry } from "../../generators/vector/geometry/network";
import { containsRegion } from "../../generators/vector/geometry/regions";
import { samplePath } from "../../generators/vector/geometry/sampling";
import { vectorWaterSurfaces } from "../../generators/vector/geometry/water";
import { vectorTerrain } from "../../generators/vector/terrain";
import type { StructureMassing, StructureMaterial } from "../../types/contracts/structureMassing";
import type { Point } from "../../types/primitives";
import type { VectorCityDocument } from "../../types/vector/document";
import { curtainTowersAlong, gateMassesAt, wallBodyHeight, wallRunsWithOpenings } from "../structureMassing";
import { resolveWallGeometry } from "../wallSvg";

/** The mesh editor's curtain tower spacing at its default 50 m street cell. */
const TOWER_SPACING_METERS = Math.max(45, 50 * 1.4);

const unit = (v: Point): Point => {
  const n = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / n, v[1] / n];
};

/**
 * Walls, gates and bridges of a meshless city as the mesh editor's structure massing, so both editors draw them
 * with the same 3D parts. Each structure carries its owner (wall path or bridge id) for picking. Gates get their
 * flanking towers and lintel only: barbicans are a later option.
 */
export function vectorStructures(
  doc: VectorCityDocument
): { owner: string; kind: "wall" | "bridge"; parts: StructureMassing[] }[] {
  const terrain = vectorTerrain(doc),
    ground = (p: Point) => (terrain.hasRelief ? terrain.heightAt(p) : 0),
    waters = vectorWaterSurfaces(doc),
    water = [...waters.values()],
    defenseWalls = new Set(Object.values(doc.environment?.defenses ?? {}).flatMap(p => p.circuit.wallPathIds)),
    hidden = new Set(doc.environment?.hidden ?? []),
    out: { owner: string; kind: "wall" | "bridge"; parts: StructureMassing[] }[] = [];
  for (const wall of Object.values(doc.paths)) {
    // Bastioned defences draw their own works.
    if (wall.role !== "wall" || defenseWalls.has(wall.id) || hidden.has(wall.id)) continue;
    const points = samplePath(wall).map(s => s.point);
    if (pathIsClosed(wall) && Math.hypot(points[0][0] - points.at(-1)![0], points[0][1] - points.at(-1)![1]) > 1e-6)
      points.push(points[0]);
    if (points.length < 2) continue;
    const widthMeters = wall.width.leftMeters + wall.width.rightMeters,
      feature = Object.values(doc.environment?.features ?? {}).find(f => f.pathIds.includes(wall.id)),
      generated =
        doc.generation?.pathRevisions[wall.id] !== undefined ? doc.generation.settings.wallMaterial : undefined,
      material: StructureMaterial =
        feature?.settings.culture === "timber" || (!feature && generated === "wood") ? "wood" : "stone",
      profile = resolveWallGeometry(widthMeters, material, undefined),
      height = wallBodyHeight(material, profile.hasWalkway),
      ring = { outer: points, holes: [] },
      inside = containsRegion([ring], doc.site?.center ?? [0, 0])
        ? (doc.site?.center ?? [0, 0])
        : polygonCentroid(points);
    const gates = Object.values(doc.connections.gates)
      .filter(g => g.wallPathId === wall.id)
      .map(g => {
        const point = evaluateAnchor(wall, g.anchor),
          tangent = unit(evaluateAnchor(wall, g.anchor, true)),
          normal: Point = [-tangent[1], tangent[0]],
          inward: Point =
            (inside[0] - point[0]) * normal[0] + (inside[1] - point[1]) * normal[1] >= 0
              ? normal
              : [-normal[0], -normal[1]];
        return { gate: g, point, tangent, inward };
      });
    // Openings are cut at a vertex, so each gate centre becomes one.
    for (const { point } of gates) {
      const hit = nearestOnPolyline(point, points);
      points.splice(hit.segIndex + 1, 0, point);
    }
    const parts: StructureMassing[] = [],
      gaps = gates.map(({ gate, point }) => ({
        index: points.findIndex(p => Math.hypot(p[0] - point[0], p[1] - point[1]) < 1e-9),
        half: gate.widthMeters / 2
      }));
    curtainTowersAlong(
      {
        wallId: wall.id,
        points,
        material,
        widthMeters,
        height,
        spacing: TOWER_SPACING_METERS,
        skip: p =>
          gates.some(g => Math.hypot(g.point[0] - p[0], g.point[1] - p[1]) < widthMeters * 3) ||
          containsRegion(water, p)
      },
      parts
    );
    for (const g of gates)
      if (g.gate.kind === "passage")
        gateMassesAt(parts, {
          gateId: g.gate.id,
          point: g.point,
          tangent: g.tangent,
          inward: g.inward,
          material,
          wallWidth: widthMeters,
          wallHeight: height,
          opening: g.gate.widthMeters
        });
    wallRunsWithOpenings(
      {
        wallId: wall.id,
        points,
        gaps,
        material,
        widthMeters,
        walkway: undefined,
        height,
        anchor: inside
      },
      parts
    );
    // Footings follow the ground: ribbons per vertex, footprints at their centre.
    for (const part of parts)
      if (part.centerline) part.baseElevationsMeters = part.centerline.map(p => ground(p) + part.baseElevationMeters);
      else if (part.footprint) part.baseElevationMeters += ground(polygonCentroid(part.footprint));
    out.push({ owner: wall.id, kind: "wall", parts });
  }
  for (const bridge of Object.values(doc.connections.bridges)) {
    if (hidden.has(bridge.roadPathId)) continue;
    const road = doc.paths[bridge.roadPathId],
      { from, to } = bridgeGeometry(doc, bridge, waters),
      level = terrain.hasRelief ? terrain.bridgeElevation(bridge.id) : 0;
    out.push({
      owner: bridge.id,
      kind: "bridge",
      parts: [
        {
          id: `bridge:${bridge.id}`,
          kind: "bridge",
          material: bridge.structure === "timber" ? "wood" : "stone",
          centerline: [from, to],
          widthMeters: road.width.leftMeters + road.width.rightMeters,
          heightMeters: 0.55,
          baseElevationMeters: level + 0.4,
          roof: "none",
          parapet: "both",
          parapetMeters: 0.9,
          parapetWidthMeters: 0.35,
          spire: false
        }
      ]
    });
  }
  return out;
}
