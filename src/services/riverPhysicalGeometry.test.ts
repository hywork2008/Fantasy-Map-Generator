import { describe, expect, it } from "vitest";
import { RIVER_GEOMETRY_TOLERANCE as epsilon } from "./riverGeometry";
import { normalWaterSection, pointInWater } from "./riverPhysicalGeometry";

describe("physical bank contact", () => {
  const diamond = {
    id: 1,
    rings: [
      [
        [0, 0],
        [10, 10],
        [0, 20],
        [-10, 10]
      ] as const
    ]
  };
  it("retains perpendicular and endpoint tolerances at diagonal bank corners", () => {
    expect(pointInWater([-1.3 * epsilon, -0.01 * epsilon], diamond)).toBe(true);
    expect(pointInWater([10 + epsilon, 10], diamond)).toBe(true);
    expect(pointInWater([10 + 2 * epsilon, 10], diamond)).toBe(false);
    expect(pointInWater([0, 10], diamond)).toBe(true);
    expect(pointInWater([100, 10], diamond)).toBe(false);
  });
  it("retains dry islands and wet island boundaries", () => {
    const water = {
      ...diamond,
      rings: [
        ...diamond.rings,
        [
          [-2, 8],
          [2, 8],
          [2, 12],
          [-2, 12]
        ] as const
      ]
    };
    expect(pointInWater([0, 10], water)).toBe(false);
    expect(pointInWater([2, 10], water)).toBe(true);
  });
});

describe("normal water section on indexed snapshots", () => {
  /** A long meandering river with a midstream island: many remote hits along every normal. */
  function meanderingRiver() {
    const left: [number, number][] = [],
      right: [number, number][] = [];
    for (let x = 0; x <= 30000; x += 7) {
      const y = 900 * Math.sin(x / 700) + 300 * Math.sin(x / 113);
      const half = 20 + 15 * Math.sin(x / 1900);
      left.push([x, y + half]);
      right.push([x, y - half]);
    }
    const ring = [...right, ...left.reverse()];
    const references = ring.map((_, i) => ({
      side: i < right.length ? ("right" as const) : ("left" as const),
      arcStart: i,
      arcEnd: i + 1
    }));
    const island: [number, number][] = [];
    for (let a = 0; a < 2 * Math.PI; a += Math.PI / 24)
      island.push([5000 + 6 * Math.cos(a), 900 * Math.sin(5000 / 700) + 300 * Math.sin(5000 / 113) + 3 * Math.sin(a)]);
    return { id: 7, rings: [ring, island], bankReferences: [references, island.map(() => null)] };
  }
  const deepFreeze = (water: ReturnType<typeof meanderingRiver>) =>
    Object.freeze({
      id: water.id,
      rings: Object.freeze(water.rings.map(r => Object.freeze(r.map(p => Object.freeze([p[0], p[1]] as const))))),
      bankReferences: Object.freeze(water.bankReferences.map(r => Object.freeze(r.map(v => v && Object.freeze(v)))))
    });

  it("returns exactly the full-scan section for frozen water", () => {
    const mutable = meanderingRiver();
    const frozen = deepFreeze(meanderingRiver());
    let seed = 12345;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let resolved = 0;
    for (let n = 0; n < 600; n++) {
      const x = 50 + random() * 29900;
      const q: [number, number] = [x, 900 * Math.sin(x / 700) + 300 * Math.sin(x / 113) + (random() - 0.5) * 20];
      const angle = random() * 2 * Math.PI;
      const normal: [number, number] = [Math.cos(angle), Math.sin(angle)];
      const expected = normalWaterSection(q, normal, mutable);
      expect(normalWaterSection(q, normal, frozen)).toEqual(expected);
      if (expected) resolved++;
    }
    expect(resolved).toBeGreaterThan(300);
  });

  it("classifies points exactly like the full scan, including bank contact", () => {
    const mutable = meanderingRiver();
    const frozen = deepFreeze(meanderingRiver());
    let seed = 777;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    let inside = 0;
    for (let n = 0; n < 3000; n++) {
      const ring = mutable.rings[n % 7 === 0 ? 1 : 0];
      const k = Math.floor(random() * ring.length);
      const a = ring[k],
        b = ring[(k + 1) % ring.length];
      const t = random();
      // Points on a bank, within the tolerance of it, or anywhere around the river.
      const offset = [0, epsilon * 0.5, epsilon * 3, 0.01, 5, 60][n % 6] * (random() < 0.5 ? -1 : 1);
      const point: [number, number] =
        n % 5 === 4
          ? [random() * 30000, (random() - 0.5) * 2600]
          : [a[0] + (b[0] - a[0]) * t + offset, a[1] + (b[1] - a[1]) * t - offset];
      const expected = pointInWater(point, mutable);
      expect(pointInWater(point, frozen)).toBe(expected);
      if (expected) inside++;
    }
    expect(inside).toBeGreaterThan(500);
  });
});
