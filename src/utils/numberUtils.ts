/**
 * Rounds a number to a specified number of decimal places.
 * @param v - The number to be rounded.
 * @param d - The number of decimal places to round to (default is 0).
 * @returns The rounded number.
 */
export const rn = (v: number, d: number = 0) => {
  const m = 10 ** d;
  return Math.round(v * m) / m;
};

/**
 * Clamps a number between a minimum and maximum value.
 * @param value - The number to be clamped.
 * @param min - The minimum value.
 * @param max - The maximum value.
 * @returns The clamped number.
 */
export const minmax = (value: number, min: number, max: number) => {
  return Math.min(Math.max(value, min), max);
};

/**
 * Clamps a number between 0 and 100.
 * @param v - The number to be clamped.
 * @returns The clamped number.
 */
export const lim = (v: number) => {
  return minmax(v, 0, 100);
};

/**
 * Normalizes a number within a specified range to a value between 0 and 1.
 * @param val - The number to be normalized.
 * @param min - The minimum value of the range.
 * @param max - The maximum value of the range.
 * @returns The normalized number.
 */
export const normalize = (val: number, min: number, max: number) => {
  return minmax((val - min) / (max - min), 0, 1);
};

/**
 * Performs linear interpolation between two values.
 * @param a - The starting value.
 * @param b - The ending value.
 * @param t - The interpolation factor (between 0 and 1).
 * @returns The interpolated value.
 */
export const lerp = (a: number, b: number, t: number) => {
  return a + (b - a) * t;
};

/**
 * Rounds each value to a whole number so the parts sum to exactly `Math.round(total)`,
 * using the largest-remainder method. Use this whenever a set of fractional parts (e.g.
 * per-category breakdowns of a continuously-simulated count) and their total are displayed
 * side by side — rounding each part independently makes the displayed parts fail to add up
 * to the displayed total whenever the raw sum has drifted from `total` (accumulated
 * floating-point error from repeated in-place scaling) or a part's fraction rounds the
 * "wrong" way in isolation.
 * @param values - The raw (possibly fractional) parts.
 * @param total - The target sum the rounded parts must add up to.
 * @returns Whole-number parts, same length/order as `values`, summing to `Math.round(total)`.
 */
export const integerizeToTotal = (values: number[], total: number): number[] => {
  const target = Math.round(total);
  const floors = values.map(v => Math.max(0, Math.floor(v)));
  const remainders = values.map((v, i) => ({ i, r: v - Math.floor(v) }));
  let diff = target - floors.reduce((s, v) => s + v, 0);
  if (remainders.length === 0) return floors;

  if (diff > 0) {
    // Largest-remainder-first, round-robin so a diff bigger than values.length still
    // resolves (spreads evenly instead of stopping after one pass).
    remainders.sort((a, b) => b.r - a.r);
    for (let k = 0; diff > 0; k++, diff--) floors[remainders[k % remainders.length].i]++;
  } else if (diff < 0) {
    remainders.sort((a, b) => a.r - b.r);
    let stalled = 0;
    for (let k = 0; diff < 0 && stalled < remainders.length; k++) {
      const idx = remainders[k % remainders.length].i;
      if (floors[idx] <= 0) {
        stalled++;
        continue;
      }
      floors[idx]--;
      diff++;
      stalled = 0;
    }
  }

  return floors;
};
