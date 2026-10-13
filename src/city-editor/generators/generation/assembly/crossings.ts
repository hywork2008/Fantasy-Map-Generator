import { addInnerTownWall, INNER_WALL_FAILURES } from "../../../core/gen/innerTownWall";
import { DEFAULT_INNER_WALLED_AREA_SHARE } from "../../../core/gen/settlementExtent";
import { addBridge, addWideRiverBridge, openBarrierPassage } from "../../../core/passages";
import type { CityDocument, Id } from "../../../core/types";
import { GEN_PREFIX, INNER_WALL_MIN_GAP_CELLS } from "../constants";
import type { Plan } from "../contracts";
import type { AssemblyCheckpoint, AssemblyMark } from "./contracts";

export interface ApplyCrossingsInput {
  next: CityDocument;
  plan: Pick<Plan, "precincts" | "rivers" | "innerWall" | "innerArteries">;
  complete: boolean;
  innerFirst: boolean;
  wallCheckpoint: AssemblyCheckpoint | undefined;
  mark: AssemblyMark;
  mesh: import("../../../core/types").Mesh;
}
/** Opens permitted river crossings and the outer-first inner curtain before any town streets. The inner-wall checkpoint returns before routing. */
export function applyCrossings(input: ApplyCrossingsInput) {
  let { next, plan, complete, innerFirst, wallCheckpoint, mark, mesh } = input;
  {
    // Open a real crossing before routing, keeping roads off river edges.
    const rivers = next.featureGroups.filter(g => g.kind === "river");
    const center = plan.precincts.find(p => p.kind === "plaza")?.anchor ?? [0, 0];
    for (const [riverIndex, river] of rivers.entries()) {
      const allowed = plan.rivers[riverIndex]?.bridgeAllowed;
      const locked = next.featureGroups.some(g => g.id === `${GEN_PREFIX}bridge-${riverIndex}` && g.locked);
      if (river.kind !== "river" || !allowed || locked) continue;
      const candidates = river.vertices
        .slice(1, -1)
        .filter(
          id =>
            next.mesh.vertices[id] &&
            Object.values(next.mesh.edges).some(
              e =>
                (e.a === id || e.b === id) &&
                [e.leftFace, e.rightFace].some(fid => fid && next.mesh.faces[fid].properties.buildable)
            )
        );
      const crossingScore = (id: Id) => {
        const point = next.mesh.vertices[id].point;
        const distance = Math.hypot(point[0] - center[0], point[1] - center[1]);
        if (!complete || next.gridKind !== "evolution" || river.style.widthMeters <= next.frame.blockSizeMeters)
          return distance;
        const index = river.vertices.indexOf(id);
        const before = next.mesh.vertices[river.vertices[index - 1]].point;
        const after = next.mesh.vertices[river.vertices[index + 1]].point;
        const ax = point[0] - before[0],
          ay = point[1] - before[1];
        const bx = after[0] - point[0],
          by = after[1] - point[1];
        const dot = (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
        // A sharp bend has no single short perpendicular across its ribbon.
        // Prefer a nearby straight reach before opening the crossing.
        return distance + river.style.widthMeters * 2 * (1 - dot);
      };
      candidates.sort((a, b) => crossingScore(a) - crossingScore(b));
      for (const id of candidates) {
        if (complete && next.gridKind === "evolution" && river.style.widthMeters > next.frame.blockSizeMeters) {
          const bridged = addWideRiverBridge(next, id, `${GEN_PREFIX}bridge-${riverIndex}`);
          if (bridged) {
            next = bridged;
            break;
          }
          continue;
        }
        const opened = openBarrierPassage(next, id, "river");
        if (opened) {
          const bridged = addBridge(opened, id, `${GEN_PREFIX}bridge-${riverIndex}`);
          if (bridged) {
            next = bridged;
            break;
          }
        }
      }
    }
  }
  // Double walls: the old-town wall goes up before any town street is routed.
  // Its gates stand on the planned gate-to-centre lines; the router (which
  // bans wall edges) can then enter the old town only through them, so no
  // street has to be closed or moved off the curtain afterwards.
  if (complete && !innerFirst && plan.innerWall?.planned && plan.innerArteries) {
    let castleInOldTown = plan.innerWall.castleRing === "inner";
    let inner = addInnerTownWall(next, {
      share: plan.innerWall.share ?? DEFAULT_INNER_WALLED_AREA_SHARE,
      minGapCells: INNER_WALL_MIN_GAP_CELLS,
      prefix: GEN_PREFIX,
      castleInOldTown,
      razed: plan.innerWall.razed,
      wallOnly: wallCheckpoint === "innerWall",
      arteries: plan.innerArteries,
      requireClosure: plan.innerWall.defensePolicy === "closed"
    });
    if (!inner.report.ok && next.urbanMorphology && plan.innerWall.castleRing === "inner") {
      // The present citadel can belong to the later expansion. Keep the old wall's
      // separation and gate rules instead of stretching it to a newer castle.
      castleInOldTown = false;
      inner = addInnerTownWall(next, {
        share: plan.innerWall.share ?? DEFAULT_INNER_WALLED_AREA_SHARE,
        minGapCells: INNER_WALL_MIN_GAP_CELLS,
        prefix: GEN_PREFIX,
        castleInOldTown: false,
        razed: plan.innerWall.razed,
        wallOnly: wallCheckpoint === "innerWall",
        arteries: plan.innerArteries,
        requireClosure: plan.innerWall.defensePolicy === "closed"
      });
    }
    const { report } = inner;
    mark("inner-wall", {
      ok: report.ok ? 1 : 0,
      planned: 1,
      castleInOldTown: castleInOldTown ? 1 : 0,
      castleTouchesOldTown: report.castleTouches ? 1 : 0,
      failureCode: report.failure ? INNER_WALL_FAILURES.indexOf(report.failure) + 1 : 0,
      faces: report.faces,
      areaShare: report.areaShare,
      gapCells: report.gapCells,
      gates: report.gates,
      riverOpenings: report.riverOpenings,
      cuts: report.cuts
    });
    // A town that cannot hold an old-town wall keeps its single curtain.
    if (report.ok) {
      next = inner.document;
      mesh = next.mesh;
    }
  }
  if (wallCheckpoint === "innerWall") return { stopped: true as const, document: next };

  return { stopped: false as const, next, mesh };
}

export type ApplyCrossingsResult = ReturnType<typeof applyCrossings>;
