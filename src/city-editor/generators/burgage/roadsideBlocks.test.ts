import { describe, expect, it } from "vitest";
import type { RoadsideArm, RoadsideVillagePlan } from "../../types/contracts/burgage";
import type { Point } from "../../types/geometry";
import { nearestOnPolyline, pointInPolygon } from "../geom";
import { LANE_CLEARANCE_METERS } from "./frame";
import { VILLAGE_TOFT_PROFILE } from "./profiles";
import { planRoadsideBlocks } from "./roadsideBlocks";

const line = (to: Point, steps = 40): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => [(to[0] * i) / steps, (to[1] * i) / steps] as Point);
/** An arc of radius `r` from the centre, bending through `degrees`. */
const arc = (r: number, degrees: number, steps = 60): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const a = ((degrees * Math.PI) / 180) * (i / steps);
    return [r * Math.sin(a), r - r * Math.cos(a)] as Point;
  });
const reach = VILLAGE_TOFT_PROFILE.armMeters.max + 50;
const through: RoadsideArm[] = [
  { id: "e", points: line([reach, 0]) },
  { id: "w", points: line([-reach, 0]) }
];
const crossroads: RoadsideArm[] = [
  ...through,
  { id: "n", points: line([0, reach]) },
  { id: "s", points: line([0, -reach]) }
];

const corner = (a: Point, b: Point, c: Point) => {
  const u = [a[0] - b[0], a[1] - b[1]],
    v = [c[0] - b[0], c[1] - b[1]];
  return (Math.acos((u[0] * v[0] + u[1] * v[1]) / (Math.hypot(u[0], u[1]) * Math.hypot(v[0], v[1]))) * 180) / Math.PI;
};
const rectangular = (ring: Point[]) =>
  ring.length === 4 && ring.every((p, i) => Math.abs(corner(ring[(i + 3) % 4], p, ring[(i + 1) % 4]) - 90) < 0.5);

/** Sample points strictly inside two blocks, or inside a block and on a road's surface. */
function conflicts(plan: RoadsideVillagePlan, arms: RoadsideArm[], streetHalfMin: number): number {
  let hits = 0;
  for (const block of plan.blocks) {
    const xs = block.ring.map(p => p[0]),
      ys = block.ring.map(p => p[1]);
    for (let x = Math.min(...xs) + 0.37; x < Math.max(...xs); x += 2)
      for (let y = Math.min(...ys) + 0.41; y < Math.max(...ys); y += 2) {
        const p: Point = [x, y];
        if (!pointInPolygon(p, block.ring)) continue;
        if (plan.blocks.some(b => b !== block && pointInPolygon(p, b.ring))) hits++;
        if (arms.some(a => nearestOnPolyline(p, a.points).dist < streetHalfMin - 0.01)) hits++;
      }
  }
  return hits;
}

const streetHalfMin = VILLAGE_TOFT_PROFILE.streetMeters[0] / 2;

describe("planRoadsideBlocks", () => {
  it("lays rectangular blocks of tofts on both sides of a road, nearest the centre first", () => {
    const plan = planRoadsideBlocks({ seed: "v1-through", arms: through, need: 24 });
    expect(plan.shortfall).toBe(0);
    expect(plan.plots).toBe(24);
    expect(plan.blocks.every(b => b.tier === 1 && rectangular(b.ring))).toBe(true);
    expect(plan.blocks.flatMap(b => b.plots).every(p => rectangular(p.ring) && p.undivided)).toBe(true);
    expect(new Set(plan.blocks.map(b => `${b.armId}:${b.side}`)).size).toBe(4);
    // A small village stays within the first reach of its roads.
    for (const plot of plan.blocks.flatMap(b => b.plots))
      expect(Math.max(...plot.ring.map(p => Math.abs(p[0])))).toBeLessThan(VILLAGE_TOFT_PROFILE.armMeters.first + 1);
    expect(conflicts(plan, through, streetHalfMin)).toBe(0);
    // Every block has a cross lane before it and a back lane behind it.
    expect(plan.lanes.filter(l => l.kind === "cross")).toHaveLength(plan.blocks.length);
    for (const block of plan.blocks) {
      const back = plan.lanes.filter(l => l.kind === "back" && l.armId === block.armId && l.side === block.side);
      const [a, b] = block.front,
        cx = block.ring.reduce((n, p) => n + p[0], 0) / 4,
        cy = block.ring.reduce((n, p) => n + p[1], 0) / 4,
        rear: Point = [2 * cx - (a[0] + b[0]) / 2, 2 * cy - (a[1] + b[1]) / 2];
      // The lane keeps a hair off the plots (`LANE_CLEARANCE_METERS`).
      expect(
        back.some(l => nearestOnPolyline(rear, l.points).dist <= l.widthMeters / 2 + LANE_CLEARANCE_METERS + 1e-6)
      ).toBe(true);
    }
    expect(planRoadsideBlocks({ seed: "v1-through", arms: through, need: 24 })).toEqual(plan);
  });

  it("keeps blocks rectangular and off the road and each other along a bending road", () => {
    const arms: RoadsideArm[] = [
      { id: "bend", points: arc(300, 120) },
      { id: "straight", points: line([-reach, 0]) }
    ];
    const plan = planRoadsideBlocks({ seed: "v1-bend", arms, need: 150 });
    expect(plan.blocks.length).toBeGreaterThan(4);
    expect(plan.blocks.every(b => rectangular(b.ring))).toBe(true);
    expect(conflicts(plan, arms, streetHalfMin)).toBe(0);
  });

  it("keeps clear of obstacles", () => {
    const river: Point[] = [
      [60, -300],
      [90, -300],
      [90, 300],
      [60, 300]
    ];
    const plan = planRoadsideBlocks({ seed: "v1-river", arms: through, need: 60, obstacles: [river] });
    expect(plan.shortfall).toBe(0);
    for (const block of plan.blocks) expect(block.ring.every(p => p[0] <= 60 + 1e-6 || p[0] >= 90 - 1e-6)).toBe(true);
  });

  // Plan §5.6: 3,000 people (667 dwellings) fit a crossroads village; a road ending at the village reaches its limit.
  it("houses 3,000 people at a crossroads by splitting tofts and a second row, and reports a dead-end road short", () => {
    const cross = planRoadsideBlocks({ seed: "v1-cross", arms: crossroads, need: 667 });
    expect(cross.shortfall).toBe(0);
    expect(cross.blocks.some(b => b.tier === 2)).toBe(true);
    expect(cross.blocks.flatMap(b => b.plots).some(p => !p.undivided)).toBe(true);
    expect(
      cross.blocks.flatMap(b => b.plots).every(p => p.frontageMeters >= VILLAGE_TOFT_PROFILE.minFrontageMeters - 1e-6)
    ).toBe(true);
    expect(cross.blocks.every(b => rectangular(b.ring))).toBe(true);
    expect(conflicts(cross, crossroads, streetHalfMin)).toBe(0);
    const single = planRoadsideBlocks({ seed: "v1-single", arms: through.slice(0, 1), need: 667 });
    expect(single.shortfall).toBeGreaterThan(0);
    expect(single.reasons).toEqual(["village-capacity"]);
  });
});
