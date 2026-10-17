import { contentDigest } from "./canonicalJson";
import type { BuildingRecord, OpeningRecord, Point, WallLoop } from "./record";

const FILL: Record<WallLoop["kind"], string> = {
  curtain: "#6f685f",
  chemise: "#6f685f",
  keep: "#8d8478",
  tower: "#7d756b",
  range: "#a89880",
  partition: "#c8c0b4"
};

function formatCoord(value: number): string {
  const rounded = Math.round(value * 1e6) / 1e6;
  if (Object.is(rounded, -0) || rounded === 0) return "0";
  if (Number.isSafeInteger(rounded)) return String(rounded);
  return rounded.toFixed(6).replace(/\.?0+$/, "");
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** CE plan convention: x stays x, y is negated so north is up in an SVG. */
function ringPath(ring: readonly Point[]): string {
  const commands = ring.map((point, index) => {
    const command = index === 0 ? "M" : "L";
    return `${command}${formatCoord(point[0])} ${formatCoord(-point[1])}`;
  });
  return `${commands.join(" ")} Z`;
}

function bounds(record: BuildingRecord): { minX: number; minY: number; width: number; depth: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const level of record.levels) {
    for (const wall of level.walls) {
      for (const point of wall.outer) {
        minX = Math.min(minX, point[0]);
        minY = Math.min(minY, point[1]);
        maxX = Math.max(maxX, point[0]);
        maxY = Math.max(maxY, point[1]);
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, width: maxX - minX, depth: maxY - minY };
}

function viewBox(record: BuildingRecord): string {
  const box = bounds(record);
  if (!box) return "0 0 1 1";
  const maxY = box.minY + box.depth;
  return `${formatCoord(box.minX)} ${formatCoord(-maxY)} ${formatCoord(box.width)} ${formatCoord(box.depth)}`;
}

function wallPaths(walls: readonly WallLoop[]): string {
  return walls
    .filter(wall => wall.kind !== "partition" && wall.outer.length >= 3)
    .map(wall => {
      const rings = [wall.outer, ...wall.holes.filter(hole => hole.length >= 3)];
      return `<path fill="${FILL[wall.kind]}" fill-rule="evenodd" stroke="#3f3a34" stroke-width="0.08" d="${rings.map(ringPath).join(" ")}"/>`;
    })
    .join("");
}

function intervalPoints(ring: readonly Point[], offset: number, width: number): Point[] {
  const points: Point[] = [];
  const end = offset + width;
  let travelled = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const next = travelled + span;
    if (next > offset && travelled < end && span > 1e-9) {
      const from = Math.max(offset, travelled);
      const to = Math.min(end, next);
      const at = (distance: number): Point => {
        const t = (distance - travelled) / span;
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      };
      const startPoint = at(from);
      const endPoint = at(to);
      const last = points[points.length - 1];
      if (!last || last[0] !== startPoint[0] || last[1] !== startPoint[1]) points.push(startPoint);
      points.push(endPoint);
    }
    travelled = next;
  }
  return points;
}

function openingPath(opening: OpeningRecord, walls: readonly WallLoop[]): string | null {
  const wall = walls.find(item => item.id === opening.ring.wallId);
  const ring = opening.ring.hole === null ? wall?.outer : wall?.holes[opening.ring.hole];
  if (!ring) return null;
  const points = intervalPoints(ring, opening.offsetMeters, opening.widthMeters);
  if (points.length < 2) return null;
  const commands = points.map((point, index) => {
    const command = index === 0 ? "M" : "L";
    return `${command}${formatCoord(point[0])} ${formatCoord(-point[1])}`;
  });
  return `<path fill="none" stroke="#8c3a2f" stroke-width="0.45" stroke-linecap="butt" d="${commands.join(" ")}"/>`;
}

function roofWalls(record: BuildingRecord): WallLoop[] {
  const byId = new Map<string, WallLoop>();
  const levels = [...record.levels].sort((a, b) => a.elevationMeters - b.elevationMeters);
  for (const level of levels) {
    for (const wall of level.walls) byId.set(wall.id, wall);
  }
  return [...byId.values()];
}

function shell(record: BuildingRecord, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox(record)}" data-id="${escapeAttr(record.id)}" data-revision="${record.revision}" data-hash="${contentDigest(record)}">${body}</svg>`;
}

/** Committed roof plan. Partitions stay off the city drawing. three.js is not used. */
export function planSvg(record: BuildingRecord): string {
  const walls = roofWalls(record);
  const gates = record.levels.flatMap(level =>
    level.openings.filter(opening => opening.kind === "gate").map(opening => openingPath(opening, level.walls))
  );
  return shell(record, `${wallPaths(walls)}${gates.filter(Boolean).join("")}`);
}

/** One floor, including openings along their rings. The 3D mesh is not cut by this drawing. */
export function levelPlanSvg(record: BuildingRecord, levelId: string): string {
  const level = record.levels.find(item => item.id === levelId);
  if (!level) return shell(record, "");
  const plates = level.plates
    .filter(plate => plate.outer.length >= 3)
    .map(plate => {
      const fill =
        plate.kind === "court" || plate.kind === "courtyard" || plate.roof === "open" ? "#d5dec4" : "#efe8dc";
      return `<path fill="${fill}" fill-rule="evenodd" d="${[plate.outer, ...plate.holes].map(ringPath).join(" ")}"/>`;
    })
    .join("");
  const openings = level.openings.map(opening => openingPath(opening, level.walls)).filter(Boolean);
  return shell(record, `${plates}${wallPaths(level.walls)}${openings.join("")}`);
}

/** Hash stamped on a committed plan, or null when the attribute is absent. */
export function committedSvgHash(markup: string): string | null {
  const match = /data-hash="([0-9a-f]{64})"/.exec(markup);
  return match?.[1] ?? null;
}
