/**
 * Debit Wood / Stone / Linen (Cloth fallback) from the local market for queued funerals.
 * Core funeral processing writes pending demand; this module is the Economy-side sink.
 */
import type { FuneralMaterialDemand } from "../../hostCore";
import { takePendingFuneralMaterials } from "../../hostCore";
import { getGoods, getMarketById, getMarketCellColumn } from "../economyContext";
import type { Market } from "./marketTypes";

const WOOD_NAMES = ["Wood"];
const STONE_NAMES = ["Stone"];
const LINEN_NAMES = ["Linen", "Cloth"];

function goodIdByNames(names: readonly string[]): number | undefined {
  const goods = getGoods();
  for (const name of names) {
    const good = goods.find(candidate => candidate.name === name);
    if (good) return good.i;
  }
  return undefined;
}

function debitStock(market: Market, goodId: number | undefined, amount: number): number {
  if (!goodId || !(amount > 0) || !Number.isFinite(amount)) return 0;
  const slot = market.goods[goodId];
  if (!slot) return 0;
  const taken = Math.min(Math.max(0, slot.stock), amount);
  if (taken <= 0) return 0;
  slot.stock = Math.max(0, slot.stock - taken);
  return taken;
}

export function consumeFuneralMaterialsFromPending(
  pending: Record<number, FuneralMaterialDemand> = takePendingFuneralMaterials()
): number {
  const marketColumn = getMarketCellColumn();
  if (!marketColumn?.length) return 0;
  const woodId = goodIdByNames(WOOD_NAMES);
  const stoneId = goodIdByNames(STONE_NAMES);
  const linenId = goodIdByNames(LINEN_NAMES);
  let consumed = 0;

  for (const [rawCellId, need] of Object.entries(pending)) {
    const cellId = Number(rawCellId);
    if (!Number.isInteger(cellId) || cellId < 0) continue;
    const marketId = marketColumn[cellId];
    if (!marketId) continue;
    const market = getMarketById(marketId);
    if (!market) continue;
    consumed += debitStock(market, woodId, need.wood);
    consumed += debitStock(market, stoneId, need.stone);
    consumed += debitStock(market, linenId, need.linen);
  }
  return consumed;
}
