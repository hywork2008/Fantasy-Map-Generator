import { afterEach, describe, expect, it } from "vitest";
import { DETERMINISTIC_MATH, installDeterministicMath, pow, uninstallDeterministicMath } from "./deterministicMath";

type Name = keyof typeof DETERMINISTIC_MATH;
const NATIVE = Object.fromEntries(Object.keys(DETERMINISTIC_MATH).map(name => [name, (Math as never)[name]])) as Record<
  Name,
  (...args: number[]) => number
>;
const BINARY = new Set<Name>(["atan2", "pow", "hypot"]);
const SPECIALS = [
  0,
  -0,
  1,
  -1,
  0.5,
  -0.5,
  2,
  Infinity,
  -Infinity,
  NaN,
  Number.MIN_VALUE,
  Number.MAX_VALUE,
  1e-300,
  710,
  -745
];

/** Distance in units in the last place (0 = identical double). */
function ulps(a: number, b: number): number {
  if (Object.is(a, b)) return 0;
  if (!Number.isFinite(a) || !Number.isFinite(b)) return Infinity;
  const view = new DataView(new ArrayBuffer(16));
  view.setFloat64(0, a);
  view.setFloat64(8, b);
  return Math.abs(Number(view.getBigInt64(0) - view.getBigInt64(8)));
}

afterEach(() => uninstallDeterministicMath());

describe("deterministic Math", () => {
  it("keeps Math semantics for special values", () => {
    for (const name of Object.keys(DETERMINISTIC_MATH) as Name[]) {
      for (const a of SPECIALS) {
        const bs = BINARY.has(name) ? SPECIALS : [undefined];
        for (const b of bs) {
          const args = b === undefined ? [a] : [a, b];
          const expected = NATIVE[name](...args);
          const actual = DETERMINISTIC_MATH[name](...(args as [number, number]));
          if (Number.isNaN(expected) || !Number.isFinite(expected) || expected === 0)
            expect(Object.is(actual, expected) || (expected === 0 && actual === 0), `${name}(${args})`).toBe(true);
          else expect(ulps(actual, expected), `${name}(${args})`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it("stays within 2 ulps of the engine on ordinary inputs", () => {
    let seed = 7;
    const next = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (const name of Object.keys(DETERMINISTIC_MATH) as Name[]) {
      for (let i = 0; i < 2000; i++) {
        const a = name === "asin" || name === "acos" ? next() * 2 - 1 : (next() - 0.3) * 40;
        const b = (next() - 0.5) * 8;
        const args = BINARY.has(name) ? [Math.abs(a), b] : [name.startsWith("log") ? Math.abs(a) : a];
        expect(
          ulps(DETERMINISTIC_MATH[name](...(args as [number, number])), NATIVE[name](...args)),
          `${name}(${args})`
        ).toBeLessThanOrEqual(2);
      }
    }
    expect(DETERMINISTIC_MATH.hypot(3, 4, 12)).toBe(13);
    expect(DETERMINISTIC_MATH.hypot()).toBe(0);
  });

  it("installs over Math and restores the engine's functions", () => {
    installDeterministicMath();
    expect(Math.sin).toBe(DETERMINISTIC_MATH.sin);
    expect(Math.pow).toBe(pow);
    uninstallDeterministicMath();
    expect(Math.sin).toBe(NATIVE.sin);
  });
});
