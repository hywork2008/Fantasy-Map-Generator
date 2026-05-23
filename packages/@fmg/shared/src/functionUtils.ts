/**
 * Regroup an array of values by multiple keys and reduce each group
 * @param {Array} values - The array of values to regroup
 * @param {Function} reduce - The reduce function to apply to each group
 * @param  {...Function} keys - The key functions to group by
 * @returns {Map} - The regrouped and reduced Map
 *
 * @example
 * const data = [
 *   {category: 'A', type: 'X', value: 10},
 *   {category: 'A', type: 'Y', value: 20},
 *   {category: 'B', type: 'X', value: 30},
 *   {category: 'B', type: 'Y', value: 40},
 * ];
 * const result = rollups(
 *   data,
 *   v => v.reduce((sum, d) => sum + d.value, 0),
 *   d => d.category,
 *   d => d.type
 * );
 * // result is a Map with structure:
 * // Map {
 * //   'A' => Map { 'X' => 10, 'Y' => 20 },
 * //   'B' => Map { 'X' => 30, 'Y' => 40 }
 * // }
 */
export const rollups = <T, R>(
  values: T[],
  reduce: (values: T[]) => R,
  ...keys: ((value: T, index: number, array: T[]) => unknown)[]
): RollupResult<R> => {
  return nest(values, Array.from, reduce, keys);
};

type RollupResult<R> = Array<[unknown, R | RollupResult<R>]>;

const nest = <T, R>(
  values: T[],
  map: <V>(iterable: Iterable<[unknown, V]>) => Array<[unknown, V]>,
  reduce: (values: T[]) => R,
  keys: ((value: T, index: number, array: T[]) => unknown)[]
): RollupResult<R> => {
  return (function regroup(values: T[], i: number): R | RollupResult<R> {
    if (i >= keys.length) return reduce(values);
    const groups = new Map<unknown, T[]>();
    const keyof = keys[i++];
    let index = -1;
    for (const value of values) {
      const key = keyof(value, ++index, values);
      const group = groups.get(key);
      if (group) group.push(value);
      else groups.set(key, [value]);
    }
    const reduced = new Map<unknown, R | RollupResult<R>>();
    for (const [key, groupedValues] of groups) {
      reduced.set(key, regroup(groupedValues, i));
    }
    return map(reduced);
  })(values, 0) as RollupResult<R>;
};

/**
 * Calculate squared distance between two points
 * @param {[number, number]} p1 - First point [x1, y1]
 * @param {[number, number]} p2 - Second point [x2, y2]
 * @returns {number} - Squared distance between p1 and p2
 */
export const distanceSquared = ([x1, y1]: [number, number], [x2, y2]: [number, number]) => {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
};
declare global {
  interface Window {
    rollups: typeof rollups;
    dist2: typeof distanceSquared;
  }
}
