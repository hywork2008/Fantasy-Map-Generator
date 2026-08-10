import { getSmithingWorkshopLedgers, setSmithingWorkshopLedgers } from "../economyContext";
import type { ProductionRecipeEntry } from "./productionRecordTypes";
import type { SmithingWorkshopLedger, SmithingWorkshopProductLine } from "./smithingWorkshopLedgerTypes";

function getOrCreateLedger(burgId: number): SmithingWorkshopLedger {
  const ledgers = getSmithingWorkshopLedgers();
  const existing = ledgers.find(ledger => ledger.burgId === burgId);
  if (existing) return existing;

  const ledger: SmithingWorkshopLedger = {
    burgId,
    masterCharacterId: null,
    productLines: [],
    masterWagesPaid: 0
  };
  setSmithingWorkshopLedgers([...ledgers, ledger]);
  return ledger;
}

function getOrCreateLine(ledger: SmithingWorkshopLedger, goodId: number): SmithingWorkshopProductLine {
  const existing = ledger.productLines.find(line => line.goodId === goodId);
  if (existing) return existing;

  const line: SmithingWorkshopProductLine = {
    goodId,
    materials: [],
    materialCost: 0,
    unitsProduced: 0,
    unitsSold: 0,
    salesRevenue: 0,
    realizedMargin: 0,
    guildProfit: 0
  };
  ledger.productLines.push(line);
  return line;
}

function mergeMaterials(target: ProductionRecipeEntry[], additions: readonly ProductionRecipeEntry[]): void {
  for (const addition of additions) {
    const existing = target.find(material => material.goodId === addition.goodId);
    if (existing) existing.units += addition.units;
    else target.push({ ...addition });
  }
}

function refreshMargin(line: SmithingWorkshopProductLine): void {
  line.realizedMargin = Math.max(0, line.salesRevenue - line.materialCost);
}

/** Owns per-cycle workshop accounting; it is reset immediately before Burg production begins. */
export class SmithingWorkshopAccountingModule {
  beginProductionCycle(): void {
    setSmithingWorkshopLedgers([]);
  }

  recordProduction({
    burgId,
    goodId,
    materials,
    materialCost,
    unitsProduced,
    masterCharacterId
  }: {
    burgId: number;
    goodId: number;
    materials: readonly ProductionRecipeEntry[];
    materialCost: number;
    unitsProduced: number;
    masterCharacterId: number | null;
  }): void {
    const ledger = getOrCreateLedger(burgId);
    if (masterCharacterId !== null) ledger.masterCharacterId = masterCharacterId;
    const line = getOrCreateLine(ledger, goodId);
    mergeMaterials(line.materials, materials);
    line.materialCost += materialCost;
    line.unitsProduced += unitsProduced;
    refreshMargin(line);
    setSmithingWorkshopLedgers(getSmithingWorkshopLedgers());
  }

  recordSale(burgId: number, goodId: number, unitsSold: number, salesRevenue: number, guildProfit: number): void {
    const ledger = getOrCreateLedger(burgId);
    const line = getOrCreateLine(ledger, goodId);
    line.unitsSold += unitsSold;
    line.salesRevenue += salesRevenue;
    line.guildProfit += guildProfit;
    refreshMargin(line);
    setSmithingWorkshopLedgers(getSmithingWorkshopLedgers());
  }

  recordMasterWage(burgId: number, masterCharacterId: number, amount: number): void {
    if (!(amount > 0)) return;
    const ledger = getOrCreateLedger(burgId);
    ledger.masterCharacterId = masterCharacterId;
    ledger.masterWagesPaid += amount;
    setSmithingWorkshopLedgers(getSmithingWorkshopLedgers());
  }
}

export const SmithingWorkshopAccounting = new SmithingWorkshopAccountingModule();
