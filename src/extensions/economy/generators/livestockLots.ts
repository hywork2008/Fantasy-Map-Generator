/** Provenance overlay for recorded market movements; never changes physical stock or cash. */
import { getEconomySlice } from "../context/economyApi";
import type { FaunaCohorts } from "./faunaPopulationTypes";
import type { GoodFlowRecord } from "./goodsBalanceLedger";
import { animalsPerMarketHead } from "./liveAnimalScale";
import { livestockFeedPeriod } from "./livestockFeedState";
import type { OwnedLiveLot } from "./slaughterTransactions";

export interface LivestockLot extends OwnedLiveLot {
  sourceCellId: number | null;
  marketId: number;
  status: "market" | "owned" | "transit";
}
export interface LivestockLotLedger {
  nextId: number;
  shipments: Record<
    string,
    {
      sourceCellId: number;
      species: string;
      marketId: number;
      period: number;
      heads: number;
      cohortHeads?: FaunaCohorts | null;
    }
  >;

  lots: Record<string, LivestockLot>;
  /** Movements by origin; transport splits and arrivals are bookkeeping, not physical losses. */
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
  status: "market" | "owned" | "transit" = "market"
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
  if (lot.cohortHeads) {
    const share = heads / lot.heads;
    for (const age of ["young", "breeding", "old"] as const) lot.cohortHeads[age] *= 1 - share;
  }
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
  if (flow.direction === "sink" && flow.category !== "exportDeparture" && flow.livestockCargoIds) {
    discardLivestockCargo(flow.livestockCargoIds, flow.units * animalsPerMarketHead(species), flow.category);
    return;
  }
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
  if (flow.direction === "source" && flow.livestockCargoIds) {
    let remaining = moved;
    for (const id of flow.livestockCargoIds) {
      const cargo = ledger.lots[id];
      if (cargo?.status !== "transit" || cargo.species !== species) continue;
      const heads = Math.min(remaining, cargo.heads);
      if (!(heads > 0)) continue;
      const arrived = copyLotShare(ledger, cargo, heads, "market", flow.marketId);
      arrived.ownerId = null;
      terminal(ledger, cargo, heads, "transportArrival");
      remaining -= heads;
    }
    if (remaining > 1e-9) addLot(ledger, species, flow.marketId, remaining, null);
    return;
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
        heads: moved,
        cohortHeads: flow.livestockCohorts ? { ...flow.livestockCohorts } : null
      };
    const lot = addLot(ledger, species, flow.marketId, moved, known ? cell : null, shipmentId);
    if (known && flow.livestockCohorts) {
      lot.cohortHeads = { ...flow.livestockCohorts };
      lot.cohortProvenance = "aggregate";
    }
    return;
  }
  let remaining = moved;
  for (const lot of matching()) {
    const heads = Math.min(lot.heads, remaining);
    if (!(heads > 0)) continue;
    // Recipe purchases are consumed by the legacy processing path, not reusable live property.
    // Only an explicitly identified live buyer creates an owned lot.
    if (flow.livestockBuyerId) {
      const owned = copyLotShare(ledger, lot, heads, "owned", flow.marketId);
      owned.ownerId = flow.livestockBuyerId;
    }
    if (flow.category === "exportDeparture" && flow.livestockCargoIds) {
      const cargo = copyLotShare(ledger, lot, heads, "transit", flow.marketId);
      cargo.locationId = "transport";
      flow.livestockCargoIds.push(cargo.id);
    }
    terminal(ledger, lot, heads, flow.livestockBuyerId ? "liveSale" : flow.category);
    remaining -= heads;
    if (remaining <= 1e-12) break;
  }
}

/** Split only aggregate age allocations; never assert individual calf eligibility. */
function copyLotShare(
  ledger: LivestockLotLedger,
  source: LivestockLot,
  heads: number,
  status: LivestockLot["status"],
  marketId: number
): LivestockLot {
  const lot = addLot(
    ledger,
    source.species,
    marketId,
    heads,
    source.sourceCellId,
    source.shipmentId,
    source.ownerId,
    status
  );
  lot.cohortProvenance = source.cohortProvenance;
  if (source.cohortHeads)
    lot.cohortHeads = {
      young: (source.cohortHeads.young * heads) / source.heads,
      breeding: (source.cohortHeads.breeding * heads) / source.heads,
      old: (source.cohortHeads.old * heads) / source.heads
    };
  return lot;
}

/** Move a proportional share of transit lots into a new, independently consumable cargo. */
export function splitLivestockCargo(ids: string[] | undefined, share: number): string[] | undefined {
  const ledger = getLivestockLotLedger();
  if (!ids || !ledger) return undefined;
  const result: string[] = [];
  for (const id of ids) {
    const lot = ledger.lots[id];
    if (lot?.status !== "transit") continue;
    const heads = lot.heads * Math.max(0, Math.min(1, share));
    if (!(heads > 0)) continue;
    const split = copyLotShare(ledger, lot, heads, "transit", lot.marketId);
    split.locationId = "transport";
    terminal(ledger, lot, heads, "transportSplit");
    result.push(split.id);
  }
  return result;
}

export function discardLivestockCargo(ids: string[] | undefined, heads = Infinity, reason = "transportLoss"): void {
  const ledger = getLivestockLotLedger();
  if (!ids || !ledger) return;
  let remaining = heads;
  for (const id of ids) {
    const lot = ledger.lots[id];
    if (lot?.status !== "transit") continue;
    const taken = Math.min(lot.heads, remaining);
    terminal(ledger, lot, taken, reason);
    remaining -= taken;
    if (remaining <= 1e-12) break;
  }
}
