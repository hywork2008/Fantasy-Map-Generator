import { describe, expect, it } from "vitest";
import type { Point } from "../types";
import { nearestOnPolyline, pointInPolygon } from "./geom";
import { fitMonastery, type Monastery, type MonasteryKind } from "./monasteryLayout";
import { makeRng } from "./prng";

// A block between two streets: tilted, irregular, a little over 100 m across.
const BLOCK: Point[] = [
  [0, 0],
  [118, 14],
  [128, 96],
  [22, 108]
];

const KINDS: MonasteryKind[] = ["abbey", "friary", "orthodoxMonastery"];

function fit(kind: MonasteryKind, ring: Point[] = BLOCK, margin = 8) {
  return fitMonastery({ kind, id: "m", faceId: "f1", ring, rng: makeRng(`t:${kind}`), margin });
}

function centroid(p: Point[]): Point {
  return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
}

const inside = (p: Point, ring: Point[]) =>
  pointInPolygon(p, ring) || nearestOnPolyline(p, [...ring, ring[0]]).dist < 0.05;

describe("monastery layout in a Voronoi block", () => {
  it.each(KINDS)("fits a %s inside the block with every building within the precinct", kind => {
    const result = fit(kind);
    expect(result).not.toBeNull();
    const m = result!.monastery;
    expect(result!.scale).toBeGreaterThanOrEqual(0.62);
    for (const p of m.precinct) expect(inside(p, BLOCK)).toBe(true);
    for (const b of m.buildings) for (const p of b.polygon) expect(inside(p, m.precinct), `${b.role}`).toBe(true);
    for (const t of m.trees) expect(pointInPolygon(t.at, m.precinct)).toBe(true);
  });

  it.each(KINDS)("keeps %s buildings from overlapping one another", kind => {
    const m = fit(kind)!.monastery;
    // Domes and crossing towers sit on top of the church roof by design.
    const solid = m.buildings.filter(b => b.role !== "dome" && b.role !== "crossing-tower");
    for (const [i, a] of solid.entries())
      for (const b of solid.slice(i + 1)) {
        // The two arms of a cross-shaped church overlap by design.
        if (a.role === "church" && b.role === "church") continue;
        expect(pointInPolygon(centroid(a.polygon), b.polygon), `${a.role} in ${b.role}`).toBe(false);
        expect(pointInPolygon(centroid(b.polygon), a.polygon), `${b.role} in ${a.role}`).toBe(false);
      }
  });

  it.each(KINDS)("opens the %s wall at a gate that sits on the precinct line", kind => {
    const m = fit(kind)!.monastery;
    expect(nearestOnPolyline(m.gate, [...m.precinct, m.precinct[0]]).dist).toBeLessThan(0.05);
    const [first, last] = [m.wall[0], m.wall[m.wall.length - 1]];
    expect(Math.hypot(first[0] - last[0], first[1] - last[1])).toBeGreaterThan(2);
    expect(Math.hypot(first[0] - m.gate[0], first[1] - m.gate[1])).toBeLessThan(2.2);
  });

  it("puts the church on the street the block fronts", () => {
    const result = fit("abbey", BLOCK, 8)!;
    const nave = result.monastery.buildings.find(b => b.role === "church")!;
    // The nave runs parallel to the front edge and sits near it, not deep inside the block.
    const edge = [BLOCK[0], BLOCK[1]];
    const distance = nearestOnPolyline(centroid(nave.polygon), edge).dist;
    expect(distance).toBeLessThan(40);
    expect(result.front).toBeDefined();
  });

  it("is deterministic", () => {
    expect(fit("abbey")).toEqual(fit("abbey"));
  });

  it("trims a large block to the programme plus its margin and never grows a small one", () => {
    const huge: Point[] = [
      [0, 0],
      [400, 0],
      [400, 300],
      [0, 300]
    ];
    const trimmed = fit("friary", huge, 8)!.monastery;
    const area = (p: Point[]) =>
      Math.abs(p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0) / 2);
    expect(area(trimmed.precinct)).toBeLessThan(area(huge) / 4);
    const small: Point[] = [
      [0, 0],
      [75, 0],
      [75, 66],
      [0, 66]
    ];
    const snug = fit("friary", small, 8)!.monastery;
    expect(area(snug.precinct)).toBeLessThanOrEqual(area(small) + 0.5);
    expect(area(snug.precinct)).toBeGreaterThan(area(small) * 0.6);
  });

  it("gives up on a block too small for even the smallest programme", () => {
    const tiny: Point[] = [
      [0, 0],
      [30, 0],
      [30, 24],
      [0, 24]
    ];
    for (const kind of KINDS) expect(fit(kind, tiny)).toBeNull();
  });

  it("only draws cloister walks and beds for the cloistered houses", () => {
    const withCloister = (m: Monastery) => !!m.walk && m.beds.length > 0;
    expect(withCloister(fit("abbey")!.monastery)).toBe(true);
    expect(withCloister(fit("friary")!.monastery)).toBe(true);
    expect(fit("orthodoxMonastery")!.monastery.walk).toBeUndefined();
  });
});
