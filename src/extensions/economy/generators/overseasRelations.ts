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
 * Scope: trade plus optional state-navy escorts. Tribute/raid (Phase 3), and colonization
 * (Phase 4) are not implemented — PowerTier is computed and shown, but nothing here gates
 * on it besides which multiplier a trade run gets.
 */

import { SHIP_CLASS_DEFINITIONS } from "../../hostTypes";
import { rn } from "../../hostUtils";
import {
  getDistantRealms,
  getGoods,
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
  OverseasExpedition,
  OverseasRelationLedger,
  PowerTier,
  RealmRelation
} from "./overseasRelationsTypes";
import {
  climateGapSteps,
  computeExpeditionBuyCost,
  computeExpeditionReturn,
  computeOverseasProjectionScore,
  computeRoundTripLossRisk,
  FALLBACK_SHIP_TIER,
  getExpeditionDurationDays,
  getPowerTier
} from "./overseasVoyageRisk";

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
    specialtyGoodNames: ["Spices", "Ivory", "Coral"]
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
    specialtyGoodNames: ["Silk", "Sugarcane", "Dyes"]
  },
  {
    name: "Tepal Highlands",
    climateBand: "subtropical",
    distanceBand: "farAbroad",
    powerScore: 35,
    wealthLevel: 650,
    defenseScore: 25,
    specialtyGoodNames: ["Tobacco", "Cotton", "Pearls"]
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
    specialtyGoodNames: ["Spices", "Sugarcane", "Pearls"]
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
    specialtyGoodNames: ["Cotton", "Dyes", "Ivory"]
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
  | "no-escorts-available";

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
  activeExpedition: { departedTick: number; etaTick: number; escortCount: number } | null;
  lastOutcome: { lost: boolean; cause?: ExpeditionOutcomeCause; profit?: number; resolvedTick: number } | null;
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

function isSeaPortBurg(burg: { i?: number; removed?: boolean; port?: number; market?: number }): boolean {
  return Boolean(burg.i && !burg.removed && burg.port && typeof burg.market === "number" && burg.market > 0);
}

function listStatePortBurgs(stateId: number) {
  const burgs = getWorldContext().pack.burgs ?? [];
  return burgs.filter(burg => burg?.state === stateId && isSeaPortBurg(burg));
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
      ledger = { stateId, realmId, relation: atLeast, monthsUnderfunded: 0 };
      ledgers.push(ledger);
      setOverseasRelationLedgers(ledgers);
    } else if (RELATION_RANK[ledger.relation] < RELATION_RANK[atLeast]) {
      ledger.relation = atLeast;
    }
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
      } else {
        MerchantTransportAssets.settleCaravan({ transportReservationId: expedition.reservationId }, "arrived");
        releaseEscortHulls(expedition.id, expedition.escortHullIds ?? [], "arrived");
        const good = getGoods().find(entry => entry.i === expedition.goodId);
        const powerTier = this.getPowerTierForState(expedition.stateId, realm);
        const distancePremium = good ? getDefaultGoodTradeProfile(good).distancePremium : 0;
        const grossReturn = rn(computeExpeditionReturn({ buyCost: expedition.buyCost, powerTier, distancePremium }), 2);
        creditStateTreasury(expedition.stateId, grossReturn);
        expedition.outcome = { lost: false, profit: rn(grossReturn - expedition.buyCost, 2) };
        this.ensureRelationLedger(expedition.stateId, expedition.realmId, "trading");
      }

      expedition.state = "resolved";
      const ledger = this.ensureRelationLedger(expedition.stateId, expedition.realmId, "contacted");
      ledger.lastResolvedTick = now;
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

      return {
        realmId: realm.i,
        realmName: realm.name,
        climateBand: realm.climateBand,
        distanceBand: realm.distanceBand,
        specialtyGoodNames: realm.specialtyGoodNames,
        powerTier: this.getPowerTierForState(stateId, realm),
        relation: ledger?.relation ?? "unknown",
        activeExpedition: active
          ? {
              departedTick: active.departedTick,
              etaTick: active.etaTick,
              escortCount: active.escortHullIds?.length ?? 0
            }
          : null,
        lastOutcome:
          lastResolved?.outcome !== undefined ? { ...lastResolved.outcome, resolvedTick: lastResolved.etaTick } : null
      };
    });
  }
}

export const OverseasRelations = new OverseasRelationsModule();
