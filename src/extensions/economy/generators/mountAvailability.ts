import {
  getMarkets,
  getMerchantTransportLedgers,
  getOrCreateFaunaStockTable,
  getWorldContext
} from "../economyContext";
import { getLandTransportDefinition } from "./tradeCargo";

const CIVILIAN_MOUNT_RESERVE_FRACTION = 0.45;

function cohortTotal(cohorts: { young: number; breeding: number; old: number }): number {
  return Math.max(0, cohorts.young) + Math.max(0, cohorts.breeding) + Math.max(0, cohorts.old);
}

function isNomadicState(stateId: number): boolean {
  const { pack } = getWorldContext();
  const cultureId = pack.states[stateId]?.culture;
  return cultureId !== undefined && pack.cultures[cultureId]?.type === "Nomadic";
}

function getDomesticMountStock(stateId: number): number | undefined {
  const { pack } = getWorldContext();
  const species = isNomadicState(stateId) ? "Camels" : "Horses";
  const table = getOrCreateFaunaStockTable();
  if (!table) return undefined;

  let found = false;
  let total = 0;
  for (const cellId of pack.cells.i) {
    if (pack.cells.state[cellId] !== stateId) continue;
    const cohorts = table[`${String(cellId)}:${species}`];
    if (!cohorts) continue;
    found = true;
    total += cohortTotal(cohorts);
  }
  return found ? total : undefined;
}

function getMerchantDraftRequirement(stateId: number): number {
  const { pack } = getWorldContext();
  const marketsById = new Map(getMarkets().map(market => [market.i, market]));
  let required = 0;

  for (const ledger of getMerchantTransportLedgers()) {
    const market = marketsById.get(ledger.marketId);
    const marketBurg = market ? pack.burgs[market.centerBurgId] : undefined;
    if (!marketBurg || marketBurg.state !== stateId) continue;

    for (const asset of ledger.landAssets) {
      const definition = getLandTransportDefinition(asset.assetId);
      if (!definition) continue;
      const activeAssets = asset.available + asset.reserved + asset.inTransit;
      required += Math.max(0, activeAssets) * definition.requiredDraftAnimals;
    }
  }

  return required;
}

/**
 * Returns the state-wide number of mounts available to the army after preserving household,
 * breeding and merchant transport use. Undefined means the fauna model has not seeded data yet.
 */
export function getStateMountedCapacity(stateId: number): number | undefined {
  const stock = getDomesticMountStock(stateId);
  if (stock === undefined) return undefined;
  const civilianReserve = Math.ceil(stock * CIVILIAN_MOUNT_RESERVE_FRACTION);
  return Math.max(0, Math.floor(stock - civilianReserve - getMerchantDraftRequirement(stateId)));
}
