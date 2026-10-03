import { rn } from "./numberUtils";

/** Existing FMG shape/width rules, shared without a mutable Rivers singleton. */
export function meanderRiverPoints(
  input: {
    cells: readonly number[];
    points: readonly (readonly [number, number])[];
    flux: ArrayLike<number>;
    heights: ArrayLike<number>;
  },
  meandering = 0.5
): [number, number, number][] {
  const { cells, points, flux, heights } = input;
  const result: [number, number, number][] = [];
  let step = heights[cells[0]] < 20 ? 1 : 10;
  for (let i = 0; i < points.length; i++, step++) {
    const cell = cells[i],
      [x1, y1] = points[i];
    result.push([x1, y1, flux[cell]]);
    if (i === points.length - 1) break;
    const [x2, y2] = points[i + 1];
    if (cells[i + 1] === -1) {
      result.push([x2, y2, flux[cell]]);
      break;
    }
    const distanceSquared = (x2 - x1) ** 2 + (y2 - y1) ** 2;
    if (distanceSquared <= 25 && cells.length >= 6) continue;
    const meander = meandering + 1 / step + Math.max(meandering - step / 100, 0);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const sin = Math.sin(angle) * meander,
      cos = Math.cos(angle) * meander;
    if (step < 20 && (distanceSquared > 64 || (distanceSquared > 36 && cells.length < 5))) {
      result.push(
        [(x1 * 2 + x2) / 3 - sin, (y1 * 2 + y2) / 3 + cos, 0],
        [(x1 + x2 * 2) / 3 + sin / 2, (y1 + y2 * 2) / 3 - cos / 2, 0]
      );
    } else if (distanceSquared > 25 || cells.length < 6) {
      result.push([(x1 + x2) / 2 - sin, (y1 + y2) / 2 + cos, 0]);
    }
  }
  return result;
}
const LENGTH_PROGRESSION = [1, 1, 2, 3, 5, 8, 13, 21, 34].map(n => n / 200);
export function riverDisplayOffset(input: {
  flux: number;
  pointIndex: number;
  widthFactor: number;
  startingWidth: number;
}): number {
  const { flux, pointIndex, widthFactor, startingWidth } = input;
  if (pointIndex === 0) return startingWidth;
  const fluxWidth = Math.min(flux ** 0.7 / 500, 1);
  const lengthWidth = pointIndex * (1 / 200) + (LENGTH_PROGRESSION[pointIndex] || LENGTH_PROGRESSION.at(-1)!);
  return widthFactor * (lengthWidth + fluxWidth) + startingWidth;
}
/** Width in FMG distance units, retaining the existing rounding rule. */
export function physicalRiverWidth(offset: number): number {
  return rn((offset / 1.5) ** 1.8, 2);
}
