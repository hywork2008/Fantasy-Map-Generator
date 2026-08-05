import { describe, expect, it } from "vitest";
import { createLattice, run, setForce, setObstacle, step } from "./fluidSolver";

const TAU = 0.7;
const DRAG = 0.02;

describe("fluidSolver", () => {
  it("drives an open (obstacle-free) lattice toward a steady velocity aligned with a uniform force", () => {
    const width = 16;
    const height = 16;
    const lattice = createLattice(width, height);

    const force = 0.0012;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        setForce(lattice, x, y, force, 0);
      }
    }

    run(lattice, 400, TAU, DRAG);

    // Fully open, uniformly forced, periodic domain: every cell should converge to (nearly) the
    // same velocity, pointing in the force direction (+x), with negligible y-component, and close
    // to the theoretical steady state (force / drag) that linear drag provides an equilibrium for.
    const theoreticalSteady = force / DRAG;
    for (let i = 0; i < width * height; i++) {
      expect(lattice.ux[i]).toBeGreaterThan(0);
      expect(Math.abs(lattice.uy[i])).toBeLessThan(lattice.ux[i] * 0.05);
      expect(Math.abs(lattice.ux[i] - theoreticalSteady)).toBeLessThan(theoreticalSteady * 0.1);
    }

    const first = lattice.ux[0];
    for (let i = 1; i < width * height; i++) {
      expect(Math.abs(lattice.ux[i] - first)).toBeLessThan(Math.abs(first) * 0.05);
    }
  });

  it("without drag, a uniformly-forced open lattice keeps accelerating instead of settling", () => {
    // BGK viscosity only dissipates velocity *gradients*; a perfectly uniform forced region has
    // none, so with no drag term there is nothing to balance the driving force at all — velocity
    // at 400 iterations should be measurably larger than at 100, unlike the drag case above.
    const build = () => {
      const lattice = createLattice(10, 10);
      for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) setForce(lattice, x, y, 0.0008, 0);
      return lattice;
    };

    const early = build();
    run(early, 100, TAU);
    const late = build();
    run(late, 400, TAU);

    expect(late.ux[55]).toBeGreaterThan(early.ux[55] * 2);
  });

  it("scales steady velocity up with a larger driving force", () => {
    const steadyUx = (force: number) => {
      const lattice = createLattice(10, 10);
      for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) setForce(lattice, x, y, force, 0);
      run(lattice, 400, TAU, DRAG);
      return lattice.ux[55];
    };

    expect(steadyUx(0.002)).toBeGreaterThan(steadyUx(0.0005));
  });

  it("never assigns velocity to an obstacle cell — it is skipped by collision entirely", () => {
    const lattice = createLattice(8, 8);
    setObstacle(lattice, 4, 4, true);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) setForce(lattice, x, y, 0.001, 0);

    run(lattice, 50, TAU, DRAG);

    const idx = 4 * 8 + 4;
    expect(lattice.ux[idx]).toBe(0);
    expect(lattice.uy[idx]).toBe(0);
  });

  it("redirects flow tangentially along a wall instead of only damping it head-on", () => {
    // A horizontal wall spanning the full width except a single gap column, with forcing
    // pushing straight into the wall (+y). Mass conservation means fluid held back by the solid
    // wall segments must develop a lateral (x) velocity component toward the gap — the same
    // "blocked flow redirects along the obstacle" mechanism the ocean-current solve depends on
    // for boundary currents.
    const width = 16;
    const height = 16;
    const wallRow = 8;
    const gapX = 8;
    const lattice = createLattice(width, height);

    for (let x = 0; x < width; x++) {
      if (x !== gapX) setObstacle(lattice, x, wallRow, true);
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        setForce(lattice, x, y, 0, 0.0012);
      }
    }

    run(lattice, 400, TAU, DRAG);

    // Just upstream of the wall, a few columns away from the gap, flow should show a measurable
    // sideways pull toward the gap (positive ux left of the gap, negative ux right of it) —
    // redirection, not just speed loss.
    const upstreamRow = wallRow - 1;
    const leftOfGap = lattice.ux[upstreamRow * width + (gapX - 3)];
    const rightOfGap = lattice.ux[upstreamRow * width + (gapX + 3)];
    expect(leftOfGap).toBeGreaterThan(0);
    expect(rightOfGap).toBeLessThan(0);
  });

  it("is deterministic for identical inputs", () => {
    const build = () => {
      const lattice = createLattice(10, 10);
      setObstacle(lattice, 5, 5, true);
      for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) setForce(lattice, x, y, 0.0009, 0.0004);
      return lattice;
    };

    const a = build();
    run(a, 120, TAU, DRAG);
    const b = build();
    run(b, 120, TAU, DRAG);

    expect(Array.from(a.ux)).toEqual(Array.from(b.ux));
    expect(Array.from(a.uy)).toEqual(Array.from(b.uy));
  });

  it("step() advances exactly one iteration (run() with n=1 matches a single step() call)", () => {
    const a = createLattice(6, 6);
    setForce(a, 2, 2, 0.001, 0.0005);
    const b = createLattice(6, 6);
    setForce(b, 2, 2, 0.001, 0.0005);

    step(a, TAU, DRAG);
    run(b, 1, TAU, DRAG);

    expect(Array.from(a.ux)).toEqual(Array.from(b.ux));
    expect(Array.from(a.uy)).toEqual(Array.from(b.uy));
  });
});
