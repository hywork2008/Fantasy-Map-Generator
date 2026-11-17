import { describe, expect, it } from "vitest";
import {
  createValleyField,
  DEFAULT_VALLEY_TUNING,
  sampleValleyRivers,
  type ValleyRiverPoint,
  valleyDimensions,
  valleyWallFraction
} from "./valleyProfile";

describe("valleyWallFraction", () => {
  it("runs from 0 at the floor edge to 1 at the ridge, never falling", () => {
    for (const gorge of [false, true]) {
      expect(valleyWallFraction(-1, gorge)).toBe(0);
      expect(valleyWallFraction(2, gorge)).toBe(1);
      let prev = 0;
      for (let t = 0; t <= 1.0001; t += 0.01) {
        const v = valleyWallFraction(t, gorge);
        expect(v).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });
});

describe("valleyDimensions", () => {
  it("uses the elevation default on flat ground and caps the depth", () => {
    const flat = valleyDimensions({ groundM: 100, reliefLeftM: 0, reliefRightM: 0, riverWidthM: 50 });
    expect(flat.depthM).toBeCloseTo(71);
    expect(flat.gorge).toBe(false);
    const high = valleyDimensions({ groundM: 3000, reliefLeftM: 2000, reliefRightM: 2000, riverWidthM: 50 });
    expect(high.depthM).toBe(800);
    expect(high.gorge).toBe(true);
    expect(high.wallM).toBe(2700);
  });

  it("narrows the side with less relief, within the measured ratio", () => {
    const d = valleyDimensions({ groundM: 800, reliefLeftM: 200, reliefRightM: 800, riverWidthM: 50 });
    expect(d.wallRightM).toBe(d.wallM);
    expect(d.wallLeftM).toBeLessThan(d.wallM);
    expect(d.wallM / d.wallLeftM).toBeLessThanOrEqual(1.6 + 1e-9);
    const plain = valleyDimensions(
      { groundM: 800, reliefLeftM: 200, reliefRightM: 800, riverWidthM: 50 },
      {
        ...DEFAULT_VALLEY_TUNING,
        spurs: false
      }
    );
    expect(plain.wallLeftM).toBe(plain.wallM);
  });

  it("keeps the floor above sea level", () => {
    const low = valleyDimensions({ groundM: 20, reliefLeftM: 500, reliefRightM: 500, riverWidthM: 50 });
    expect(20 - low.depthM).toBeGreaterThanOrEqual(1);
  });
});

describe("createValleyField", () => {
  // River runs east along y = 0 over a mountain slope rising to the east with a bump at x = 6 km.
  const ground = (x: number, y: number) => 1500 - x * 0.05 + Math.abs(y) * 0.02 + (Math.abs(x - 6000) < 500 ? 120 : 0);
  const river: ValleyRiverPoint[] = [];
  for (let x = 0; x <= 12000; x += 500)
    river.push({ x, y: 0, groundM: ground(x, 0), reliefLeftM: 600, reliefRightM: 400, riverWidthM: 40 });
  const field = createValleyField([river], ground);

  it("leaves ground outside the valley unchanged", () => {
    const y = field.maxReachM + 1;
    for (const x of [0, 3000, 6000, 12000]) expect(field.valleyMetersAt(x, y)).toBe(ground(x, y));
    expect(field.valleyMetersAt(-field.maxReachM - 1, 0)).toBe(ground(-field.maxReachM - 1, 0));
  });

  it("never raises the ground", () => {
    for (let x = -1000; x <= 13000; x += 700)
      for (let y = -6000; y <= 6000; y += 450) expect(field.valleyMetersAt(x, y)).toBeLessThanOrEqual(ground(x, y));
  });

  it("keeps the floor non-increasing downstream across the bump", () => {
    for (let i = 1; i < field.floors[0].length; i++)
      expect(field.floors[0][i]).toBeLessThanOrEqual(field.floors[0][i - 1]);
    let prev = Infinity;
    for (let x = 0; x <= 12000; x += 100) {
      const h = field.valleyMetersAt(x, 0);
      expect(h).toBeLessThanOrEqual(prev + 1e-9);
      prev = h;
    }
  });

  it("is continuous across the floor edge and the ridge", () => {
    const step = 1;
    let prev = field.valleyMetersAt(3000, 0);
    for (let y = step; y <= field.maxReachM + 100; y += step) {
      const h = field.valleyMetersAt(3000, y);
      expect(Math.abs(h - prev)).toBeLessThan(2);
      prev = h;
    }
  });
});

describe("sampleValleyRivers", () => {
  it("orders the river downhill and reads the relief on both sides", () => {
    // Ground falls to the east and rises 0.1 m per meter away from y = 0.
    const ground = (x: number, y: number) => 1000 - x * 0.01 + Math.abs(y) * 0.1;
    const [river] = sampleValleyRivers(
      [
        {
          points: [
            [10000, 0],
            [0, 0]
          ],
          widths: [40, 20]
        }
      ],
      ground,
      {
        stepM: 250,
        probeM: 2000
      }
    );
    expect(river[0].x).toBe(0);
    expect(river[river.length - 1].x).toBe(10000);
    expect(river.length).toBe(41);
    expect(river[0].reliefLeftM).toBeCloseTo(200);
    expect(river[0].reliefRightM).toBeCloseTo(200);
  });
});
