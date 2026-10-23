/** Quantity commit boundary only. No default profiles, labor, preservation or legacy market switching. */
import type { Character } from "../../characters/characterTypes";
import { getApi, peekEconomySlice } from "../context/economyApi";
import { getSlaughterLedger, type OwnedSlaughterReceipt, type SlaughterLedger } from "../context/slaughter";
import { getGoods } from "../context/trade";
import { isGoodEnabled } from "./goods-generator";
import { animalsPerMarketHead } from "./liveAnimalScale";
import { livestockFeedPeriod } from "./livestockFeedState";
import type { LivestockLotLedger } from "./livestockLots";
import { type CarcassProfile, commitSlaughter, type SlaughterRequest } from "./slaughterTransactions";

export interface OwnedSlaughterRequest {
  /** Stable caller operation key; distinct from the generated persistent batch ID. */
  operationId: string;
  characterId: number;
  goodId: number;
  lotId: string;
  heads: number;
  period: number;
}
function requireCondition(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/**
 * Stage every check/output first, then publish plain saved objects synchronously, without callbacks.
 * Supports materialized characters' bag stock only. Processing callers must supply a vetted profile.
 */
export function commitOwnedSlaughter(request: OwnedSlaughterRequest, profile: CarcassProfile): OwnedSlaughterReceipt {
  const api = getApi();
  requireCondition(api.isExtensionEnabled("economy"), "Economy must be enabled for slaughter");
  requireCondition(
    typeof request.operationId === "string" && request.operationId.trim().length > 0,
    "Missing slaughter operation ID"
  );
  requireCondition(
    Number.isSafeInteger(request.characterId) &&
      request.characterId > 0 &&
      Number.isSafeInteger(request.goodId) &&
      request.goodId >= 0,
    "Invalid slaughter actor or good"
  );
  const slice = peekEconomySlice();
  requireCondition(slice !== null, "Missing Economy state");
  const saved = getSlaughterLedger();
  const receiptKey = `operation:${request.operationId}`;
  const prior = saved?.receipts[receiptKey];
  const ownerId = `character:${request.characterId}`;
  const base = (id: string): SlaughterRequest => ({
    id,
    ownerId,
    locationId: ownerId,
    lotId: request.lotId,
    period: request.period,
    heads: request.heads
  });
  if (prior) {
    requireCondition(
      prior.physicalInput.characterId === request.characterId && prior.physicalInput.goodId === request.goodId,
      "Conflicting slaughter physical input"
    );
    // The receipt remains readable after the consumed lot or person has gone.
    commitSlaughter({ lots: {}, receipts: { [prior.id]: prior }, portions: {} }, base(prior.id), profile);
    return structuredClone(prior);
  }
  requireCondition(request.period === livestockFeedPeriod(), "Slaughter period is not current");
  const ledger = slice.livestockLots as LivestockLotLedger | undefined;
  const lot = ledger?.lots[request.lotId];
  requireCondition(
    ledger !== undefined &&
      lot !== undefined &&
      lot.status === "owned" &&
      lot.ownerId === ownerId &&
      lot.locationId === ownerId,
    "Slaughter requires owned bag livestock"
  );
  requireCondition(
    Boolean(ledger.shipments[lot.shipmentId]) && ledger.shipments[lot.shipmentId].species === lot.species,
    "Missing recorded livestock shipment"
  );
  const good = getGoods().find(row => row.i === request.goodId);
  requireCondition(good !== undefined, "Slaughter good is missing");
  requireCondition(
    good.tags.includes("liveAnimal") && good.tags.includes("food") && good.name === lot.species && isGoodEnabled(good),
    "Slaughter good is not eligible food livestock"
  );
  // Read the authoritative materialized records directly, avoiding finance/materialization side effects.
  const actors = api.simulationContext?.extensions?.characters?.characters;
  const character = (Array.isArray(actors) ? (actors as Character[]) : (api.worldContext.pack.characters ?? [])).find(
    row => row.i === request.characterId && !row.dead
  );
  requireCondition(character !== undefined, "Slaughter owner is not a living materialized character");
  const inventory = character.inventory;
  const openingUnits = inventory?.[good.i] ?? 0;
  const scale = animalsPerMarketHead(good.name);
  const heldLots = Object.values(ledger.lots).filter(
    row => row.status === "owned" && row.ownerId === ownerId && row.locationId === ownerId && row.species === good.name
  );
  requireCondition(
    heldLots.every(row => Number.isFinite(row.heads) && row.heads >= 0),
    "Invalid owned livestock stock"
  );
  const trackedHeads = heldLots.reduce((sum, row) => sum + row.heads, 0);
  requireCondition(
    Number.isFinite(openingUnits) &&
      openingUnits >= 0 &&
      Number.isFinite(trackedHeads) &&
      Math.abs(openingUnits * scale - trackedHeads) <= 1e-6,
    "Physical inventory and livestock lots disagree"
  );
  const units = request.heads / scale;
  requireCondition(Number.isFinite(units) && units > 0 && openingUnits >= units, "Insufficient physical livestock");
  const nextBatchId = saved?.nextBatchId ?? 1;
  requireCondition(
    Number.isSafeInteger(nextBatchId) && nextBatchId > 0 && nextBatchId < Number.MAX_SAFE_INTEGER,
    "Invalid slaughter batch sequence"
  );
  const batchId = `slaughter-${nextBatchId}`;
  requireCondition(
    !Object.values(saved?.receipts ?? {}).some(row => row.id === batchId),
    "Slaughter batch ID already exists"
  );
  const stagedLot = structuredClone(lot);
  const staged = { lots: { [request.lotId]: stagedLot }, receipts: {}, portions: { ...saved?.portions } };
  const result = commitSlaughter(staged, base(batchId), profile);
  const receipt: OwnedSlaughterReceipt = {
    ...result,
    operationId: request.operationId,
    physicalInput: { characterId: request.characterId, goodId: request.goodId, marketUnits: units }
  };
  const nextSlaughter: SlaughterLedger = {
    schemaVersion: 1,
    nextBatchId: nextBatchId + 1,
    receipts: { ...saved?.receipts, [receiptKey]: receipt },
    portions: staged.portions
  };
  const nextInventory = { ...inventory };
  const remaining = openingUnits - units;
  if (remaining > 0) nextInventory[good.i] = remaining;
  else delete nextInventory[good.i];
  const nextLots = { ...ledger.lots, [request.lotId]: stagedLot };
  if (stagedLot.heads === 0) delete nextLots[request.lotId];
  const totals = ledger.exits[lot.shipmentId] ?? {};
  const nextLedger: LivestockLotLedger = {
    ...ledger,
    lots: nextLots,
    exits: {
      ...ledger.exits,
      [lot.shipmentId]: { ...totals, slaughterCommitted: (totals.slaughterCommitted ?? 0) + request.heads }
    }
  };

  // No event or user callback may run between these validated, in-memory writes.
  if (Object.keys(nextInventory).length) character.inventory = nextInventory;
  else delete character.inventory;
  slice.livestockLots = nextLedger;
  slice.slaughter = nextSlaughter;
  return structuredClone(receipt);
}
