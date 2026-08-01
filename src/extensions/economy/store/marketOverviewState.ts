import { create } from "zustand";

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
  materials: string;
  budgetLimit?: number;
  fundedAmount: number;
  status: "queued" | "waitingMaterials" | "building" | "completed" | "cancelled";
  blockedReason?: "insufficientTreasury" | "budgetLimit" | "missingMaterials" | "missingCraftWorkers";
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
}

export const useMarketOverviewState = create<MarketOverviewState>(() => ({
  marketId: null,
  name: "",
  defaultName: "",
  owner: null,
  rows: [],
  burgMerchantRows: [],
  transportAssetRows: [],
  transportOrderRows: [],
  cellsCount: 0,
  burgsCount: 0,
  totalStock: 0,
  agTechStockPercent: 0,
  transportCargoCapacitySlots: 0,
  transportReadyCapacitySlots: 0,
  transportUtilizationPercent: 0
}));

export const getMarketOverviewState = useMarketOverviewState.getState;
export const setMarketOverviewState = useMarketOverviewState.setState;
