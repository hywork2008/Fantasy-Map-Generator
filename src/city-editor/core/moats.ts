import { boundaryEdges } from "./fortifications";
import { nearestOnPolyline, pointInPolygon, polygonArea, segmentSegmentHit } from "./gen/geom";
import { convexInfillParts } from "./gen/lotGeometry";
import { bounds, corridor, intersectConvex, PlotIndex, subtractConvex } from "./gen/parcelGeometry";
import { facePoints } from "./mesh";
import { gateCrossingFrame, throughEdgesAt } from "./passages";
import type { CityDocument, Id, Point } from "./types";

interface MoatPart {
  polygon: Point[];
  circuitId: Id;
}
interface MoatGate {
  point: Point;
  circuitId: Id;
  polygons: Point[][];
}

/** A circumscribed capsule conservatively contains the SVG's round stroke. */
function capsule(a: Point, b: Point, radius: number): Point[] {
  const angle = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const steps = 16;
  const r = radius / Math.cos(Math.PI / (steps * 2));
  return [a, b].flatMap((p, end) =>
    Array.from({ length: steps + 1 }, (_, i): Point => {
      const t = angle + Math.PI / 2 + (end ? Math.PI : 0) + (i * Math.PI) / steps;
      return [p[0] + Math.cos(t) * r, p[1] + Math.sin(t) * r];
    })
  );
}

/** Derived geometry; rebuild for the edited document rather than caching mutable mesh references. */
export class MoatReservation {
  private index = new PlotIndex<MoatPart>();
  private gates: MoatGate[] = [];
  readonly parts: MoatPart[] = [];

  constructor(document: CityDocument, clearance = 0) {
    const claimed = new Set<Id>();
    const circuits = [...(document.defenseCircuits ?? [])].sort(
      (a, b) => Number(a.scope === "castle") - Number(b.scope === "castle")
    );
    for (const circuit of circuits) {
      if (!circuit.moat?.enabled || !Number.isFinite(circuit.moat.widthMeters) || circuit.moat.widthMeters <= 0)
        continue;
      const interior = new PlotIndex<Point[]>();
      for (const id of circuit.areaFaceIds) {
        const face = document.mesh.faces[id];
        if (!face) continue;
        for (const part of convexInfillParts(facePoints(document.mesh, face))) interior.add(part, bounds(part));
      }
      const boundary = new Set(boundaryEdges(document.mesh, circuit.areaFaceIds).map(r => r.edgeId));
      const wallEdges = new Set<Id>();
      let radius = 0;
      for (const group of document.featureGroups) {
        if (group.kind !== "wall" || !circuit.wallGroupIds.includes(group.id)) continue;
        const reach = group.style.widthMeters / 2 + circuit.moat.widthMeters + clearance;
        for (const ref of group.segments) {
          if (!boundary.has(ref.edgeId) || claimed.has(ref.edgeId)) continue;
          const edge = document.mesh.edges[ref.edgeId];
          if (!edge) continue;
          const polygon = capsule(document.mesh.vertices[edge.a].point, document.mesh.vertices[edge.b].point, reach);
          let pieces = [polygon];
          for (const cut of interior.query(bounds(polygon)))
            pieces = pieces.flatMap(p => subtractConvex(p, cut, 0.001));
          for (const piece of pieces) {
            const part = { polygon: piece, circuitId: circuit.id };
            this.parts.push(part);
            this.index.add(part, bounds(piece));
          }
          wallEdges.add(edge.id);
          claimed.add(edge.id);
          radius = Math.max(radius, reach);
        }
      }
      for (const gate of document.gates) {
        if (circuit.scope === "castle" ? gate.ownerCastleId !== circuit.ownerCastleId : !!gate.ownerCastleId) continue;
        if (
          ![...wallEdges].some(id => {
            const e = document.mesh.edges[id];
            return e.a === gate.vertexId || e.b === gate.vertexId;
          })
        )
          continue;
        const frame = gateCrossingFrame(document, gate.vertexId);
        if (!frame) continue;
        const end: Point = [
          frame.point[0] - frame.inward[0] * (radius + 3),
          frame.point[1] - frame.inward[1] * (radius + 3)
        ];
        this.gates.push({
          point: frame.point,
          circuitId: circuit.id,
          polygons: [
            corridor(frame.point, end, (gate.passageWidthMeters ?? 8) + clearance * 2, 3),
            ...throughEdgesAt(document, gate.vertexId, "wall").map(edge => {
              const other = document.mesh.vertices[edge.a === gate.vertexId ? edge.b : edge.a].point;
              return corridor(frame.point, other, (gate.passageWidthMeters ?? 8) + clearance * 2, 3);
            })
          ]
        });
      }
    }
  }

  hitsPolygon(polygon: Point[]): boolean {
    if (polygon.length < 3 || !this.parts.length) return false;
    const nearby = this.index.query(bounds(polygon));
    return convexInfillParts(polygon).some(p =>
      nearby.some(part => Math.abs(polygonArea(intersectConvex(p, part.polygon))) > 0.001)
    );
  }

  private contains(point: Point): MoatPart[] {
    return this.index
      .query([point[0] - 0.001, point[1] - 0.001, point[0] + 0.001, point[1] + 0.001])
      .filter(part => pointInPolygon(point, part.polygon));
  }

  /** Gate-connected road spans are the only permitted bridges. */
  roadAllowed(a: Point, b: Point): boolean {
    return this.split([a, b]).wet.every(run => this.isBridge(run, [a, b]));
  }

  private isBridge(run: Point[], road: Point[]): boolean {
    const parts = [
      ...new Set(run.slice(1).flatMap((p, i) => this.contains([(run[i][0] + p[0]) / 2, (run[i][1] + p[1]) / 2])))
    ];
    return parts.every(part =>
      this.gates.some(
        g =>
          g.circuitId === part.circuitId &&
          run.every(
            p =>
              g.polygons.some(polygon => pointInPolygon(p, polygon)) ||
              (nearestOnPolyline(g.point, road).dist < 0.01 && nearestOnPolyline(g.point, run).dist < 0.01)
          )
      )
    );
  }

  /** Split at all banks, retaining dry runs and actual road-aligned bridge decks. */
  roadParts(points: Point[]): { dry: Point[][]; bridges: Point[][] } {
    const { dry, wet } = this.split(points);
    return { dry, bridges: wet.filter(run => this.isBridge(run, points)) };
  }

  dryRuns(points: Point[]): Point[][] {
    return this.split(points).dry;
  }

  hitsPoint(point: Point): boolean {
    return this.contains(point).length > 0;
  }

  private split(points: Point[]): { dry: Point[][]; wet: Point[][] } {
    const dry: Point[][] = [],
      wet: Point[][] = [];
    let current: Point[] = [];
    let currentWet = false;
    const flush = () => {
      if (current.length > 1) (currentWet ? wet : dry).push(current);
      current = [];
    };
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      const nearby = this.index.query(
        bounds([a, b]).map((v, j) => v + (j < 2 ? -0.001 : 0.001)) as [number, number, number, number]
      );
      const cuts = [0, 1];
      for (const part of nearby)
        for (let j = 0; j < part.polygon.length; j++) {
          const hit = segmentSegmentHit(a, b, part.polygon[j], part.polygon[(j + 1) % part.polygon.length]);
          if (hit) cuts.push(hit.t);
        }
      const sorted = [...new Set(cuts)].sort((x, y) => x - y);
      const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      for (let j = 1; j < sorted.length; j++) {
        if (sorted[j] - sorted[j - 1] < 1e-8) continue;
        const inside = nearby.some(part => pointInPolygon(at((sorted[j - 1] + sorted[j]) / 2), part.polygon));
        if (inside !== currentWet) flush();
        currentWet = inside;
        if (!current.length) current.push(at(sorted[j - 1]));
        current.push(at(sorted[j]));
      }
    }
    flush();
    return { dry, wet };
  }
}
