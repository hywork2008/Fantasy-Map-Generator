/**
 * Distant Realms / Overseas Trading Companies — Phase 0–2 (trade expeditions and naval escorts).
 * Design: docs/plan/distant-realms-overseas-trade.md
 *
 * Deliberately does not reach the complexity of the map's own Economy simulation: a DistantRealm
 * is a handful of numbers, not a State with cells/burgs/markets. Ship pool pressure is real —
 * expeditions reserve hulls through MerchantTransportAssets, the same shared pool domestic
 * caravans draw from — but goods/price flow is a flat treasury outlay and payout, not a
 * burg-by-burg simulation.
 *
 * Scope: trade, armed coercion, and abstract off-map colonies. Colonies supply an existing
 * home market directly and use a treasury-funded garrison ledger rather than real map cells.
 */

import { type ChronicleEvent, SHIP_CLASS_DEFINITIONS } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  getDistantRealms,
  getGoods,
  getMarketById,
  getNextOverseasExpeditionId,
  getOverseasExpeditions,
  getOverseasRelationLedgers,
  getSimulationDay,
  getTransportReservations,
  getWorldContext,
  setDistantRealms,
  setNextOverseasExpeditionId,
  setOverseasExpeditions,
  setOverseasRelationLedgers
} from "../economyContext";
import { getDefaultGoodTradeProfile, isGoodEnabled } from "./goods-generator";
import type { Good } from "./goodsGeneratorTypes";
import type { TransportAllocation } from "./marketTypes";
import { MerchantTransportAssets } from "./merchantTransportAssets";
import type {
  ClimateBand,
  DistanceBand,
  DistantRealm,
  ExpeditionOutcomeCause,
  ExpeditionPurpose,
  OverseasExpedition,
  OverseasRelationLedger,
  PowerTier,
  RealmRelation
} from "./overseasRelationsTypes";
import {
  COLONY_GARRISON_UPKEEP_PER_UNIT,
  COLONY_REBELLION_MONTHS,
  climateGapSteps,
  computeCoercionRevenue,
  computeCoercionSuccessChance,
  computeColonizationCost,
  computeColonizationSuccessChance,
  computeColonyGarrisonRequirement,
  computeColonyMonthlyOutput,
  computeColonyOutputFactor,
  computeExpeditionBuyCost,
  computeExpeditionReturn,
  computeMonthlyTributeRevenue,
  computeOverseasProjectionScore,
  computeRoundTripLossRisk,
  FALLBACK_SHIP_TIER,
  getExpeditionDurationDays,
  getPowerTier
} from "./overseasVoyageRisk";
import { markRetailInventoryDirty } from "./retailInventory";

/** Cargo slots requested per expedition — flavor-only; decoupled from the treasury math below. */
const DEFAULT_EXPEDITION_CARGO_SLOTS = 200;

const RELATION_RANK: Record<RealmRelation, number> = {
  unknown: 0,
  contacted: 1,
  trading: 2,
  tributary: 3,
  colony: 4,
  hostile: 1
};

/** docs/plan/distant-realms-overseas-trade.md §10 seed table. Ids are assigned at generate() time. */
const DISTANT_REALM_SEEDS: readonly Omit<DistantRealm, "i">[] = [
  {
    name: "Zantira Coast",
    climateBand: "tropical",
    distanceBand: "nearAbroad",
    powerScore: 40,
    wealthLevel: 500,
    defenseScore: 30,
    specialtyGoodNames: ["Spices", "Cocoa", "Rubber"]
  },
  {
    name: "Kharvashi Sultanate",
    climateBand: "arid",
    distanceBand: "nearAbroad",
    powerScore: 90,
    wealthLevel: 900,
    defenseScore: 70,
    specialtyGoodNames: ["Dates", "Gemstones", "Incense"]
  },
  {
    name: "Velmoor Hanse",
    climateBand: "temperate",
    distanceBand: "nearAbroad",
    powerScore: 110,
    wealthLevel: 1100,
    defenseScore: 80,
    specialtyGoodNames: ["Furs", "Amber", "Silver Ore"]
  },
  {
    name: "Oubanga Coast",
    climateBand: "tropical",
    distanceBand: "farAbroad",
    powerScore: 25,
    wealthLevel: 700,
    defenseScore: 20,
    specialtyGoodNames: ["Coffee", "Sugarcane", "Dyes"]
  },
  {
    name: "Tepal Highlands",
    climateBand: "subtropical",
    distanceBand: "farAbroad",
    powerScore: 35,
    wealthLevel: 650,
    defenseScore: 25,
    specialtyGoodNames: ["Maize", "Coffee", "Pearls"]
  },
  {
    name: "Sundrift Emirates",
    climateBand: "arid",
    distanceBand: "farAbroad",
    powerScore: 150,
    wealthLevel: 1800,
    defenseScore: 120,
    specialtyGoodNames: ["Gemstones", "Camels", "Incense"]
  },
  {
    name: "Kai'lani Archipelago",
    climateBand: "tropical",
    distanceBand: "remote",
    powerScore: 20,
    wealthLevel: 900,
    defenseScore: 15,
    specialtyGoodNames: ["Spices", "Coffee", "Pearls"]
  },
  {
    name: "Norrfjall Reaches",
    climateBand: "polar",
    distanceBand: "remote",
    powerScore: 60,
    wealthLevel: 400,
    defenseScore: 45,
    specialtyGoodNames: ["Furs", "Whales", "Amber"]
  },
  {
    name: "Threnvale Compact",
    climateBand: "temperate",
    distanceBand: "remote",
    powerScore: 200,
    wealthLevel: 2500,
    defenseScore: 160,
    specialtyGoodNames: ["Silver Ore", "Gold Ore", "Wine"]
  },
  {
    name: "Maroa Delta",
    climateBand: "tropical",
    distanceBand: "remote",
    powerScore: 15,
    wealthLevel: 600,
    defenseScore: 10,
    specialtyGoodNames: ["Rubber", "Cocoa", "Ivory"]
  }
];

export type SendExpeditionFailureReason =
  | "invalid-state"
  | "unknown-realm"
  | "expedition-in-progress"
  | "no-port"
  | "no-good-available"
  | "insufficient-treasury"
  | "no-ships-available"
  | "no-escorts-available"
  | "escort-required"
  | "power-tier-restricted"
  | "hostile-realm";

export type SendExpeditionResult =
  | { ok: true; expeditionId: number }
  | { ok: false; reason: SendExpeditionFailureReason };

export interface OverseasRealmStatusRow {
  realmId: number;
  realmName: string;
  climateBand: ClimateBand;
  distanceBand: DistanceBand;
  specialtyGoodNames: string[];
  powerTier: PowerTier;
  relation: RealmRelation;
  lastTributePaid: number;
  colonyGarrisonRequired: number | null;
  colonyGarrisonFunded: number | null;
  monthsUnderfunded: number;
  lastColonyOutput: number;
  colonyGoodName: string | null;
  activeExpedition: { purpose: ExpeditionPurpose; departedTick: number; etaTick: number; escortCount: number } | null;
  lastOutcome: {
    purpose: ExpeditionPurpose;
    lost: boolean;
    cause?: ExpeditionOutcomeCause;
    profit?: number;
    revenue?: number;
    resolvedTick: number;
  } | null;
}

function debitStateTreasury(stateId: number, amount: number): boolean {
  const state = getWorldContext().pack.states?.[stateId];
  if (!state?.i || state.removed || amount <= 0) return false;
  if ((state.treasury ?? 0) < amount) return false;
  state.treasury = rn((state.treasury ?? 0) - amount, 2);
  return true;
}

function creditStateTreasury(stateId: number, amount: number): void {
  const state = getWorldContext().pack.states?.[stateId];
  if (!state?.i || state.removed || amount <= 0) return;
  state.treasury = rn((state.treasury ?? 0) + amount, 2);
}

function isSeaPortBurg(
  stateId: number,
  burg: { i?: number; removed?: boolean; port?: number; market?: number; cell?: number }
): boolean {
  if (!burg.i || burg.removed || !burg.port || typeof burg.market !== "number" || burg.market <= 0) return false;

  const { pack } = getWorldContext();
  const cellId = burg.cell;
  if (typeof cellId !== "number" || pack.cells.state?.[cellId] !== stateId) return false;

  // `burg.port` can point to the ocean reached by a lake's outlet, even when the burg itself is
  // landlocked. Overseas voyages need an immediate entrance onto the open ocean instead.
  const havenId = pack.cells.haven?.[cellId];
  return typeof havenId === "number" && pack.features?.[pack.cells.f?.[havenId]]?.type === "ocean";
}

function listStatePortBurgs(stateId: number) {
  const burgs = getWorldContext().pack.burgs ?? [];
  return burgs.filter(burg => burg?.state === stateId && isSeaPortBurg(stateId, burg));
}

function getMarketWaterCargoCapacity(marketId: number): number {
  const ledger = MerchantTransportAssets.ensureLedger(marketId);
  if (!ledger) return 0;
  return ledger.waterAssets.reduce((sum, asset) => {
    const definition = SHIP_CLASS_DEFINITIONS.find(shipClass => shipClass.id === asset.shipClassId);
    return sum + (definition?.cargoCapacitySlots ?? 0);
  }, 0);
}

function pickPortMarketForState(stateId: number): number | null {
  const portBurgs = listStatePortBurgs(stateId);
  if (!portBurgs.length) return null;
  let bestMarketId: number | null = null;
  let bestCapacity = -1;
  for (const burg of portBurgs) {
    const marketId = burg.market as number;
    const capacity = getMarketWaterCargoCapacity(marketId);
    if (bestMarketId === null || capacity > bestCapacity) {
      bestMarketId = marketId;
      bestCapacity = capacity;
    }
  }
  return bestMarketId;
}

/**
 * A state's capital cell temperature, bucketed the same coarse way DistantRealm climates are.
 * Approximate on purpose — only used to measure "how far from home" a realm's climate is.
 */
function getStateHomeClimateBand(stateId: number): ClimateBand {
  const world = getWorldContext();
  const burgs = world.pack.burgs ?? [];
  const stateBurgs = burgs.filter(burg => burg?.i && !burg.removed && burg.state === stateId);
  const capital = stateBurgs.find(burg => burg.capital) ?? stateBurgs[0];
  if (!capital) return "temperate";
  const gridCellId = world.pack.cells.g?.[capital.cell];
  const temp = typeof gridCellId === "number" ? (world.grid?.cells?.temp?.[gridCellId] ?? 12) : 12;
  if (temp < 0) return "polar";
  if (temp < 18) return "temperate";
  if (temp < 24) return "subtropical";
  return "tropical";
}

function findGoodByName(name: string): Good | undefined {
  return getGoods().find(good => good.name === name);
}

function getReservationShipTier(reservationId: number): number {
  const reservation = getTransportReservations().find(entry => entry.id === reservationId);
  if (!reservation) return FALLBACK_SHIP_TIER;
  const tiers = reservation.allocations
    .filter(allocation => allocation.mode === "water" && allocation.transportId)
    .map(allocation => SHIP_CLASS_DEFINITIONS.find(shipClass => shipClass.id === allocation.transportId)?.tier)
    .filter((tier): tier is number => typeof tier === "number");
  return tiers.length ? Math.min(...tiers) : FALLBACK_SHIP_TIER;
}

function getReservationShipHullIds(reservationId: number): number[] {
  const reservation = getTransportReservations().find(entry => entry.id === reservationId);
  if (!reservation) return [];
  return reservation.allocations.flatMap(allocation => allocation.shipHullIds ?? []);
}

function getAvailableEscortHullIds(stateId: number): number[] {
  const detail: { source: "economy"; stateId: number; hullIds?: number[] } = { source: "economy", stateId };
  document.dispatchEvent(new CustomEvent("fmg:shipbuilding-state-hull-availability-request", { detail }));
  return detail.hullIds ?? [];
}

function reserveEscortHulls(stateId: number, expeditionId: number, hullIds: readonly number[]): boolean {
  if (!hullIds.length) return true;
  const detail = { stateId, expeditionId, hullIds, result: undefined as "fulfilled" | "unavailable" | undefined };
  document.dispatchEvent(new CustomEvent("fmg:shipbuilding-state-hull-reservation-request", { detail }));
  return detail.result === "fulfilled";
}

function releaseEscortHulls(expeditionId: number, hullIds: readonly number[], outcome: "arrived" | "lost"): void {
  if (!hullIds.length) return;
  const detail = { expeditionId, hullIds, outcome, result: undefined as "fulfilled" | "unavailable" | undefined };
  document.dispatchEvent(new CustomEvent("fmg:shipbuilding-state-hull-release-request", { detail }));
}

/** Add a sparse, player-visible record for consequential overseas milestones. */
function recordOverseasChronicle(
  stateId: number,
  realm: Pick<DistantRealm, "i" | "name">,
  action: string,
  rawText: string
): void {
  const states = getWorldContext().pack.states;
  const state = states?.[stateId];
  const chronicleState = states?.[0];
  if (!state?.i || !chronicleState) return;

  const event: ChronicleEvent = {
    id: `overseas-${stateId}-${realm.i}-${getSimulationDay()}-${action.replaceAll(" ", "-")}`,
    yearsAgo: 0,
    from: stateId,
    to: 0,
    action,
    rawText
  };
  const chronicle = chronicleState.diplomacy ?? [];
  chronicleState.diplomacy = [[`Overseas: ${state.name} and ${realm.name}`, event], ...chronicle];
}

class OverseasRelationsModule {
  /** Idempotent — DistantRealms are seeded once per world and never regenerated afterward. */
  generate(): void {
    if (getDistantRealms().length) return;
    const realms: DistantRealm[] = DISTANT_REALM_SEEDS.map((seed, index) => ({ i: index + 1, ...seed }));
    setDistantRealms(realms);
  }

  clear(): void {
    setDistantRealms([]);
    setOverseasRelationLedgers([]);
    setOverseasExpeditions([]);
    setNextOverseasExpeditionId(1);
  }

  /** A sea-connected market with a merchant fleet is the prerequisite for reaching a Distant Realm. */
  stateHasSeaPort(stateId: number): boolean {
    return listStatePortBurgs(stateId).length > 0;
  }

  listEligibleStateIds(): number[] {
    const states = getWorldContext().pack.states ?? [];
    return states.filter(state => state?.i && !state.removed && this.stateHasSeaPort(state.i)).map(state => state.i);
  }

  /** Abstract naval/mercantile reach — merchant tonnage plus treasury. docs §3. */
  getOverseasProjectionScore(stateId: number): number {
    const state = getWorldContext().pack.states?.[stateId];
    if (!state?.i || state.removed) return 0;
    const merchantCargoCapacitySlots = listStatePortBurgs(stateId).reduce(
      (sum, burg) => sum + getMarketWaterCargoCapacity(burg.market as number),
      0
    );
    return computeOverseasProjectionScore({ merchantCargoCapacitySlots, treasury: state.treasury ?? 0 });
  }

  getPowerTierForState(stateId: number, realm: Pick<DistantRealm, "powerScore">): PowerTier {
    return getPowerTier(this.getOverseasProjectionScore(stateId) / Math.max(1, realm.powerScore));
  }

  /** Expeditions from this state currently at sea (outbound), across all realms. */
  getActiveExpeditionCount(stateId: number): number {
    return getOverseasExpeditions().filter(
      expedition => expedition.stateId === stateId && expedition.state === "outbound"
    ).length;
  }

  private ensureRelationLedger(stateId: number, realmId: number, atLeast: RealmRelation): OverseasRelationLedger {
    const ledgers = getOverseasRelationLedgers();
    let ledger = ledgers.find(entry => entry.stateId === stateId && entry.realmId === realmId);
    if (!ledger) {
      ledger = { stateId, realmId, relation: atLeast, relationScore: 0, monthsUnderfunded: 0 };
      ledgers.push(ledger);
      setOverseasRelationLedgers(ledgers);
    } else if (RELATION_RANK[ledger.relation] < RELATION_RANK[atLeast]) {
      ledger.relation = atLeast;
    }
    ledger.relationScore = Math.max(0, Math.min(100, ledger.relationScore ?? 0));
    return ledger;
  }

  /** Launches a trade voyage, optionally committing state-navy hulls to protect it from piracy. */
  sendTradeExpedition(stateId: number, realmId: number, escortCount = 0): SendExpeditionResult {
    const state = getWorldContext().pack.states?.[stateId];
    if (!state?.i || state.removed) return { ok: false, reason: "invalid-state" };

    const realm = getDistantRealms().find(entry => entry.i === realmId);
    if (!realm) return { ok: false, reason: "unknown-realm" };

    const alreadyOutbound = getOverseasExpeditions().some(
      expedition => expedition.stateId === stateId && expedition.realmId === realmId && expedition.state === "outbound"
    );
    if (alreadyOutbound) return { ok: false, reason: "expedition-in-progress" };

    const portMarketId = pickPortMarketForState(stateId);
    if (portMarketId === null) return { ok: false, reason: "no-port" };

    const good = realm.specialtyGoodNames
      .map(findGoodByName)
      .find((entry): entry is Good => Boolean(entry && isGoodEnabled(entry)));
    if (!good) return { ok: false, reason: "no-good-available" };

    const powerTier = this.getPowerTierForState(stateId, realm);
    const buyCost = rn(
      computeExpeditionBuyCost({ goodValue: good.value, distanceBand: realm.distanceBand, powerTier }),
      2
    );
    if (!debitStateTreasury(stateId, buyCost)) return { ok: false, reason: "insufficient-treasury" };

    const expeditionId = getNextOverseasExpeditionId();
    const requestedEscortCount = Math.max(0, Math.floor(escortCount));
    const escortHullIds = getAvailableEscortHullIds(stateId).slice(0, requestedEscortCount);
    if (escortHullIds.length !== requestedEscortCount || !reserveEscortHulls(stateId, expeditionId, escortHullIds)) {
      creditStateTreasury(stateId, buyCost);
      return { ok: false, reason: "no-escorts-available" };
    }
    const waterAllocation: TransportAllocation = {
      mode: "water",
      transportId: "",
      transportName: "",
      unitCount: 0,
      capacitySlots: 0,
      usedSlots: DEFAULT_EXPEDITION_CARGO_SLOTS
    };
    const reservationResult = MerchantTransportAssets.reserve(portMarketId, expeditionId, [waterAllocation]);
    if (!reservationResult) {
      releaseEscortHulls(expeditionId, escortHullIds, "arrived");
      creditStateTreasury(stateId, buyCost); // venture never left port — refund the outlay
      return { ok: false, reason: "no-ships-available" };
    }
    MerchantTransportAssets.depart(reservationResult.reservation.id);

    const now = getSimulationDay();
    const expedition: OverseasExpedition = {
      id: expeditionId,
      stateId,
      realmId,
      purpose: "trade",
      goodId: good.i,
      reservationId: reservationResult.reservation.id,
      escortHullIds,
      portMarketId,
      buyCost,
      departedTick: now,
      etaTick: now + getExpeditionDurationDays(realm.distanceBand),
      state: "outbound"
    };
    const expeditions = getOverseasExpeditions();
    expeditions.push(expedition);
    setOverseasExpeditions(expeditions);
    setNextOverseasExpeditionId(expeditionId + 1);

    this.ensureRelationLedger(stateId, realmId, "contacted");
    return { ok: true, expeditionId };
  }

  sendTributeExpedition(stateId: number, realmId: number, escortCount: number): SendExpeditionResult {
    return this.sendCoercionExpedition(stateId, realmId, "tribute", escortCount);
  }

  sendRaidExpedition(stateId: number, realmId: number, escortCount: number): SendExpeditionResult {
    return this.sendCoercionExpedition(stateId, realmId, "raid", escortCount);
  }

  /** Establish a colony in a weaker Realm; the initial investment is sunk once the convoy departs. */
  sendColonizationExpedition(stateId: number, realmId: number, escortCount: number): SendExpeditionResult {
    const state = getWorldContext().pack.states?.[stateId];
    if (!state?.i || state.removed) return { ok: false, reason: "invalid-state" };
    const realm = getDistantRealms().find(entry => entry.i === realmId);
    if (!realm) return { ok: false, reason: "unknown-realm" };
    if (
      getOverseasExpeditions().some(
        expedition =>
          expedition.stateId === stateId && expedition.realmId === realmId && expedition.state === "outbound"
      )
    ) {
      return { ok: false, reason: "expedition-in-progress" };
    }

    const ledger = getOverseasRelationLedgers().find(entry => entry.stateId === stateId && entry.realmId === realmId);
    if (ledger?.relation === "hostile") return { ok: false, reason: "hostile-realm" };
    if (ledger?.relation === "colony" || this.getPowerTierForState(stateId, realm) !== "weaker") {
      return { ok: false, reason: "power-tier-restricted" };
    }

    const requestedEscortCount = Math.max(0, Math.floor(escortCount));
    if (!requestedEscortCount) return { ok: false, reason: "escort-required" };
    const portMarketId = pickPortMarketForState(stateId);
    if (portMarketId === null) return { ok: false, reason: "no-port" };
    const initialCost = rn(computeColonizationCost(realm.defenseScore), 2);
    if (!debitStateTreasury(stateId, initialCost)) return { ok: false, reason: "insufficient-treasury" };

    const expeditionId = getNextOverseasExpeditionId();
    const escortHullIds = getAvailableEscortHullIds(stateId).slice(0, requestedEscortCount);
    if (escortHullIds.length !== requestedEscortCount || !reserveEscortHulls(stateId, expeditionId, escortHullIds)) {
      creditStateTreasury(stateId, initialCost);
      return { ok: false, reason: "no-escorts-available" };
    }
    const waterAllocation: TransportAllocation = {
      mode: "water",
      transportId: "",
      transportName: "",
      unitCount: 0,
      capacitySlots: 0,
      usedSlots: DEFAULT_EXPEDITION_CARGO_SLOTS
    };
    const reservationResult = MerchantTransportAssets.reserve(portMarketId, expeditionId, [waterAllocation]);
    if (!reservationResult) {
      releaseEscortHulls(expeditionId, escortHullIds, "arrived");
      creditStateTreasury(stateId, initialCost);
      return { ok: false, reason: "no-ships-available" };
    }
    MerchantTransportAssets.depart(reservationResult.reservation.id);

    const now = getSimulationDay();
    const expeditions = getOverseasExpeditions();
    expeditions.push({
      id: expeditionId,
      stateId,
      realmId,
      purpose: "colonizeInitial",
      reservationId: reservationResult.reservation.id,
      escortHullIds,
      portMarketId,
      buyCost: initialCost,
      departedTick: now,
      etaTick: now + getExpeditionDurationDays(realm.distanceBand),
      state: "outbound"
    });
    setOverseasExpeditions(expeditions);
    setNextOverseasExpeditionId(expeditionId + 1);
    this.ensureRelationLedger(stateId, realmId, "contacted");
    return { ok: true, expeditionId };
  }

  /** Armed overseas action. It still needs merchant transport, but no trade-goods outlay. */
  private sendCoercionExpedition(
    stateId: number,
    realmId: number,
    purpose: Extract<ExpeditionPurpose, "tribute" | "raid">,
    escortCount: number
  ): SendExpeditionResult {
    const state = getWorldContext().pack.states?.[stateId];
    if (!state?.i || state.removed) return { ok: false, reason: "invalid-state" };
    const realm = getDistantRealms().find(entry => entry.i === realmId);
    if (!realm) return { ok: false, reason: "unknown-realm" };
    if (
      getOverseasExpeditions().some(
        expedition =>
          expedition.stateId === stateId && expedition.realmId === realmId && expedition.state === "outbound"
      )
    ) {
      return { ok: false, reason: "expedition-in-progress" };
    }

    const ledger = getOverseasRelationLedgers().find(entry => entry.stateId === stateId && entry.realmId === realmId);
    if (ledger?.relation === "hostile") return { ok: false, reason: "hostile-realm" };
    const powerTier = this.getPowerTierForState(stateId, realm);
    if (powerTier === "stronger" || (purpose === "raid" && powerTier !== "weaker")) {
      return { ok: false, reason: "power-tier-restricted" };
    }

    const requestedEscortCount = Math.max(0, Math.floor(escortCount));
    if (!requestedEscortCount) return { ok: false, reason: "escort-required" };
    const portMarketId = pickPortMarketForState(stateId);
    if (portMarketId === null) return { ok: false, reason: "no-port" };

    const expeditionId = getNextOverseasExpeditionId();
    const escortHullIds = getAvailableEscortHullIds(stateId).slice(0, requestedEscortCount);
    if (escortHullIds.length !== requestedEscortCount || !reserveEscortHulls(stateId, expeditionId, escortHullIds)) {
      return { ok: false, reason: "no-escorts-available" };
    }
    const waterAllocation: TransportAllocation = {
      mode: "water",
      transportId: "",
      transportName: "",
      unitCount: 0,
      capacitySlots: 0,
      usedSlots: DEFAULT_EXPEDITION_CARGO_SLOTS
    };
    const reservationResult = MerchantTransportAssets.reserve(portMarketId, expeditionId, [waterAllocation]);
    if (!reservationResult) {
      releaseEscortHulls(expeditionId, escortHullIds, "arrived");
      return { ok: false, reason: "no-ships-available" };
    }
    MerchantTransportAssets.depart(reservationResult.reservation.id);

    const now = getSimulationDay();
    const expeditions = getOverseasExpeditions();
    expeditions.push({
      id: expeditionId,
      stateId,
      realmId,
      purpose,
      reservationId: reservationResult.reservation.id,
      escortHullIds,
      portMarketId,
      buyCost: 0,
      departedTick: now,
      etaTick: now + getExpeditionDurationDays(realm.distanceBand),
      state: "outbound"
    });
    setOverseasExpeditions(expeditions);
    setNextOverseasExpeditionId(expeditionId + 1);
    this.ensureRelationLedger(stateId, realmId, "contacted");
    return { ok: true, expeditionId };
  }

  /** Resolves every overseas expedition whose ETA has arrived. Called once per production month. */
  settleMonthly(): void {
    if (!getDistantRealms().length) return;
    const now = getSimulationDay();

    for (const expedition of getOverseasExpeditions()) {
      if (expedition.state !== "outbound" || now < expedition.etaTick) continue;

      const realm = getDistantRealms().find(entry => entry.i === expedition.realmId);
      const state = getWorldContext().pack.states?.[expedition.stateId];
      if (!realm || !state?.i || state.removed) {
        // Defensive: state or realm vanished mid-voyage. Return the ships, no payout either way.
        MerchantTransportAssets.settleCaravan({ transportReservationId: expedition.reservationId }, "arrived");
        releaseEscortHulls(expedition.id, expedition.escortHullIds ?? [], "arrived");
        expedition.state = "resolved";
        expedition.outcome = { lost: false, profit: 0 };
        continue;
      }

      const shipTier = getReservationShipTier(expedition.reservationId);
      const climateSteps = climateGapSteps(getStateHomeClimateBand(expedition.stateId), realm.climateBand);
      const { roundTripLossRisk, shipwreckRisk } = computeRoundTripLossRisk({
        distanceBand: realm.distanceBand,
        shipTier,
        climateSteps,
        escortRatio:
          (expedition.escortHullIds?.length ?? 0) /
          Math.max(
            1,
            getReservationShipHullIds(expedition.reservationId).length + (expedition.escortHullIds?.length ?? 0)
          )
      });

      const lost = Math.random() < roundTripLossRisk;
      if (lost) {
        const cause: ExpeditionOutcomeCause =
          Math.random() < shipwreckRisk / Math.max(roundTripLossRisk, 1e-9) ? "shipwreck" : "piracy";
        MerchantTransportAssets.settleCaravan({ transportReservationId: expedition.reservationId }, "lost");
        releaseEscortHulls(expedition.id, expedition.escortHullIds ?? [], "lost");
        expedition.outcome = { lost: true, cause };
        // buyCost was already spent when the expedition departed — that is the risk, no refund.
        if (expedition.purpose !== "trade") {
          const ledger = this.ensureRelationLedger(expedition.stateId, expedition.realmId, "contacted");
          ledger.relation = "hostile";
          ledger.relationScore = 0;
        }
        recordOverseasChronicle(
          expedition.stateId,
          realm,
          "lost an overseas expedition",
          `${state.name}'s ${expedition.purpose} expedition to ${realm.name} was lost to ${cause}.`
        );
      } else if (expedition.purpose === "tribute" || expedition.purpose === "raid") {
        const ledger = this.ensureRelationLedger(expedition.stateId, expedition.realmId, "contacted");
        const powerTier = this.getPowerTierForState(expedition.stateId, realm);
        const succeeded =
          Math.random() <
          computeCoercionSuccessChance({
            purpose: expedition.purpose,
            powerTier,
            defenseScore: realm.defenseScore,
            escortCount: expedition.escortHullIds?.length ?? 0,
            relationScore: ledger.relationScore ?? 0
          });
        if (!succeeded) {
          MerchantTransportAssets.settleCaravan({ transportReservationId: expedition.reservationId }, "lost");
          releaseEscortHulls(expedition.id, expedition.escortHullIds ?? [], "lost");
          expedition.outcome = { lost: true, cause: "repelled" };
          ledger.relation = "hostile";
          ledger.relationScore = 0;
          recordOverseasChronicle(
            expedition.stateId,
            realm,
            "had an overseas expedition repelled",
            `${state.name}'s ${expedition.purpose} expedition was repelled by ${realm.name}.`
          );
        } else {
          MerchantTransportAssets.settleCaravan({ transportReservationId: expedition.reservationId }, "arrived");
          releaseEscortHulls(expedition.id, expedition.escortHullIds ?? [], "arrived");
          const revenue = rn(
            computeCoercionRevenue({ purpose: expedition.purpose, wealthLevel: realm.wealthLevel }),
            2
          );
          creditStateTreasury(expedition.stateId, revenue);
          realm.wealthLevel = rn(Math.max(0, realm.wealthLevel - revenue), 2);
          expedition.outcome = { lost: false, revenue, profit: revenue };
          ledger.relation = expedition.purpose === "tribute" ? "tributary" : "hostile";
          ledger.relationScore = expedition.purpose === "tribute" ? 25 : 0;
          recordOverseasChronicle(
            expedition.stateId,
            realm,
            expedition.purpose === "tribute" ? "secured overseas tribute" : "raided an overseas realm",
            expedition.purpose === "tribute"
              ? `${state.name} secured tribute from ${realm.name}.`
              : `${state.name} raided ${realm.name}, leaving the realm hostile.`
          );
        }
        expedition.state = "resolved";
        ledger.lastResolvedTick = now;
        continue;
      } else if (expedition.purpose === "colonizeInitial") {
        const ledger = this.ensureRelationLedger(expedition.stateId, expedition.realmId, "contacted");
        const succeeded =
          Math.random() <
          computeColonizationSuccessChance({
            defenseScore: realm.defenseScore,
            escortCount: expedition.escortHullIds?.length ?? 0,
            relationScore: ledger.relationScore ?? 0
          });
        if (!succeeded) {
          MerchantTransportAssets.settleCaravan({ transportReservationId: expedition.reservationId }, "lost");
          releaseEscortHulls(expedition.id, expedition.escortHullIds ?? [], "lost");
          expedition.outcome = { lost: true, cause: "repelled" };
          ledger.relation = "hostile";
          ledger.relationScore = 0;
          recordOverseasChronicle(
            expedition.stateId,
            realm,
            "had a colonial expedition repelled",
            `${state.name}'s colonial expedition was repelled by ${realm.name}.`
          );
        } else {
          MerchantTransportAssets.settleCaravan({ transportReservationId: expedition.reservationId }, "arrived");
          releaseEscortHulls(expedition.id, expedition.escortHullIds ?? [], "arrived");
          ledger.relation = "colony";
          ledger.relationScore = 10;
          ledger.colonyGarrisonRequired = rn(
            computeColonyGarrisonRequirement({ defenseScore: realm.defenseScore, distanceBand: realm.distanceBand }),
            2
          );
          ledger.colonyGarrisonFunded = 0;
          ledger.colonyPortMarketId = expedition.portMarketId;
          ledger.lastColonyOutput = 0;
          ledger.monthsUnderfunded = 0;
          expedition.outcome = { lost: false, profit: 0 };
          recordOverseasChronicle(
            expedition.stateId,
            realm,
            "founded an overseas colony",
            `${state.name} founded a colony in ${realm.name}.`
          );
        }
        expedition.state = "resolved";
        ledger.lastResolvedTick = now;
        continue;
      } else {
        MerchantTransportAssets.settleCaravan({ transportReservationId: expedition.reservationId }, "arrived");
        releaseEscortHulls(expedition.id, expedition.escortHullIds ?? [], "arrived");
        const good = getGoods().find(entry => entry.i === expedition.goodId);
        const powerTier = this.getPowerTierForState(expedition.stateId, realm);
        const distancePremium = good ? getDefaultGoodTradeProfile(good).distancePremium : 0;
        const grossReturn = rn(computeExpeditionReturn({ buyCost: expedition.buyCost, powerTier, distancePremium }), 2);
        creditStateTreasury(expedition.stateId, grossReturn);
        expedition.outcome = { lost: false, profit: rn(grossReturn - expedition.buyCost, 2) };
        const priorLedger = getOverseasRelationLedgers().find(
          entry => entry.stateId === expedition.stateId && entry.realmId === expedition.realmId
        );
        const hadTradingRelation = Boolean(priorLedger && RELATION_RANK[priorLedger.relation] >= RELATION_RANK.trading);
        const ledger = this.ensureRelationLedger(expedition.stateId, expedition.realmId, "trading");
        ledger.relationScore = Math.min(100, (ledger.relationScore ?? 0) + 5);
        if (!hadTradingRelation) {
          recordOverseasChronicle(
            expedition.stateId,
            realm,
            "opened overseas trade",
            `${state.name} opened a trade route with ${realm.name}.`
          );
        }
      }

      expedition.state = "resolved";
      const ledger = this.ensureRelationLedger(expedition.stateId, expedition.realmId, "contacted");
      ledger.lastResolvedTick = now;
    }

    for (const ledger of getOverseasRelationLedgers()) {
      ledger.lastTributePaid = 0;
      if (ledger.relation !== "tributary") continue;
      const realm = getDistantRealms().find(entry => entry.i === ledger.realmId);
      const state = getWorldContext().pack.states?.[ledger.stateId];
      if (!realm || !state?.i || state.removed) continue;
      const tribute = rn(computeMonthlyTributeRevenue(realm.wealthLevel), 2);
      if (tribute <= 0) continue;
      creditStateTreasury(ledger.stateId, tribute);
      ledger.lastTributePaid = tribute;
    }

    for (const ledger of getOverseasRelationLedgers()) {
      ledger.lastColonyOutput = 0;
      if (ledger.relation !== "colony") continue;
      const realm = getDistantRealms().find(entry => entry.i === ledger.realmId);
      const state = getWorldContext().pack.states?.[ledger.stateId];
      if (!realm || !state?.i || state.removed) continue;

      const required = Math.max(
        1,
        ledger.colonyGarrisonRequired ??
          computeColonyGarrisonRequirement({ defenseScore: realm.defenseScore, distanceBand: realm.distanceBand })
      );
      ledger.colonyGarrisonRequired = rn(required, 2);
      const requestedUpkeep = required * COLONY_GARRISON_UPKEEP_PER_UNIT;
      const paidUpkeep = Math.min(Math.max(0, state.treasury ?? 0), requestedUpkeep);
      state.treasury = rn(Math.max(0, (state.treasury ?? 0) - paidUpkeep), 2);
      ledger.colonyGarrisonFunded = rn(paidUpkeep / COLONY_GARRISON_UPKEEP_PER_UNIT, 2);
      if ((ledger.colonyGarrisonFunded ?? 0) + 1e-6 < required) ledger.monthsUnderfunded += 1;
      else ledger.monthsUnderfunded = 0;

      if (ledger.monthsUnderfunded >= COLONY_REBELLION_MONTHS) {
        ledger.relation = "hostile";
        ledger.relationScore = 0;
        ledger.colonyGarrisonRequired = undefined;
        ledger.colonyGarrisonFunded = undefined;
        ledger.colonyPortMarketId = undefined;
        recordOverseasChronicle(
          ledger.stateId,
          realm,
          "lost an overseas colony to rebellion",
          `${state.name}'s colony in ${realm.name} rebelled after its garrison went unfunded.`
        );
        continue;
      }

      const good = realm.specialtyGoodNames
        .map(findGoodByName)
        .find((entry): entry is Good => Boolean(entry && isGoodEnabled(entry)));
      const market = ledger.colonyPortMarketId ? getMarketById(ledger.colonyPortMarketId) : undefined;
      if (!good || !market) continue;
      const output = rn(
        computeColonyMonthlyOutput(realm.wealthLevel) * computeColonyOutputFactor(ledger.monthsUnderfunded),
        2
      );
      if (output <= 0) continue;
      const marketGood = market.goods[good.i] ?? { stock: 0, price: good.value };
      marketGood.stock = rn(marketGood.stock + output, 2);
      market.goods[good.i] = marketGood;
      ledger.lastColonyOutput = output;
      markRetailInventoryDirty(market.i);
    }
  }

  getOverseasRelationsOverview(stateId: number): OverseasRealmStatusRow[] {
    const ledgers = getOverseasRelationLedgers();
    const expeditions = getOverseasExpeditions();
    return getDistantRealms().map(realm => {
      const ledger = ledgers.find(entry => entry.stateId === stateId && entry.realmId === realm.i);
      const active = expeditions.find(
        expedition =>
          expedition.stateId === stateId && expedition.realmId === realm.i && expedition.state === "outbound"
      );
      const lastResolved = expeditions
        .filter(
          expedition =>
            expedition.stateId === stateId && expedition.realmId === realm.i && expedition.state === "resolved"
        )
        .sort((a, b) => b.etaTick - a.etaTick)[0];
      const colonyGoodName = realm.specialtyGoodNames.find(name => Boolean(findGoodByName(name))) ?? null;

      return {
        realmId: realm.i,
        realmName: realm.name,
        climateBand: realm.climateBand,
        distanceBand: realm.distanceBand,
        specialtyGoodNames: realm.specialtyGoodNames,
        powerTier: this.getPowerTierForState(stateId, realm),
        relation: ledger?.relation ?? "unknown",
        lastTributePaid: ledger?.lastTributePaid ?? 0,
        colonyGarrisonRequired: ledger?.colonyGarrisonRequired ?? null,
        colonyGarrisonFunded: ledger?.colonyGarrisonFunded ?? null,
        monthsUnderfunded: ledger?.monthsUnderfunded ?? 0,
        lastColonyOutput: ledger?.lastColonyOutput ?? 0,
        colonyGoodName,
        activeExpedition: active
          ? {
              purpose: active.purpose,
              departedTick: active.departedTick,
              etaTick: active.etaTick,
              escortCount: active.escortHullIds?.length ?? 0
            }
          : null,
        lastOutcome:
          lastResolved?.outcome !== undefined
            ? { purpose: lastResolved.purpose, ...lastResolved.outcome, resolvedTick: lastResolved.etaTick }
            : null
      };
    });
  }
}

export const OverseasRelations = new OverseasRelationsModule();
