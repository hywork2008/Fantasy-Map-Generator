import { KRAK, type KrakPhase } from "../../buildings/fortresses/krak";
import type { CastlePlan, CityDocument, Point } from "../types/document";
import { circuitRing } from "./fortifications";
import { pointInPolygon, polygonCentroid } from "./geom";
import { insetConvexKernel } from "./lotGeometry";

export interface FortressPlacement {
  origin: Point;
  rotation: number;
  scale: number;
  outer: Point[];
  gates: Array<{ point: Point; widthMeters: number }>;
}

export function fortressPoint(
  point: Point,
  placement: Pick<FortressPlacement, "origin" | "rotation" | "scale">
): Point {
  const c = Math.cos(placement.rotation),
    s = Math.sin(placement.rotation);
  return [
    placement.origin[0] + placement.scale * (point[0] * c - point[1] * s),
    placement.origin[1] + placement.scale * (point[0] * s + point[1] * c)
  ];
}

/** Fixed inner proportions, with its entrance facing the existing circuit gate. */
export function fortressPlacement(document: CityDocument, castle: CastlePlan): FortressPlacement | null {
  const circuit = document.defenseCircuits?.find(item => item.id === castle.circuitId);
  if (!circuit || circuit.state === "razed") return null;
  const outer = circuitRing(document, circuit);
  if (outer.length < 3) return null;
  const kernel = insetConvexKernel(
    outer,
    outer.map(() => 12)
  );
  if (kernel.length < 3) return null;
  const origin = polygonCentroid(kernel);
  const gates = (document.gates ?? [])
    .filter(gate => gate.ownerCastleId === castle.id || castle.accesses.some(access => access.gateId === gate.id))
    .flatMap(gate => {
      const point = document.mesh.vertices[gate.vertexId]?.point;
      return point ? [{ point, widthMeters: Math.max(4, gate.passageWidthMeters ?? 5) }] : [];
    });
  // A manually drawn circuit can have a gate without owner metadata.
  if (!gates.length)
    for (const gate of document.gates ?? []) {
      const point = document.mesh.vertices[gate.vertexId]?.point;
      if (point && outer.some(vertex => Math.hypot(vertex[0] - point[0], vertex[1] - point[1]) < 0.1))
        gates.push({ point, widthMeters: Math.max(4, gate.passageWidthMeters ?? 5) });
    }
  const entrance = gates[0]?.point ?? outer.reduce((best, point) => (point[0] > best[0] ? point : best), outer[0]);
  const rotation = Math.atan2(entrance[1] - origin[1], entrance[0] - origin[0]);
  const fits = (scale: number) =>
    KRAK.talusBottom.every(point => pointInPolygon(fortressPoint(point, { origin, rotation, scale }), kernel));
  if (!fits(0.75)) return null;
  let low = 0.75,
    high = 1.35;
  for (let i = 0; i < 32; i++) {
    const mid = (low + high) / 2;
    if (fits(mid)) low = mid;
    else high = mid;
  }
  return { origin, rotation, scale: Math.min(1, low), outer, gates };
}

/** Saved as a model and phase only; derived parts track subsequent mesh/elevation edits. */
export function setCastleFortress(
  document: CityDocument,
  castleId: string,
  phase: KrakPhase | null
): CityDocument | null {
  const castle = document.castles?.find(item => item.id === castleId);
  if (!castle || castle.locked) return null;
  if (phase && !fortressPlacement(document, castle)) return null;
  const next = structuredClone(document);
  const target = next.castles!.find(item => item.id === castleId)!;
  if (phase) target.fortress = { modelId: "krak-des-chevaliers", phase };
  else delete target.fortress;
  return next;
}

export function modularCastleForWall(document: CityDocument, wallId: string): CastlePlan | undefined {
  return document.castles?.find(
    castle =>
      castle.fortress &&
      document.defenseCircuits?.some(
        circuit => circuit.id === castle.circuitId && circuit.wallGroupIds.includes(wallId)
      )
  );
}
