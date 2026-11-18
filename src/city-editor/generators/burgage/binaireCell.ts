import type { BurgageCellPlan, BurgagePlot } from "../../types/contracts/burgage";
import type { Point } from "../../types/geometry";
import { cleanRing, isSimplePolygon } from "../geom";
import { makeRng, type Rng } from "../prng";
import {
  clipToBox,
  drawIn,
  edgeFrame,
  edgeOnLine,
  extent,
  fillLength,
  lineAcross,
  type PlotFrame,
  toLocal,
  usablePlot
} from "./frame";
import type { BinairePlotProfile } from "./profiles";

export interface BinaireCellContext {
  seed: string;
  /** Ring edges on a main street. The longest is the main front; the blocks run back from it. */
  fronts: readonly number[];
}

const OPPOSITE_COS = Math.cos((30 * Math.PI) / 180);

/**
 * A street block laid out as Séraphin's parcellaire binaire (docs/plan/ce-burgage-plot-fabric.md §5.7): narrow
 * blocks run back from the main street between cross lanes, each split along its axis by a venelle. Head houses
 * face the main street at the block ends; the other houses face the cross lanes and back onto the venelle. No land
 * is left open inside a block.
 */
export function planBinaireCell(
  ring: Point[],
  profile: BinairePlotProfile,
  context: BinaireCellContext
): BurgageCellPlan {
  const plan: BurgageCellPlan = {
    profile: "binaire",
    plots: [],
    lanes: [],
    open: []
  };
  const block = cleanRing(ring);
  if (block.length < 3 || !isSimplePolygon(block)) return plan;
  const rng = makeRng(`${context.seed}:binaire-cell-v1`);
  const length = (i: number) => {
    const a = block[i],
      b = block[(i + 1) % block.length];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  const fronts = context.fronts.filter(i => i >= 0 && i < block.length && length(i) > 1e-6);
  const main = (fronts.length ? fronts : block.map((_, i) => i)).reduce((best, i) =>
    length(i) > length(best) ? i : best
  );
  const frame = edgeFrame(block, main);
  const box = extent(frame, block);
  const opposite = fronts.some(i => {
    if (i === main) return false;
    const f = edgeFrame(block, i),
      a = block[i],
      b = block[(i + 1) % block.length];
    return (
      f.u[0] * frame.u[0] + f.u[1] * frame.u[1] < -OPPOSITE_COS &&
      toLocal(frame, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])[1] > box.t1 / 2
    );
  });

  // Blocks across the front, with a cross lane between each two.
  const strips = fillLength(
    box.s1 - box.s0,
    () => {
      const lane = drawIn(rng, profile.crossLaneMeters);
      return { width: drawIn(rng, profile.blockWidthMeters) + lane, lane };
    },
    profile.blockWidthMeters[0] * 0.75
  );
  if (!strips) {
    plan.open.push(block);
    return plan;
  }
  // Over-long blocks are cut by transverse lanes into lengths of the profile.
  const segments = Math.max(1, Math.ceil(box.t1 / profile.blockLengthMeters[1]));
  const transverse = segments > 1 ? drawIn(rng, profile.crossLaneMeters) : 0;
  const segmentLength = (box.t1 - transverse * (segments - 1)) / segments;
  for (let k = 1; k < segments; k++) {
    const at = k * segmentLength + (k - 0.5) * transverse,
      points = lineAcross(block, { origin: frame.origin, u: frame.v, v: frame.u }, at);
    if (points) plan.lanes.push({ kind: "transverse", widthMeters: transverse, points });
  }

  let s = box.s0;
  strips.forEach((strip, n) => {
    const last = n === strips.length - 1;
    // A cross lane follows each block but the last, which ends on the cell's own street.
    const lane = last ? 0 : strip.lane,
      a = s,
      b = last ? box.s1 : s + strip.width - lane;
    s = b + lane;
    if (!last) {
      const points = lineAcross(block, frame, b + lane / 2);
      if (points) plan.lanes.push({ kind: "cross", widthMeters: lane, points });
    }
    for (let k = 0; k < segments; k++) {
      const t0 = k * (segmentLength + transverse),
        t1 = t0 + segmentLength,
        headAtEnd = k === segments - 1 && opposite;
      layBlock(plan, block, frame, profile, rng, `${n}.${k}`, a, b, t0, t1, headAtEnd);
    }
  });
  return plan;
}

function layBlock(
  plan: BurgageCellPlan,
  block: Point[],
  frame: PlotFrame,
  profile: BinairePlotProfile,
  rng: Rng,
  key: string,
  a: number,
  b: number,
  t0: number,
  t1: number,
  headAtEnd: boolean
): void {
  const mid = (a + b) / 2,
    venelle = profile.venelleMeters;
  const centre = lineAcross(clipToBox(block, frame, -Infinity, Infinity, t0, t1), frame, mid);
  if (centre) plan.lanes.push({ kind: "venelle", widthMeters: venelle, points: centre });
  const span = t1 - t0;
  const heads = headAtEnd ? 2 : 1;
  const headDepth = Math.min(drawIn(rng, profile.head.depthMeters), span / (heads + 1));
  const endDepth = headAtEnd ? Math.min(drawIn(rng, profile.head.depthMeters), span / 3) : 0;
  const halves: { side: 0 | 1; from: number; to: number; laneAt: number }[] = [
    { side: 0, from: a, to: mid - venelle / 2, laneAt: a },
    { side: 1, from: mid + venelle / 2, to: b, laneAt: b }
  ];
  const minimumArea = profile.house.frontageMeters[0] * profile.house.depthMeters[0] * 0.3;
  const push = (
    plot: Omit<BurgagePlot, "ring" | "front" | "frontageMeters" | "depthMeters">,
    ring: Point[],
    front?: [Point, Point],
    depthFrame?: { f: PlotFrame; base: number; axis: 0 | 1 }
  ) => {
    if (!front || !usablePlot(ring, minimumArea)) {
      if (ring.length >= 3) plan.open.push(ring);
      return;
    }
    const local = ring.map(p => toLocal(depthFrame!.f, p)[depthFrame!.axis]);
    plan.plots.push({
      ...plot,
      ring,
      front,
      frontageMeters: Math.hypot(front[1][0] - front[0][0], front[1][1] - front[0][1]),
      depthMeters: Math.max(...local.map(v => Math.abs(v - depthFrame!.base)))
    });
  };
  for (const half of halves) {
    const id = `${key}:${half.side}`;
    // The head house on the main street (or the transverse lane before this block).
    const head = clipToBox(block, frame, half.from, half.to, t0, t0 + headDepth);
    push({ id: `${id}:h0`, kind: "head", parent: `${id}:h0`, undivided: true }, head, edgeOnLine(frame, head, 1, t0), {
      f: frame,
      base: t0,
      axis: 1
    });
    if (headAtEnd) {
      const end = clipToBox(block, frame, half.from, half.to, t1 - endDepth, t1);
      push({ id: `${id}:h1`, kind: "head", parent: `${id}:h1`, undivided: true }, end, farEdge(frame, end), {
        f: frame,
        base: t1,
        axis: 1
      });
    }
    // The houses between, fronting the cross lane on their side.
    const from = t0 + headDepth,
      to = t1 - endDepth;
    const houses = fillLength(
      to - from,
      () => ({ width: drawIn(rng, profile.house.frontageMeters) }),
      profile.house.frontageMeters[0] * 0.6
    );
    if (!houses) {
      const rest = clipToBox(block, frame, half.from, half.to, from, to);
      if (rest.length >= 3) plan.open.push(rest);
      continue;
    }
    let at = from;
    houses.forEach((house, h) => {
      const next = h === houses.length - 1 ? to : at + house.width;
      const ring = clipToBox(block, frame, half.from, half.to, at, next);
      at = next;
      push(
        {
          id: `${id}:r${h}`,
          kind: "row",
          parent: `${id}:r${h}`,
          undivided: true
        },
        ring,
        edgeOnLine(frame, ring, 0, half.laneAt),
        { f: frame, base: half.laneAt, axis: 0 }
      );
    });
  }
}

/** The plot's edge on the far line of its block (`t` largest), for a head house on the opposite street. */
function farEdge(frame: PlotFrame, ring: Point[]): [Point, Point] | undefined {
  const t = Math.max(...ring.map(p => toLocal(frame, p)[1]));
  return edgeOnLine(frame, ring, 1, t);
}
