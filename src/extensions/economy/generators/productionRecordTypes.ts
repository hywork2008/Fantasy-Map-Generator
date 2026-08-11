import type { DemandCategory } from "./goodsGeneratorTypes";

export type Ingredient = { goodId: number; amount: number };

export type ProductionCandidate = {
  goodId: number;
  units: number;
  sellPrice: number;
  ingredientCost: number;
  cultureModifier: number;
  demandCategory: DemandCategory | null;
  demandMultiplier: number;
  score: number;
  ingredients: readonly Ingredient[];
  byproducts: readonly Ingredient[];
  goalGoodId?: number;
  isPreparation?: boolean;
  gainPerWorker?: number; // set for prep candidates: goal projected gain per worker (demand-weighted)
  workersNeeded?: number; // total workers in the chain (prep + goal)
};

export type ProductionRecipeEntry = { goodId: number; units: number };

export type DealRecord = { dealId: number };

export type MfgRecord = {
  goodId: number;
  units: number;
  recipe: ProductionRecipeEntry[];
  /** Outputs created alongside the primary manufactured good. */
  byproducts?: ProductionRecipeEntry[];
  cultureModifier?: number; // omitted when 1
  /** Present only for a master-supervised Tools, Arms, or Harnesses production run. */
  smithingProgram?: {
    masterCharacterId: number;
    proficiency: number;
    techniques: readonly string[];
    outputMultiplier: number;
  };
  candidates?: readonly ProductionCandidate[]; // recorded only when DEBUG.production is on
};

export type LocalRecord = { goodId: number; units: number };

export type ProductionRecord = DealRecord | MfgRecord | LocalRecord;
