import { getCellSubsistenceCapacity } from "./subsistenceCapacity";

export function getSettlementClimateScore(
  temperature: number,
  precipitation: number,
  kind: "river" | "lake" | "coast" | "spring" | "mountain" | null
): number {
  if (!kind || !Number.isFinite(temperature) || !Number.isFinite(precipitation)) return 0;
  if (temperature < -18 || temperature > 42) return 0;
  // The current climate model has no separate growing-season column. This
  // temperature-derived score is the local growing-season adapter until one
  // exists in WorldContext.
  const growingSeasonScore = temperature < -5 ? 0.2 : temperature < 2 ? 0.5 : temperature > 34 ? 0.55 : 1;
  const precipitationScore =
    precipitation < 8 ? (kind === "river" || kind === "lake" ? 0.2 : 0) : precipitation < 20 ? 0.55 : 1;
  return growingSeasonScore * precipitationScore;
}

export type SettlementWaterFeatures = readonly { type?: string; group?: string }[];
type SettlementWaterCells = {
  r?: ArrayLike<number>;
  harbor?: ArrayLike<number>;
  t?: ArrayLike<number>;
  h: ArrayLike<number>;
  c?: readonly (readonly number[])[];
  f?: ArrayLike<number>;
  haven?: ArrayLike<number>;
};
/** Sea and salt lakes provide fishing/transport, but no freshwater climate bonus. */
export function getSettlementWaterKind(
  cells: SettlementWaterCells,
  id: number,
  features?: SettlementWaterFeatures
): "river" | "lake" | "coast" | "spring" {
  if (cells.r?.[id]) return "river";
  if (features) {
    const neighbours = [...(cells.c?.[id] ?? []), ...(cells.haven?.[id] !== undefined ? [cells.haven[id]] : [])];
    if (
      neighbours.some(
        n =>
          cells.h[n] < 20 &&
          features[cells.f?.[n] ?? -1]?.type === "lake" &&
          features[cells.f?.[n] ?? -1]?.group === "freshwater"
      )
    )
      return "lake";
    if (cells.harbor?.[id] || cells.t?.[id] === 1) return "coast";
    return "spring";
  }
  // Bare legacy cell fixtures have no feature chemistry.
  return cells.harbor?.[id] ? (cells.t?.[id] === 1 ? "coast" : "lake") : cells.t?.[id] === 1 ? "coast" : "spring";
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
    c?: readonly (readonly number[])[];
    f?: ArrayLike<number>;
    haven?: ArrayLike<number>;
  },
  id: number,
  temperature?: ArrayLike<number>,
  precipitation?: ArrayLike<number>,
  features?: SettlementWaterFeatures
): number {
  const gridId = cells.g?.[id] ?? id;
  const kind = getSettlementWaterKind(cells, id, features);
  const climate = getSettlementClimateScore(temperature?.[gridId] ?? 12, precipitation?.[gridId] ?? 45, kind);
  if ((cells.h[id] ?? 0) < 20) return 0;
  const food = Math.max(0, getCellSubsistenceCapacity(cells, id));
  const ceiling = Math.max(0, cells.capacity[id] ?? 0);
  const score = Math.max(0, cells.s[id] ?? 0) * (ceiling > 0 ? Math.min(1, food / ceiling) : 0) * climate;
  return Number.isFinite(score) ? score : 0;
}
