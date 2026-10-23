/** Provenance overlay for recorded market movements; never changes physical stock or cash. */
import { getEconomySlice } from "../context/economyApi";
import type { GoodFlowRecord } from "./goodsBalanceLedger";
import { animalsPerMarketHead } from "./liveAnimalScale";
import { livestockFeedPeriod } from "./livestockFeedState";
import type { OwnedLiveLot } from "./slaughterTransactions";

export interface LivestockLot extends OwnedLiveLot {
  sourceCellId: number | null;
  marketId: number;
  status: "market" | "owned";
}
export interface LivestockLotLedger {
  nextId: number;
  shipments: Record<string, { sourceCellId: number; species: string; marketId: number; period: number; heads: number }>;

  lots: Record<string, LivestockLot>;
  /** Terminal quantities have no reusable live lot. Historical origin is retained by source. */
  exits: Record<string, Record<string, number>>;
  reconciledUnknownHeads: number;
}
export function getLivestockLotLedger(): LivestockLotLedger | null {
  return (getEconomySlice()?.livestockLots as LivestockLotLedger | undefined) ?? null;
}
function getOrCreateLedger(): LivestockLotLedger | null {
  const slice = getEconomySlice();
  if (!slice) return null;
  slice.livestockLots ??= { nextId: 1, shipments: {}, lots: {}, exits: {}, reconciledUnknownHeads: 0 };
  return slice.livestockLots as LivestockLotLedger;
}
function addLot(
  ledger: LivestockLotLedger,
  species: string,
  marketId: number,
  heads: number,
  sourceCellId: number | null,
  shipmentId = "",
  ownerId: string | null = null,
  status: "market" | "owned" = "market"
) {
  const id = `live-${ledger.nextId++}`;
  ledger.lots[id] = {
    id,
    shipmentId,
    species,
    marketId,
    sourceCellId,
    ownerId,
    status,
    locationId: `market:${marketId}`,
    heads,
    cohortProvenance: "unknown"
  };
  return ledger.lots[id];
}
function terminal(ledger: LivestockLotLedger, lot: LivestockLot, heads: number, reason: string) {
  const key = lot.shipmentId || "unknown";
  ledger.exits[key] ??= {};
  const totals = ledger.exits[key];
  totals[reason] = (totals[reason] ?? 0) + heads;
  lot.heads -= heads;
  if (lot.heads <= 1e-12) delete ledger.lots[lot.id];
}

/**
 * Called after a stock mutation. Reconcile the pre-movement pool first so legacy opening
 * stocks and uninstrumented movements never acquire invented origin or ownership.
 * FIFO is an accounting allocation, not identification of individual animals.
 */
export function recordLivestockLotFlow(flow: GoodFlowRecord, species: string, closingUnits: number): void {
  if (flow.marketId === undefined || flow.direction === "transfer") return;
  const ledger = getOrCreateLedger();
  if (!ledger) return;
  const scale = animalsPerMarketHead(species);
  const moved = flow.units * scale;
  const closing = Math.max(0, closingUnits * scale);
  const opening = Math.max(0, closing + (flow.direction === "sink" ? moved : -moved));
  const matching = () =>
    Object.values(ledger.lots).filter(
      lot => lot.status === "market" && lot.marketId === flow.marketId && lot.species === species
    );
  const tracked = matching().reduce((sum, lot) => sum + lot.heads, 0);
  if (opening > tracked + 1e-9) {
    const missing = opening - tracked;
    addLot(ledger, species, flow.marketId, missing, null);
    ledger.reconciledUnknownHeads += missing;
  } else if (tracked > opening + 1e-9) {
    // Attribution is lost if an unrecorded withdrawal could have taken any of the lots.
    for (const lot of matching()) terminal(ledger, lot, lot.heads, "unattributedReconciliation");
    if (opening > 0) addLot(ledger, species, flow.marketId, opening, null);
    ledger.reconciledUnknownHeads += opening;
  }
  if (flow.direction === "source") {
    const cell = flow.livestockSourceCellId ?? null;
    const known = flow.category === "ruralHarvest" && cell !== null;
    const shipmentId = known ? `shipment-${ledger.nextId}` : "";
    if (known)
      ledger.shipments[shipmentId] = {
        sourceCellId: cell,
        species,
        marketId: flow.marketId,
        period: livestockFeedPeriod(),
        heads: moved
      };
    addLot(ledger, species, flow.marketId, moved, known ? cell : null, shipmentId);
    return;
  }
  let remaining = moved;
  for (const lot of matching()) {
    const heads = Math.min(lot.heads, remaining);
    if (!(heads > 0)) continue;
    // Recipe purchases are consumed by the legacy processing path, not reusable live property.
    // Only an explicitly identified live buyer creates an owned lot.
    if (flow.livestockBuyerId)
      addLot(ledger, species, flow.marketId, heads, lot.sourceCellId, lot.shipmentId, flow.livestockBuyerId, "owned");
    terminal(ledger, lot, heads, flow.livestockBuyerId ? "liveSale" : flow.category);
    remaining -= heads;
    if (remaining <= 1e-12) break;
  }
}
