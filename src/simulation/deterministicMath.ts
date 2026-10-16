import acos from "@stdlib/math-base-special-acos";
import asin from "@stdlib/math-base-special-asin";
import asinh from "@stdlib/math-base-special-asinh";
import atan from "@stdlib/math-base-special-atan";
import atan2 from "@stdlib/math-base-special-atan2";
import cbrt from "@stdlib/math-base-special-cbrt";
import cos from "@stdlib/math-base-special-cos";
import exp from "@stdlib/math-base-special-exp";
import expm1 from "@stdlib/math-base-special-expm1";
import hypot from "@stdlib/math-base-special-hypot";
import ln from "@stdlib/math-base-special-ln";
import log1p from "@stdlib/math-base-special-log1p";
import log2 from "@stdlib/math-base-special-log2";
import log10 from "@stdlib/math-base-special-log10";
import stdlibPow from "@stdlib/math-base-special-pow";
import sin from "@stdlib/math-base-special-sin";
import tan from "@stdlib/math-base-special-tan";

/**
 * Deterministic transcendental functions (docs/plan/simulation-core-separation.md §21).
 *
 * Engines may return different last bits for `Math.exp`, `Math.sin`, `Math.pow`, … (Chromium's
 * V8 and Node's V8 do). The stdlib ports of FreeBSD msun / fdlibm below use only IEEE-754
 * `+ - * /` and `Math.sqrt` (correctly rounded everywhere), so every engine computes the same
 * double. The simulation host installs them over `Math.*`; the `**` operator cannot be patched,
 * so simulation-core code calls `pow()` instead (enforced by `lint:sim-boundary`).
 */

/**
 * `Math.pow` / `**` with the ECMAScript special cases (Number::exponentiate), which stdlib's
 * C-style pow does not all follow (e.g. `pow(NaN, 0)`, `pow(1, Infinity)`, `pow(0, 5e-324)`).
 * The deterministic kernel only ever sees a finite positive base and a finite exponent.
 */
export function pow(base: number, exponent: number): number {
  base = +base;
  exponent = +exponent;
  if (Number.isNaN(exponent)) return NaN;
  if (exponent === 0) return 1;
  if (Number.isNaN(base)) return NaN;
  const oddInteger = Number.isInteger(exponent) && exponent % 2 !== 0;
  if (base === Infinity) return exponent > 0 ? Infinity : 0;
  if (base === -Infinity) {
    if (exponent > 0) return oddInteger ? -Infinity : Infinity;
    return oddInteger ? -0 : 0;
  }
  if (base === 0) {
    if (Object.is(base, -0) && oddInteger) return exponent > 0 ? -0 : -Infinity;
    return exponent > 0 ? 0 : Infinity;
  }
  if (!Number.isFinite(exponent)) {
    const magnitude = Math.abs(base);
    if (magnitude === 1) return NaN;
    return magnitude > 1 === exponent > 0 ? Infinity : 0;
  }
  if (base < 0) {
    if (!Number.isInteger(exponent)) return NaN;
    const magnitude = stdlibPow(-base, exponent);
    return oddInteger ? -magnitude : magnitude;
  }
  return stdlibPow(base, exponent);
}

/** Variadic `Math.hypot` on top of the two-argument deterministic kernel. */
function hypotN(...values: number[]): number {
  if (values.length === 2) return hypot(values[0], values[1]);
  if (values.length === 0) return 0;
  let result = Math.abs(+values[0]);
  for (let i = 1; i < values.length; i++) result = hypot(result, +values[i]);
  return result;
}

export const DETERMINISTIC_MATH = {
  acos,
  asin,
  asinh,
  atan,
  atan2,
  cbrt,
  cos,
  exp,
  expm1,
  hypot: hypotN,
  log: ln,
  log1p,
  log2,
  log10,
  pow,
  sin,
  tan
} as const;

type MathName = keyof typeof DETERMINISTIC_MATH;
let native: Partial<Record<MathName, unknown>> | null = null;

/** Replaces the engine's `Math.*` with the deterministic versions (idempotent). */
export function installDeterministicMath(): void {
  if (native) return;
  const target = Math as unknown as Record<MathName, unknown>;
  native = {};
  for (const name of Object.keys(DETERMINISTIC_MATH) as MathName[]) {
    native[name] = target[name];
    target[name] = DETERMINISTIC_MATH[name];
  }
}

/** Restores the engine's `Math.*` (tests). */
export function uninstallDeterministicMath(): void {
  if (!native) return;
  const target = Math as unknown as Record<MathName, unknown>;
  for (const [name, fn] of Object.entries(native)) target[name as MathName] = fn;
  native = null;
}
