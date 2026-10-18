/**
 * Staple grain in a rural household's diet (docs/plan/rural-food-labor-audit.md, problem A).
 *
 * A cell's settlement capacity counts fishing, herding and foraging as well as fields
 * (host subsistenceCapacity.ts). Those households ate much of their own catch, milk and meat and
 * bartered the rest for grain — northern Norwegian fishermen traded stockfish for grain at Bergen —
 * so the Food Ledger asks them only for the grain part of their diet.
 */

/** Share of a fully non-agricultural household's food that its own livelihood supplies. */
export const NON_GRAIN_DIET_SHARE_MAX = 0.6;

interface RuralDietCells {
  readonly subsistenceNonAgriculturalCapacity?: ArrayLike<number>;
}

/**
 * Share (0.4..1) of a rural resident's food need that must be grain. The cell's fishing, herding
 * and foraging capacity, against that plus its field capacity (`ruralFoodCapacity`, both in rural
 * population points), stands for the households living by those trades. Maps without the
 * subsistence column eat grain only, as before.
 */
export function getRuralGrainDietShare(
  cells: RuralDietCells,
  cellId: number,
  ruralFoodCapacity: ArrayLike<number> | undefined
): number {
  const nonAgricultural = Math.max(0, cells.subsistenceNonAgriculturalCapacity?.[cellId] ?? 0);
  if (!(nonAgricultural > 0)) return 1;
  const fields = Math.max(0, ruralFoodCapacity?.[cellId] ?? 0);
  return 1 - NON_GRAIN_DIET_SHARE_MAX * (nonAgricultural / (nonAgricultural + fields));
}
