import type { Point } from "../../../types/primitives";
import type { VectorBlock } from "../../../types/vector/generation";

/** Integer centimetres in a fixed vertex order: counter-clockwise from the lowest (x, y) vertex. */
function canonicalRing(ring: Point[]): number[] {
  const points = ring
    .map(p => [Math.round(p[0] * 100), Math.round(p[1] * 100)] as [number, number])
    .filter((p, i, all) => {
      const q = all[(i - 1 + all.length) % all.length];
      return all.length < 2 || p[0] !== q[0] || p[1] !== q[1];
    });
  let twice = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i],
      b = points[(i + 1) % points.length];
    twice += a[0] * b[1] - b[0] * a[1];
  }
  if (twice < 0) points.reverse();
  let start = 0;
  for (let i = 1; i < points.length; i++)
    if (points[i][0] < points[start][0] || (points[i][0] === points[start][0] && points[i][1] < points[start][1]))
      start = i;
  return [...points.slice(start), ...points.slice(0, start)].flat();
}

/** Stable id of a skeleton block used as a district: the same outline (to 1 cm) and the same fronting roads give
 * the same id whatever the order of the blocks, so adding or removing another district never changes this one's
 * random streams, street blocks or houses. */
export function vectorDistrictId(block: Pick<VectorBlock, "outer" | "holes" | "frontage">): string {
  const holes = block.holes.map(canonicalRing).sort((a, b) => a.join().localeCompare(b.join()));
  const roads = [...new Set(block.frontage.map(f => f.pathId))].sort();
  const text = JSON.stringify([canonicalRing(block.outer), holes, roads]);
  let a = 0x811c9dc5,
    b = 0x9e3779b9;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193);
    b = Math.imul(b ^ code, 0x85ebca6b);
  }
  return `district:${(a >>> 0).toString(16).padStart(8, "0")}${(b >>> 0).toString(16).padStart(8, "0")}`;
}
