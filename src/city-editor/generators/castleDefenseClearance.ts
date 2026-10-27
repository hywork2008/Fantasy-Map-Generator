import type { CityDocument, Point } from "../types/document";
import { buildFortressPlan, createCirclePolygon } from "./castleLayoutBuilder";
import { resolveCastleStyle } from "./castlePatterns";
import { type GlacisBand, gapBelow, requiredClearance } from "./defenseClearance";
import { circuitRing, polygonOverlaps } from "./fortifications";
import { modularCastleForWall } from "./fortressPlacement";
import { pointInPolygon } from "./geom";

interface CastleDefense {
  precinct: Point[];
  walls: Array<{ line: Point[]; halfWidth: number }>;
  footprints: Point[][];
}

/** Derived once per building pass, using the same castle shapes as both renderers. */
export class CastleDefenseClearance {
  private defenses: CastleDefense[] = [];

  constructor(
    document: CityDocument,
    private bands: readonly GlacisBand[] = []
  ) {
    for (const circuit of document.defenseCircuits ?? []) {
      if (circuit.scope !== "castle" || circuit.state === "razed") continue;
      const castle = document.castles?.find(item => item.circuitId === circuit.id);
      const precinct = circuitRing(document, circuit);
      if (precinct.length < 3) continue;
      const walls: CastleDefense["walls"] = [];
      const footprints: Point[][] = [];
      const groups = document.featureGroups.filter(
        group => group.kind === "wall" && circuit.wallGroupIds.includes(group.id)
      );
      for (const group of groups) {
        if (group.kind !== "wall") continue;
        for (const ref of group.segments) {
          const edge = document.mesh.edges[ref.edgeId];
          const a = edge && document.mesh.vertices[edge.a]?.point;
          const b = edge && document.mesh.vertices[edge.b]?.point;
          if (a && b) walls.push({ line: [a, b], halfWidth: group.style.widthMeters / 2 });
        }
      }
      // Modular fortresses own a separate assembly; their ordinary castle style is hidden.
      const modular = groups.some(group => modularCastleForWall(document, group.id));
      if (castle && !modular && document.fortSite?.castleId !== castle.id) {
        const profile = resolveCastleStyle(document, castle);
        if (profile.style !== "classic") {
          const plan = buildFortressPlan(document, castle, profile);
          for (const rampart of plan.ramparts) {
            if (!["outer_wall", "inner_wall", "palisade"].includes(rampart.kind) || rampart.polygon.length < 3)
              continue;
            walls.push({
              line: [...rampart.polygon, rampart.polygon[0]],
              halfWidth: (rampart.strokeWidth ?? plan.wallWidthMeters ?? 4.2) / 2
            });
          }
          for (const tower of plan.towers) {
            const polygon = tower.polygon ?? createCirclePolygon(tower.point, tower.radius ?? 0);
            if (polygon.length >= 3) footprints.push(polygon);
          }
          for (const gate of plan.defensiveGates)
            if (gate.polygon && gate.polygon.length >= 3) footprints.push(gate.polygon);
        }
      }
      if (walls.length || footprints.length) this.defenses.push({ precinct, walls, footprints });
    }
  }

  clears(polygon: Point[]): boolean {
    if (polygon.length < 3) return true;
    return this.defenses.every(defense => {
      // Barracks inside the precinct need physical separation, not an exterior glacis.
      const inside = polygon.every(point => pointInPolygon(point, defense.precinct));
      const clearance = inside ? 0 : requiredClearance(polygon, this.bands);
      if (defense.walls.some(wall => gapBelow(polygon, [wall.line], wall.halfWidth + clearance))) return false;
      return defense.footprints.every(
        footprint =>
          !polygonOverlaps(polygon, footprint) && !gapBelow(polygon, [[...footprint, footprint[0]]], clearance)
      );
    });
  }
}
