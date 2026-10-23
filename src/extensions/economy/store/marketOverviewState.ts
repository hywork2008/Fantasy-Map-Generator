import { create } from "zustand";
import type { SaltworksOwner } from "../generators/saltLogisticsTypes";

export interface MarketSaltworksRow {
  id: number;
  owner: SaltworksOwner;
  settlementOwner?: SaltworksOwner;
  operator: SaltworksOwner;
  operatingCash: number | null;
  cash: number | null;
  output: number;
  receipts: number;
  expenses: number;
  options: { owner: SaltworksOwner; name: string }[];
}

export interface MarketSaltPolicyRow {
  stateId: number;
  name: string;
  mode: "open" | "monopoly";
  taxRate: number;
  automated: boolean;
  compulsoryPurchase: boolean;
  unrest: number;
  revolt: boolean;
  decision?: string;
  taxPaid: number;
  taxFarmPaid: number;
  smuggled: number;
  unmetQuota: number;
}

export interface MarketOverviewRow {
  goodId: number;
  goodName: string;
  goodColor: string;
  goodStroke: string;
  goodIcon: string;
  stock: number;
  price: number;
}

export interface MarketOverviewBurgMerchantRow {
  burgId: number;
  burgName: string;
  topMerchantName: string;
  topMerchantId?: number;
  topShare: number;
  topRevenue: number;
  rivals: string;
}

export interface MarketOverviewTransportAssetRow {
  assetId: string;
  assetName: string;
  cargoCapacitySlots: number;
  available: number;
  reserved: number;
  inTransit: number;
  maintenance: number;
  total: number;
}

export interface MarketOverviewTransportOrderRow {
  id: number;
  requestedBy: "simulation" | "player";
  blueprintName: string;
  quantity: number;
  completedQuantity: number;
  workPoints: number;
  requiredWorkPoints: number;
  progressPercent: number;
  materials: { name: string; units: number }[];
  budgetLimit?: number;
  fundedAmount: number;
  status: "queued" | "waitingMaterials" | "building" | "completed" | "cancelled";
  blockedReason?: "insufficientTreasury" | "budgetLimit" | "missingMaterials" | "missingCraftWorkers";
}

export interface MarketOverviewFoodLedger {
  localProduction: number;
  quarterlyNeed: number;
  importedFood: number;
  importSharePercent: number;
  reserveGap: number;
  stock: number;
  stockMonths: number;
}

interface MarketOverviewOwner {
  coaId: string;
  name: string;
}

interface MarketOverviewState {
  marketId: number | null;
  name: string;
  defaultName: string;
  owner: MarketOverviewOwner | null;
  rows: MarketOverviewRow[];
  saltworksRows: MarketSaltworksRow[];
  saltPolicyRows: MarketSaltPolicyRow[];
  burgMerchantRows: MarketOverviewBurgMerchantRow[];
  transportAssetRows: MarketOverviewTransportAssetRow[];
  transportOrderRows: MarketOverviewTransportOrderRow[];
  cellsCount: number;
  burgsCount: number;
  totalStock: number;
  /** Percent 0-100, rounded. See Market.agTechStock (docs/plan/rural-agtech-investment.md). */
  agTechStockPercent: number;
  transportCargoCapacitySlots: number;
  transportReadyCapacitySlots: number;
  transportUtilizationPercent: number;
  /** Merchant trade working capital (available = total − locked). */
  tradeWorkingCapital: number;
  tradeCapitalLocked: number;
  tradeCapitalAvailable: number;
  /** Export warehouse lots waiting to load at this market. */
  exportStagingLotCount: number;
  exportStagingUnits: number;
  exportStagingValue: number;
  merchantOrganizationName: string;
  sailScheduleLabel: string;
  foodLedger: MarketOverviewFoodLedger | null;
}

export const useMarketOverviewState = create<MarketOverviewState>(() => ({
  marketId: null,
  name: "",
  defaultName: "",
  owner: null,
  rows: [],
  saltworksRows: [],
  saltPolicyRows: [],
  burgMerchantRows: [],
  transportAssetRows: [],
  transportOrderRows: [],
  cellsCount: 0,
  burgsCount: 0,
  totalStock: 0,
  agTechStockPercent: 0,
  transportCargoCapacitySlots: 0,
  transportReadyCapacitySlots: 0,
  transportUtilizationPercent: 0,
  tradeWorkingCapital: 0,
  tradeCapitalLocked: 0,
  tradeCapitalAvailable: 0,
  exportStagingLotCount: 0,
  exportStagingUnits: 0,
  exportStagingValue: 0,
  merchantOrganizationName: "",
  sailScheduleLabel: "",
  foodLedger: null
}));

export const getMarketOverviewState = useMarketOverviewState.getState;
export const setMarketOverviewState = useMarketOverviewState.setState;
