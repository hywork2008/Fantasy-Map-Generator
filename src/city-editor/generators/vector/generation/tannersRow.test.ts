import { describe, expect, it } from "vitest";
import type { Point } from "../../../types/primitives";
import { tannersRow } from "./tannersRow";

const arc = (r: number, degrees: number, sign = 1): Point[] =>
  Array.from({ length: 200 }, (_, k) => {
    const t = ((k / 199) * degrees * Math.PI) / 180;
    return [r * Math.sin(t), sign * r * (1 - Math.cos(t))];
  });
const straight: Point[] = [
  [0, 0],
  [200, 0]
];
// Two arcs of 120 m radius bending opposite ways.
const sCurve: Point[] = (() => {
  const first = arc(120, 60),
    end = first.at(-1)!,
    turn = Math.PI / 3;
  const second = arc(120, 60, -1).map(
    ([x, y]): Point => [
      end[0] + x * Math.cos(turn) - y * Math.sin(turn),
      end[1] + x * Math.sin(turn) + y * Math.cos(turn)
    ]
  );
  return [...first, ...second.slice(1)];
})();

function check(bank: Point[], landSide: 1 | -1) {
  const row = tannersRow(bank, landSide);
  for (const r of row.reaches) {
    expect(r.apronMeters).toBeLessThanOrEqual(2 + 1e-9);
    // No bank point lies landward of its chord.
    for (const p of bank) {
      const x = (p[0] - r.a[0]) * r.tangent[0] + (p[1] - r.a[1]) * r.tangent[1];
      const off = (p[0] - r.a[0]) * r.landNormal[0] + (p[1] - r.a[1]) * r.landNormal[1];
      if (x < 0 || x > Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) || off < -5) continue;
      expect(off).toBeLessThanOrEqual(1e-6);
    }
    for (const y of r.yards) {
      // Intake upstream of effluent, both channels short and square to the chord.
      const up = (p: Point) => (p[0] - r.a[0]) * r.tangent[0] + (p[1] - r.a[1]) * r.tangent[1];
      expect(up(y.intake.port)).toBeLessThan(up(y.effluent.port));
      for (const c of [y.intake, y.effluent]) {
        expect(c.lengthMeters).toBeGreaterThanOrEqual(0);
        expect(c.lengthMeters).toBeLessThanOrEqual(2 + 1e-6);
        const d: Point = [c.bank[0] - c.port[0], c.bank[1] - c.port[1]];
        expect(Math.abs(d[0] * r.tangent[0] + d[1] * r.tangent[1])).toBeLessThan(1e-6);
      }
      // The yard's front (the model's +z, local -y in the CE plan frame) faces the land.
      const a = (y.facingDegrees * Math.PI) / 180,
        front: Point = [Math.sin(a), -Math.cos(a)];
      expect(front[0] * r.landNormal[0] + front[1] * r.landNormal[1]).toBeCloseTo(1, 6);
      // The model's own ports, turned and mirrored as the placement draws them, fall on the row's ports.
      const world = (x: number, z: number): Point => {
        const lx = (y.mirrored ? -1 : 1) * x,
          ly = -z;
        return [
          y.position[0] + lx * Math.cos(a) - ly * Math.sin(a),
          y.position[1] + lx * Math.sin(a) + ly * Math.cos(a)
        ];
      };
      for (const [port, x] of [
        [y.intake.port, -7.5],
        [y.effluent.port, 7.5]
      ] as const) {
        const w = world(x, -8);
        expect(Math.hypot(w[0] - port[0], w[1] - port[1])).toBeLessThan(1e-6);
      }
    }
  }
  return row;
}

describe("tanners' row on a bank (tanners' row plan T1)", () => {
  it("lines a straight bank with yards side by side and no revetment", () => {
    const row = check(straight, 1);
    expect(row.reaches).toHaveLength(1);
    expect(row.reaches[0].yards).toHaveLength(11);
    expect(row.reaches[0].apronMeters).toBeCloseTo(0, 9);
    expect(row.reaches[0].yards.every(y => y.intake.lengthMeters < 1e-9)).toBe(true);
  });

  it("mirrors the yards on the other bank so the intake stays upstream", () => {
    const left = check(straight, 1).reaches[0].yards[0],
      right = check(straight, -1).reaches[0].yards[0];
    expect(left.mirrored).not.toBe(right.mirrored);
  });

  it.each([60, 150])("cuts a %i m bend into chords within the revetment", r => {
    for (const side of [1, -1] as const) {
      const row = check(arc(r, 90), side),
        yards = row.reaches.reduce((n, x) => n + x.yards.length, 0);
      expect(yards).toBeGreaterThan(0);
      // The tighter bend leaves more open ground between chords.
      expect(row.bendMeters).toBeLessThan(row.bankMeters);
    }
  });

  it("keeps whole reaches of several yards on a gentle bend", () => {
    const row = check(arc(150, 90), -1);
    expect(Math.max(...row.reaches.map(r => r.yards.length))).toBeGreaterThanOrEqual(2);
  });

  it("follows an S-curve", () => {
    for (const side of [1, -1] as const) expect(check(sCurve, side).reaches.length).toBeGreaterThan(1);
  });

  it("keeps a continuous row round the bends: backs side by side, no yard overlapping the next", () => {
    for (const side of [1, -1] as const) {
      const yards = tannersRow(sCurve, side, { continuous: true }).reaches.flatMap(r => r.yards),
        back = (y: (typeof yards)[number]): Point => [
          (y.intake.port[0] + y.effluent.port[0]) / 2,
          (y.intake.port[1] + y.effluent.port[1]) / 2
        ];
      expect(yards.length).toBeGreaterThan(10);
      for (let k = 1; k < yards.length; k++) {
        const gap = Math.hypot(back(yards[k])[0] - back(yards[k - 1])[0], back(yards[k])[1] - back(yards[k - 1])[1]);
        // One frontage apart on a chord; across a bend the next yard moves on only far enough to clear, never a yard.
        expect(gap).toBeGreaterThan(17.9);
        expect(gap).toBeLessThan(30);
        // Yard centres stay a frontage apart: neighbours never overlap.
        expect(
          Math.hypot(yards[k].position[0] - yards[k - 1].position[0], yards[k].position[1] - yards[k - 1].position[1])
        ).toBeGreaterThan(17.5);
      }
    }
  });
});
