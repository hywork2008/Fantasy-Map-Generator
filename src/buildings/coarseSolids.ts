import { sameRing } from "./geometry";
import type { BuildingRecord, CoarseSolid, LevelRecord, Point, RoofRecord, WallLoop } from "./record";

const MESH_KINDS = new Set<WallLoop["kind"]>(["curtain", "keep", "tower", "chemise", "range"]);

function solidKind(wall: WallLoop, level: LevelRecord): CoarseSolid["kind"] | null {
  if (!MESH_KINDS.has(wall.kind)) return null;
  const gatehouse =
    wall.kind === "range" && level.openings.some(opening => opening.kind === "gate" && opening.ring.wallId === wall.id);
  if (gatehouse) return "gate";
  if (wall.kind === "curtain" || wall.kind === "chemise") return "wall";
  if (wall.kind === "keep" || wall.kind === "tower") return "tower";
  return "range";
}

function sameHoles(a: readonly Point[][], b: readonly Point[][]): boolean {
  if (a.length !== b.length) return false;
  const used = new Set<number>();
  for (const hole of a) {
    const match = b.findIndex((other, index) => !used.has(index) && sameRing(hole, other));
    if (match < 0) return false;
    used.add(match);
  }
  return true;
}

function sameLoop(a: WallLoop, b: WallLoop): boolean {
  return sameRing(a.outer, b.outer) && sameHoles(a.holes, b.holes);
}

function roofFor(roofs: readonly RoofRecord[], wallId: string): Pick<CoarseSolid, "roof" | "ridgeAzimuth"> {
  const roof = roofs.find(item => item.baseId === wallId);
  if (!roof) return { roof: "flat" };
  return { roof: roof.form, ridgeAzimuth: roof.ridgeAzimuth };
}

interface Run {
  wall: WallLoop;
  kind: CoarseSolid["kind"];
  baseElevationMeters: number;
  topMeters: number;
}

/**
 * Exterior masses. Partitions stay on the plan. Matching loops on consecutive
 * floors extrude once, from the lowest floor to the top of the highest.
 */
export function coarseSolids(record: BuildingRecord): CoarseSolid[] {
  const levels = [...record.levels].sort((a, b) => a.elevationMeters - b.elevationMeters);
  const runs: Run[] = [];
  const solids: CoarseSolid[] = [];
  const flush = (run: Run) => {
    const cap = roofFor(record.roofs, run.wall.id);
    solids.push({
      id: run.wall.id,
      kind: run.kind,
      outer: run.wall.outer,
      holes: run.wall.holes,
      baseElevationMeters: run.baseElevationMeters,
      heightMeters: run.topMeters - run.baseElevationMeters,
      roof: cap.roof,
      ridgeAzimuth: cap.ridgeAzimuth
    });
  };
  for (const level of levels) {
    const open = new Set(runs.map((_, index) => index));
    for (const wall of level.walls) {
      const kind = solidKind(wall, level);
      if (!kind) continue;
      const index = runs.findIndex((run, runIndex) => open.has(runIndex) && sameLoop(run.wall, wall));
      const top = level.elevationMeters + level.floorToFloorMeters;
      if (index >= 0 && Math.abs(level.elevationMeters - runs[index].topMeters) <= 0.05) {
        runs[index] = { ...runs[index], wall, kind, topMeters: top };
        open.delete(index);
      } else {
        runs.push({
          wall,
          kind,
          baseElevationMeters: level.elevationMeters,
          topMeters: top
        });
      }
    }
    for (let index = runs.length - 1; index >= 0; index--) {
      if (!open.has(index)) continue;
      flush(runs[index]);
      runs.splice(index, 1);
    }
  }
  for (const run of runs) flush(run);
  return solids;
}
