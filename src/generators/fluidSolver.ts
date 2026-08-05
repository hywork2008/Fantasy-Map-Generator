/**
 * Generic 2D incompressible-flow engine: a D2Q9 Lattice Boltzmann Method (LBM) solver operating
 * on a flat, row-major raster (`index = y*width + x`). Deterministic (no RNG), with no knowledge
 * of maps, heightmaps, or oceans — pure lattice mechanics, reusable by any caller that needs a
 * real (mass-conserving) 2D flow field shaped by solid obstacles and a driving body force.
 *
 * LBM recovers incompressible Navier-Stokes in the low-Mach-number limit: it is a genuine
 * numerical CFD method (Chen & Doolen 1998; see also Mohamad, "Lattice Boltzmann Method"), not a
 * heuristic. Its key property for this codebase's use case: solid obstacles are handled by local
 * bounce-back at the obstacle node itself — no global pressure Poisson solve is needed, unlike
 * classic semi-Lagrangian/projection solvers (e.g. Stam's "Stable Fluids"). Because a bounce-back
 * boundary can never absorb or destroy fluid, mass conservation forces flow that is blocked
 * head-on by an obstacle to redirect tangentially along it instead of dissipating — the mechanism
 * that produces long, coherent along-shore "boundary currents" once this solver is driven by
 * `oceanCurrents.ts` with land as the obstacle field.
 *
 * Boundary condition: **periodic** in both axes. This is a standard, numerically well-behaved LBM
 * boundary treatment (avoids open inflow/outflow edge cases entirely) — a disclosed simplification
 * (the raster wraps for flow purposes only), not a shortcut in the collision/streaming physics
 * itself.
 *
 * Numerical stability: `relaxationTime` (tau) must stay above 0.5 (BGK is unconditionally unstable
 * at or below that) — values noticeably above 0.5 (e.g. 0.6-1.0) trade some "sharpness" for
 * stability headroom and are the conventional choice for this kind of driven, dissipative flow.
 *
 * Linear drag: BGK viscosity only dissipates velocity *gradients* (shear) — a perfectly uniform,
 * unobstructed, uniformly-forced region has no gradient to dissipate, so momentum would otherwise
 * grow without bound instead of reaching a steady state (Newton's second law with no friction).
 * `step()`/`run()` take an optional `drag` coefficient that subtracts `drag * u` from the applied
 * force every iteration, giving every driven cell a genuine equilibrium at `u = force / drag`
 * once the drag term balances the driving force. This is a standard, textbook closure for
 * wind-driven flow (linear/Rayleigh bottom friction — see e.g. Stommel's classic wind-driven gyre
 * model), not a simulation-specific hack.
 */

/** D2Q9 lattice velocity set: index 0 is the rest particle, 1-4 are axis directions, 5-8 are diagonals. */
const CX: readonly number[] = [0, 1, 0, -1, 0, 1, -1, -1, 1];
const CY: readonly number[] = [0, 0, 1, 0, -1, 1, 1, -1, -1];

/** D2Q9 equilibrium weights, matching CX/CY index-for-index. */
const WEIGHTS: readonly number[] = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];

/** Lattice speed of sound squared (1/3 for D2Q9); used by the equilibrium/forcing formulas below. */
const CS2 = 1 / 3;

// Precomputed reciprocals of CS2 (multiplication is measurably cheaper than division in a loop
// run millions of times per solve): 1/CS2 = 3, 1/(2*CS2^2) = 4.5, 1/(2*CS2) = 1.5.
const INV_CS2 = 1 / CS2;
const INV_2_CS2_SQ = 1 / (2 * CS2 * CS2);
const INV_2_CS2 = 1 / (2 * CS2);

export interface FluidLattice {
  readonly width: number;
  readonly height: number;
  /** 9 particle distribution function arrays (one per D2Q9 direction), each `width*height` long. */
  f: Float32Array[];
  /** Macroscopic velocity, x component. Valid only for non-obstacle cells after `step()`/`run()`. */
  ux: Float32Array;
  /** Macroscopic velocity, y component. Valid only for non-obstacle cells after `step()`/`run()`. */
  uy: Float32Array;
  /** Macroscopic density. Valid only for non-obstacle cells after `step()`/`run()`. */
  rho: Float32Array;
  /** 1 = solid (full bounce-back, no flow), 0 = open fluid cell. */
  obstacle: Uint8Array;
  /** Per-cell driving body force, x component (lattice units). */
  forceX: Float32Array;
  /** Per-cell driving body force, y component (lattice units). */
  forceY: Float32Array;
}

/** Allocates a `width*height` lattice at rest (uniform density 1, zero velocity, no obstacles/forcing). */
export function createLattice(width: number, height: number): FluidLattice {
  const n = width * height;
  const f = WEIGHTS.map(w => new Float32Array(n).fill(w)); // rho=1, u=0 equilibrium at every cell
  return {
    width,
    height,
    f,
    ux: new Float32Array(n),
    uy: new Float32Array(n),
    rho: new Float32Array(n).fill(1),
    obstacle: new Uint8Array(n),
    forceX: new Float32Array(n),
    forceY: new Float32Array(n)
  };
}

export function setObstacle(lattice: FluidLattice, x: number, y: number, isSolid: boolean): void {
  lattice.obstacle[y * lattice.width + x] = isSolid ? 1 : 0;
}

// Streaming needs a second buffer to write into while reading the current one. Keyed by lattice
// identity (rather than stored on `FluidLattice` itself) so the public interface stays free of
// this implementation detail. Allocated once per lattice and reused every iteration via a swap —
// allocating 9 fresh `Float32Array`s per `step()` call was the dominant cost at production grid
// sizes (multi-second GC pressure over hundreds of iterations).
const scratchBuffers = new WeakMap<FluidLattice, Float32Array[]>();

function getScratch(lattice: FluidLattice): Float32Array[] {
  let scratch = scratchBuffers.get(lattice);
  if (!scratch) {
    scratch = WEIGHTS.map(() => new Float32Array(lattice.width * lattice.height));
    scratchBuffers.set(lattice, scratch);
  }
  return scratch;
}

export function setForce(lattice: FluidLattice, x: number, y: number, fx: number, fy: number): void {
  const idx = y * lattice.width + x;
  lattice.forceX[idx] = fx;
  lattice.forceY[idx] = fy;
}

/**
 * One full collision + bounce-back + streaming iteration.
 *
 * Obstacle cells skip collision entirely and instead swap each direction's distribution with its
 * opposite in place ("on-site" bounce-back — see Mohamad, ch. 3) — the standard, simplest correct
 * way to impose a no-penetration solid wall in LBM: whatever arrived from a given direction is
 * sent straight back the way it came, one step later, by the streaming pass below.
 *
 * Fluid cells collide via single-relaxation-time BGK toward the local equilibrium distribution,
 * plus a Guo et al. (2002) forcing term so the body force (`forceX`/`forceY`) actually accelerates
 * the fluid rather than just biasing the equilibrium. `drag` (see module doc comment) is
 * subtracted from the effective force in proportion to the cell's own current velocity, giving
 * driven regions a genuine steady state instead of accelerating forever.
 */
export function step(lattice: FluidLattice, relaxationTime: number, drag = 0): void {
  const { width, height, f, ux, uy, rho, obstacle, forceX, forceY } = lattice;
  const n = width * height;
  const invTau = 1 / relaxationTime;
  const forceCoeff = 1 - 0.5 * invTau;

  for (let idx = 0; idx < n; idx++) {
    if (obstacle[idx]) {
      const f1 = f[1][idx];
      const f2 = f[2][idx];
      const f3 = f[3][idx];
      const f4 = f[4][idx];
      const f5 = f[5][idx];
      const f6 = f[6][idx];
      const f7 = f[7][idx];
      const f8 = f[8][idx];
      f[1][idx] = f3;
      f[3][idx] = f1;
      f[2][idx] = f4;
      f[4][idx] = f2;
      f[5][idx] = f7;
      f[7][idx] = f5;
      f[6][idx] = f8;
      f[8][idx] = f6;
      ux[idx] = 0;
      uy[idx] = 0;
      rho[idx] = 0;
      continue;
    }

    let rhoLocal = 0;
    let mx = 0;
    let my = 0;
    for (let k = 0; k < 9; k++) {
      const fk = f[k][idx];
      rhoLocal += fk;
      mx += fk * CX[k];
      my += fk * CY[k];
    }

    // Drag (see module doc comment) is evaluated against the pre-force velocity estimate to
    // avoid a circular dependency on the very velocity it's meant to damp — standard for an
    // explicit per-iteration friction term.
    const preForceUx = mx / rhoLocal;
    const preForceUy = my / rhoLocal;
    const fx = forceX[idx] - drag * preForceUx;
    const fy = forceY[idx] - drag * preForceUy;
    // Guo forcing: the macroscopic velocity itself is shifted by half the applied force so the
    // force's effect is centered on this timestep rather than lagging by one.
    const uxLocal = (mx + 0.5 * fx) / rhoLocal;
    const uyLocal = (my + 0.5 * fy) / rhoLocal;
    rho[idx] = rhoLocal;
    ux[idx] = uxLocal;
    uy[idx] = uyLocal;

    const usq = uxLocal * uxLocal + uyLocal * uyLocal;
    for (let k = 0; k < 9; k++) {
      const cx = CX[k];
      const cy = CY[k];
      const w = WEIGHTS[k];
      const cu = cx * uxLocal + cy * uyLocal;
      const feq = w * rhoLocal * (1 + cu * INV_CS2 + cu * cu * INV_2_CS2_SQ - usq * INV_2_CS2);
      const forceTerm =
        forceCoeff *
        w *
        (((cx - uxLocal) * INV_CS2 + cu * cx * INV_2_CS2_SQ * 2) * fx +
          ((cy - uyLocal) * INV_CS2 + cu * cy * INV_2_CS2_SQ * 2) * fy);
      f[k][idx] = f[k][idx] - invTau * (f[k][idx] - feq) + forceTerm;
    }
  }

  // Streaming: shift each direction's post-collision value to its downstream neighbor, wrapping
  // both axes (periodic boundary — see module doc comment). Writes into the persistent scratch
  // buffer and swaps it in, rather than allocating fresh arrays every iteration. Wrapped
  // neighbor coordinates are resolved once per row/cell via a branch (cheaper than `% width`
  // millions of times per solve) rather than through the generic per-direction CX/CY loop.
  const next = getScratch(lattice);
  const [n0, n1, n2, n3, n4, n5, n6, n7, n8] = next;
  const [f0, f1, f2, f3, f4, f5, f6, f7, f8] = f;
  for (let y = 0; y < height; y++) {
    const yUp = y === height - 1 ? 0 : y + 1;
    const yDown = y === 0 ? height - 1 : y - 1;
    const rowBase = y * width;
    const rowUpBase = yUp * width;
    const rowDownBase = yDown * width;
    for (let x = 0; x < width; x++) {
      const idx = rowBase + x;
      const xRight = x === width - 1 ? 0 : x + 1;
      const xLeft = x === 0 ? width - 1 : x - 1;

      n0[idx] = f0[idx];
      n1[rowBase + xRight] = f1[idx];
      n2[rowUpBase + x] = f2[idx];
      n3[rowBase + xLeft] = f3[idx];
      n4[rowDownBase + x] = f4[idx];
      n5[rowUpBase + xRight] = f5[idx];
      n6[rowUpBase + xLeft] = f6[idx];
      n7[rowDownBase + xLeft] = f7[idx];
      n8[rowDownBase + xRight] = f8[idx];
    }
  }
  for (let k = 0; k < 9; k++) {
    const tmp = lattice.f[k];
    lattice.f[k] = next[k];
    next[k] = tmp;
  }
}

/** Runs `step()` repeatedly to advance the lattice toward a (near-)steady state. */
export function run(lattice: FluidLattice, iterations: number, relaxationTime: number, drag = 0): void {
  for (let i = 0; i < iterations; i++) step(lattice, relaxationTime, drag);
}
