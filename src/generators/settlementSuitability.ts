import { getCellSubsistenceCapacity } from "./subsistenceCapacity";

export function getSettlementClimateScore(
  temperature: number,
  precipitation: number,
  kind: "river" | "lake" | "coast" | "spring" | "mountain" | null
): number {
  if (!kind) return 0;
  if (temperature < -18 || temperature > 42) return 0;
  // The current climate model has no separate growing-season column. This
  // temperature-derived score is the local growing-season adapter until one
  // exists in WorldContext.
  const growingSeasonScore = temperature < -5 ? 0.2 : temperature < 2 ? 0.5 : temperature > 34 ? 0.55 : 1;
  const precipitationScore =
    precipitation < 8 ? (kind === "river" || kind === "lake" ? 0.2 : 0) : precipitation < 20 ? 0.55 : 1;
  return growingSeasonScore * precipitationScore;
}

/** Local food and climate only: no food across an unbuilt crossing is counted. */
export function getSettlementBaseSize(
  cells: {
    capacity: ArrayLike<number>;
    subsistenceCapacity?: ArrayLike<number>;
    s: ArrayLike<number>;
    h: ArrayLike<number>;
    g?: ArrayLike<number>;
    r?: ArrayLike<number>;
    harbor?: ArrayLike<number>;
    t?: ArrayLike<number>;
  },
  id: number,
  temperature?: ArrayLike<number>,
  precipitation?: ArrayLike<number>
): number {
  const gridId = cells.g?.[id] ?? id;
  const kind = cells.r?.[id] ? "river" : cells.harbor?.[id] ? (cells.t?.[id] === 1 ? "coast" : "lake") : "spring";
  const climate = getSettlementClimateScore(temperature?.[gridId] ?? 12, precipitation?.[gridId] ?? 45, kind);
  if ((cells.h[id] ?? 0) < 20) return 0;
  const food = Math.max(0, getCellSubsistenceCapacity(cells, id));
  const ceiling = Math.max(0, cells.capacity[id] ?? 0);
  return Math.max(0, cells.s[id] ?? 0) * (ceiling > 0 ? Math.min(1, food / ceiling) : 0) * climate;
}
