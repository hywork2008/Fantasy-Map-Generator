import type { BurgageCellPlan, BurgageSetting } from "../../types/contracts/burgage";
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
  LANE_CLEARANCE_METERS,
  lineAcross,
  type PlotFrame,
  toLocal,
  toWorld,
  usablePlot
} from "./frame";
import type { StripPlotProfile } from "./profiles";

export interface StripCellContext {
  /** Seeds the cell's own random stream, so its layout does not depend on its siblings. */
  seed: string;
  /** Ring edges (`ring[i] → ring[i + 1]`) on a street a plot may face. The longest is the main front. */
  fronts: readonly number[];
  setting: BurgageSetting;
  /** Overrides the profile's share of undivided plots (old centre: more, later growth: fewer; plan R6). */
  undividedShare?: number;
}

/** Edges at most this far from antiparallel to the main front count as the opposite street. */
const OPPOSITE_COS = Math.cos((30 * Math.PI) / 180);
/** Thinner leftovers are not worth keeping as open ground. */
const OPEN_MIN_METERS = 0.5;

/**
 * A street block of narrow-and-deep plots (docs/plan/ce-burgage-plot-fabric.md §5.2–§5.3): one row on the main
 * front, a second row back to back on an opposite street when the block is deep enough for two, or a single row
 * on a back lane. Long rows are broken by cross lanes. Every plot faces its row's street; plots that would not
 * front it, or come out as slivers at an oblique corner, are left as open ground.
 */
export function planBurgageCell(ring: Point[], profile: StripPlotProfile, context: StripCellContext): BurgageCellPlan {
  const plan: BurgageCellPlan = {
    profile: profile.id,
    plots: [],
    lanes: [],
    open: []
  };
  const block = cleanRing(ring);
  if (block.length < 3 || !isSimplePolygon(block)) return plan;
  const rng = makeRng(`${context.seed}:burgage-cell-v1`);
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
  const depthSpan = box.t1;
  const opposite = fronts
    .filter(i => i !== main)
    .map(i => ({ i, f: edgeFrame(block, i) }))
    .filter(({ f }) => f.u[0] * frame.u[0] + f.u[1] * frame.u[1] < -OPPOSITE_COS)
    .filter(({ i }) => {
      const a = block[i],
        b = block[(i + 1) % block.length];
      return toLocal(frame, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])[1] > depthSpan / 2;
    })
    .sort((a, b) => length(b.i) - length(a.i))[0];
  const [minDepth, maxDepth] = profile.depthMeters[context.setting];

  // A row's own frame and depth, and the band of the main frame that keeps it off the other row.
  type Row = { frame: PlotFrame; t1: number; mainFrom: number; mainTo: number };
  const rows: Row[] = [];
  if (opposite && depthSpan >= 2 * minDepth) {
    if (depthSpan / 2 <= maxDepth) {
      rows.push({
        frame,
        t1: depthSpan / 2,
        mainFrom: -Infinity,
        mainTo: Infinity
      });
      rows.push({
        frame: opposite.f,
        t1: Infinity,
        mainFrom: depthSpan / 2,
        mainTo: Infinity
      });
    } else {
      const near = rng.range(maxDepth * 0.9, maxDepth),
        far = rng.range(maxDepth * 0.9, maxDepth);
      rows.push({ frame, t1: near, mainFrom: -Infinity, mainTo: Infinity });
      rows.push({
        frame: opposite.f,
        t1: far,
        mainFrom: near,
        mainTo: Infinity
      });
      // The backland between two rows that do not meet stays open ground.
      const middle = clipToBox(
        clipToBox(block, frame, -Infinity, Infinity, near, Infinity),
        opposite.f,
        -Infinity,
        Infinity,
        far,
        Infinity
      );
      if (middle.length >= 3) plan.open.push(middle);
    }
  } else {
    const lane = profile.backLaneMeters && !opposite ? drawIn(rng, profile.backLaneMeters) : 0;
    const gap = lane + 2 * LANE_CLEARANCE_METERS;
    const withLane = lane > 0 && depthSpan >= minDepth + gap;
    const depth = Math.min(maxDepth, withLane ? depthSpan - gap : depthSpan);
    // A block too shallow for its setting's plots still takes the shallowest plots of the type.
    if (depth < profile.depthMeters.intramural[0] * 0.5) {
      plan.open.push(block);
      return plan;
    }
    rows.push({ frame, t1: depth, mainFrom: -Infinity, mainTo: Infinity });
    if (withLane) {
      const at = depth + gap / 2,
        sliver = clipToBox(block, frame, -Infinity, Infinity, at - 1e-3, at + 1e-3, false);
      if (sliver.length >= 3) {
        const ss = sliver.map(p => toLocal(frame, p)[0]);
        plan.lanes.push({
          kind: "back",
          widthMeters: lane,
          points: [toWorld(frame, Math.min(...ss), at), toWorld(frame, Math.max(...ss), at)]
        });
      }
    }
    const back = withLane ? depth + gap : depth;
    const rest = clipToBox(block, frame, -Infinity, Infinity, back, Infinity);
    if (rest.length >= 3 && extent(frame, rest).t1 - back >= OPEN_MIN_METERS) plan.open.push(rest);
  }

  // Cross lanes cut the whole block, so both rows break at the same places.
  const cuts = crossLanes(rng, profile, box.s0, box.s1);
  for (const cut of cuts) {
    const points = lineAcross(block, frame, cut.at);
    if (points) plan.lanes.push({ kind: "cross", widthMeters: cut.width, points });
  }
  const spans: [number, number][] = [];
  let from = -Infinity;
  for (const cut of cuts) {
    spans.push([from, cut.at - cut.width / 2 - LANE_CLEARANCE_METERS]);
    from = cut.at + cut.width / 2 + LANE_CLEARANCE_METERS;
  }
  spans.push([from, Infinity]);

  const share = context.undividedShare ?? profile.undividedShare;
  for (const [r, row] of rows.entries())
    for (const [k, [a, b]] of spans.entries()) {
      let band = clipToBox(block, frame, a, b, row.mainFrom, row.mainTo);
      band = clipToBox(band, row.frame, -Infinity, Infinity, 0, row.t1);
      if (band.length >= 3) layRow(plan, band, row.frame, profile, share, rng, `${r}.${k}`);
    }
  return plan;
}

function crossLanes(rng: Rng, profile: StripPlotProfile, s0: number, s1: number): { at: number; width: number }[] {
  const [minSpacing, maxSpacing] = profile.crossLane.spacingMeters;
  if (s1 - s0 <= maxSpacing) return [];
  const cuts: { at: number; width: number }[] = [];
  for (let at = s0 + drawIn(rng, profile.crossLane.spacingMeters); at < s1 - minSpacing / 2; ) {
    cuts.push({ at, width: drawIn(rng, profile.crossLane.widthMeters) });
    at += drawIn(rng, profile.crossLane.spacingMeters);
  }
  return cuts;
}

/** One row between cross lanes: original plots along the front, most of them divided in two (plan §5.2, R5). */
function layRow(
  plan: BurgageCellPlan,
  band: Point[],
  frame: PlotFrame,
  profile: StripPlotProfile,
  undividedShare: number,
  rng: Rng,
  key: string
): void {
  const front = edgeOnLine(frame, band, 1, 0);
  if (!front) {
    plan.open.push(band);
    return;
  }
  const s0 = toLocal(frame, front[0])[0],
    s1 = toLocal(frame, front[1])[0];
  const [minFrontage, maxFrontage] = profile.frontageMeters;
  const originals = fillLength(
    s1 - s0,
    () =>
      rng() < undividedShare
        ? {
            width: drawIn(rng, profile.undividedFrontageMeters),
            undivided: true
          }
        : {
            width: rng.range(2 * minFrontage, 2 * maxFrontage),
            undivided: false
          },
    minFrontage * 0.6
  );
  if (!originals) {
    plan.open.push(band);
    return;
  }
  // A short row's only plot is a single plot of its own, not half of one.
  if (originals.length === 1 && originals[0].width < 2 * minFrontage) originals[0].undivided = true;
  const minimumArea = minFrontage * profile.depthMeters.intramural[0] * 0.2;
  let at = s0;
  originals.forEach((original, n) => {
    const parent = `${key}:${n}`;
    const widths = original.undivided ? [original.width] : halves(rng, original.width, minFrontage, maxFrontage);
    widths.forEach((width, h) => {
      const from = at,
        to = n === originals.length - 1 && h === widths.length - 1 ? s1 : at + width;
      at = to;
      const ring = clipToBox(band, frame, from, to, -Infinity, Infinity);
      const plotFront = edgeOnLine(frame, ring, 1, 0);
      if (!plotFront || !usablePlot(ring, minimumArea)) {
        if (ring.length >= 3) plan.open.push(ring);
        return;
      }
      plan.plots.push({
        id: `${parent}${widths.length > 1 ? `.${h}` : ""}`,
        ring,
        front: plotFront,
        frontageMeters: Math.hypot(plotFront[1][0] - plotFront[0][0], plotFront[1][1] - plotFront[0][1]),
        depthMeters: extent(frame, ring).t1,
        kind: "plot",
        parent,
        undivided: widths.length === 1
      });
    });
  });
}

/** An original plot cut in two, each half within the divided frontage where the original allows it. */
function halves(rng: Rng, width: number, min: number, max: number): number[] {
  const lo = Math.max(min, width - max),
    hi = Math.min(max, width - min);
  const first = lo <= hi ? Math.min(hi, Math.max(lo, width * rng.range(0.4, 0.6))) : width / 2;
  return [first, width - first];
}
