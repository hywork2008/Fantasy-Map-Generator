import type { ProductionRecipeEntry } from "./productionRecordTypes";

/** Current production-cycle accounting for one Burg's metallurgy workshop. */
export interface SmithingWorkshopProductLine {
  goodId: number;
  materials: ProductionRecipeEntry[];
  materialCost: number;
  unitsProduced: number;
  unitsSold: number;
  salesRevenue: number;
  realizedMargin: number;
  guildProfit: number;
}

export interface SmithingWorkshopLedger {
  burgId: number;
  /** Character id of the master who supervised product output this cycle, if applicable. */
  masterCharacterId: number | null;
  productLines: SmithingWorkshopProductLine[];
  masterWagesPaid: number;
}
