/** Bounded, per-cycle observations of actual planner guards. Never used to select production. */
export type ProductionConstraint =
  | "technology"
  | "recipeUnavailable"
  | "recipeCycle"
  | "unboundedRecipeYield"
  | "nonPositiveRecipeYield"
  | "noPreparationAction"
  | "materials"
  | "procurementFailed"
  | "funds"
  | "profitability"
  | "labor"
  | "outputTarget"
  | "noDemand"
  | "householdBudget"
  | "excessStock"
  | "domainCap"
  | "ranking"
  | "stepLimit"
  | "otherWork"
  | "unknown";
export interface ProductionDiagnostic {
  stage: "planning" | "execution" | "loop";
  goodId: number | null;
  primary: ProductionConstraint | null;
  constraints: ProductionConstraint[];
  count: number;
  outputLots?: number;
  laborPoints?: number;
  wagesPaid?: number;
  materialCost?: number;
}
export interface ProductionCycleDiagnostic {
  rows: ProductionDiagnostic[];
  steps: number;
  maxSteps: number;
}
export function recordProductionDiagnostic(
  target: ProductionCycleDiagnostic | undefined,
  stage: ProductionDiagnostic["stage"],
  goodId: number | null,
  constraints: Iterable<ProductionConstraint>,
  amounts?: Pick<ProductionDiagnostic, "outputLots" | "laborPoints" | "wagesPaid" | "materialCost">,
  count = 1
): void {
  if (!target) return;
  const reasons = [...new Set(constraints)];
  const primary = reasons[0] ?? null;
  // Primary follows the actual guard traversal. Secondary counts are overlapping, not opportunities.
  let row = target.rows.find(
    row =>
      row.stage === stage &&
      row.goodId === goodId &&
      row.primary === primary &&
      row.constraints.join(",") === reasons.join(",")
  );
  if (row) row.count += count;
  else {
    row = { stage, goodId, primary, constraints: reasons, count };
    target.rows.push(row);
  }
  if (amounts)
    for (const key of ["outputLots", "laborPoints", "wagesPaid", "materialCost"] as const)
      row[key] = (row[key] ?? 0) + (amounts[key] ?? 0);
}

/** Market rollup retains evaluation counts; it is not a second production ledger. */
export function aggregateProductionDiagnostics(
  records: readonly {
    marketId: number;
    workforcePoints: number;
    chargedPoints: number;
    unusedPoints: number;
    productionDiagnostics?: ProductionCycleDiagnostic;
  }[]
) {
  const markets = new Map<
    number,
    ProductionCycleDiagnostic & {
      marketId: number;
      burgs: number;
      workforcePoints: number;
      chargedPoints: number;
      unusedPoints: number;
    }
  >();
  for (const record of records) {
    let market = markets.get(record.marketId);
    if (!market) {
      market = {
        marketId: record.marketId,
        burgs: 0,
        rows: [],
        steps: 0,
        maxSteps: 0,
        workforcePoints: 0,
        chargedPoints: 0,
        unusedPoints: 0
      };
      markets.set(record.marketId, market);
    }
    market.burgs++;
    market.workforcePoints += record.workforcePoints;
    market.chargedPoints += record.chargedPoints;
    market.unusedPoints += record.unusedPoints;
    market.steps += record.productionDiagnostics?.steps ?? 0;
    market.maxSteps += record.productionDiagnostics?.maxSteps ?? 0;
    for (const row of record.productionDiagnostics?.rows ?? [])
      recordProductionDiagnostic(
        market,
        row.stage,
        row.goodId,
        row.constraints,
        row.outputLots === undefined ? undefined : row,
        row.count
      );
  }
  return [...markets.values()];
}
