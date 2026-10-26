export interface BeddingRouteDiagnostic {
  inputGoodId: number;
  weavesCloth: boolean;
  inputPrice: number | null;
  inputStock: number;
  needLimitLots: number;
  cashLimitLots: number;
  stockLimitLots: number;
  laborLimitLots: number;
  producedLots: number;
  belowPaymentPrecision: boolean;
}

/** Captured at the real home-processing decision, before blanket purchases and later tick changes. */
export interface RuralBeddingDiagnostic {
  year: number;
  month: number;
  householdBudget: number;
  wardrobeNeedLots: number;
  wardrobeHomeLots: number;
  wardrobeSpending: number;
  remainingWardrobeCost: number;
  beddingBudget: number;
  laborAfterGarments: number;
  blanketNeedLots: number;
  finishedBlanketStock: number;
  beddingLaborReserved?: number;
  releasedLaborToGarments?: number;
  routes: BeddingRouteDiagnostic[];
}

export interface HomeTextileRouteDiagnostic extends BeddingRouteDiagnostic {
  productGoodId: number;
  pass: "initial" | "releasedLabor";
  primary: string | null;
  constraints: string[];
}

export interface HomeTextileDiagnostic {
  status: "evaluated" | "noLabor" | "noRecipe";
  garmentNeed: number;
  blanketNeed: number;
  garmentUnmetAfterHome: number;
  blanketUnmetAfterHome: number;
  routes: HomeTextileRouteDiagnostic[];
}

export interface RuralTextileProduction {
  inputOrders?: Record<number, number>;
  beddingDiagnostic?: RuralBeddingDiagnostic;
  homeDiagnostic?: HomeTextileDiagnostic;
  garments: number;
  blankets: number;
  garmentSpending: number;
  blanketSpending: number;
  /** Subsets of garment/blanket totals; absent on older saves. */
  purchasedClothGarments?: number;
  purchasedClothBlankets?: number;
  purchasedClothSpending?: number;
  laborUsed: number;
  laborCapacity: number;
}
