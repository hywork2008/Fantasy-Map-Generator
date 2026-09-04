import type { MilitaryResourceLedger } from "../generators/militaryResourcesTypes";
import type { MintLedger } from "../generators/mintingTypes";
import type { DistantRealm, OverseasExpedition, OverseasRelationLedger } from "../generators/overseasRelationsTypes";
import type { TradeSecurityLedger } from "../generators/tradeSecurityTypes";
import { getSliceArray, getSliceNumber, setSliceArray, setSliceNumber } from "./economyApi";

export function getMintLedgers(): MintLedger[] {
  return getSliceArray<MintLedger>("mintLedgers");
}

export function setMintLedgers(ledgers: readonly MintLedger[]): void {
  setSliceArray("mintLedgers", ledgers);
}

/** Per-state firepower demand and the market stock consumed to satisfy it. */
export function getMilitaryResourceLedgers(): MilitaryResourceLedger[] {
  return getSliceArray<MilitaryResourceLedger>("militaryResourceLedgers");
}

export function setMilitaryResourceLedgers(ledgers: readonly MilitaryResourceLedger[]): void {
  setSliceArray("militaryResourceLedgers", ledgers);
}

/** Per-state caravan-security budgets owned by the economy extension. */
export function getTradeSecurityLedgers(): TradeSecurityLedger[] {
  return getSliceArray<TradeSecurityLedger>("tradeSecurityLedgers");
}

export function setTradeSecurityLedgers(ledgers: readonly TradeSecurityLedger[]): void {
  setSliceArray("tradeSecurityLedgers", ledgers);
}

/**
 * Off-map "Distant Realm" nations — Overseas Relations (docs/plan/distant-realms-overseas-trade.md).
 * Seeded once per world (world-generation-scoped, not per-state); read by every state that qualifies.
 */
export function getDistantRealms(): DistantRealm[] {
  return getSliceArray<DistantRealm>("distantRealms");
}

export function setDistantRealms(realms: readonly DistantRealm[]): void {
  setSliceArray("distantRealms", realms);
}

/** One row per (state, realm) relationship, created lazily on first contact. */
export function getOverseasRelationLedgers(): OverseasRelationLedger[] {
  return getSliceArray<OverseasRelationLedger>("overseasRelationLedgers");
}

export function setOverseasRelationLedgers(ledgers: readonly OverseasRelationLedger[]): void {
  setSliceArray("overseasRelationLedgers", ledgers);
}

/** In-flight and resolved overseas voyages. */
export function getOverseasExpeditions(): OverseasExpedition[] {
  return getSliceArray<OverseasExpedition>("overseasExpeditions");
}

export function setOverseasExpeditions(expeditions: readonly OverseasExpedition[]): void {
  setSliceArray("overseasExpeditions", expeditions);
}

export function getNextOverseasExpeditionId(): number {
  const id = getSliceNumber("nextOverseasExpeditionId");
  return id > 0 ? id : 1;
}

export function setNextOverseasExpeditionId(id: number): void {
  setSliceNumber("nextOverseasExpeditionId", id);
}
