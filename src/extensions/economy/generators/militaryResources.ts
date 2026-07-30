import { rn } from "../../hostUtils";
import {
  getGoods,
  getMarkets,
  getMilitaryResourceLedgers,
  getWorldContext,
  setMilitaryResourceLedgers
} from "../economyContext";
import { Markets } from "./markets-generator";
import { isMountedUnit } from "./militaryLogistics";

export const MILITARY_RESOURCES = ["iron", "lead", "gunpowder", "saltpeter", "sulfur", "coal", "fodder"] as const;
export type MilitaryResource = (typeof MILITARY_RESOURCES)[number];

type ResourceAmounts = Partial<Record<MilitaryResource, number>>;

/**
 * State demand for the materials consumed by artillery and firearm units.
 * Values use Economy Good units, rather than historical tonnes, so they can be
 * compared directly with market stock and mine output.
 */
export interface MilitaryResourceLedger {
  stateId: number;
  supplyMarketId: number | null;
  annualDemand: ResourceAmounts;
  /** Direct inputs actually taken from the state market in the last production cycle. */
  lastConsumed: ResourceAmounts;
  /** Demand not met by local market reserves in the last production cycle. */
  unmetDemand: ResourceAmounts;
}

const MONTHS_PER_YEAR = 12;
const ARTILLERY_IRON_PER_GUN = 0.04;
const ARTILLERY_LEAD_PER_GUN = 0.03;
const ARTILLERY_GUNPOWDER_PER_GUN = 0.02;
const FIREARM_IRON_PER_HEAD = 0.004;
const FIREARM_LEAD_PER_HEAD = 0.012;
const FIREARM_GUNPOWDER_PER_HEAD = 0.012;
// Mounted units (options.military type "mounted") need fodder for their horses regardless of
// gunpowder-era status — cavalry predates firearms. Uncalibrated, same as the rest of this file.
const MOUNTED_FODDER_PER_HEAD = 0.08;

/** Settles state military material demand against its principal market. */
export class MilitaryResourcesModule {
  generate(): void {
    const previous = new Map(getMilitaryResourceLedgers().map(ledger => [ledger.stateId, ledger]));
    const ledgers: MilitaryResourceLedger[] = [];
    const gunpowderEraEnabled = getWorldContext().options.gunpowderEraEnabled !== false;
    for (const state of getWorldContext().pack.states) {
      if (!state.i || state.removed) continue;
      const prior = previous.get(state.i);
      ledgers.push({
        stateId: state.i,
        supplyMarketId: this.getSupplyMarketId(state.i),
        annualDemand: this.getAnnualDemand(state.i, gunpowderEraEnabled),
        lastConsumed: prior?.lastConsumed ?? {},
        unmetDemand: prior?.unmetDemand ?? {}
      });
    }
    setMilitaryResourceLedgers(ledgers);
  }

  clear(): void {
    setMilitaryResourceLedgers([]);
  }

  /** Runs once per Economy production month, before workshops make replacement goods. */
  settleMonthly(): void {
    const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));
    const gunpowderEraEnabled = getWorldContext().options.gunpowderEraEnabled !== false;

    for (const ledger of getMilitaryResourceLedgers()) {
      ledger.supplyMarketId = this.getSupplyMarketId(ledger.stateId);
      ledger.annualDemand = this.getAnnualDemand(ledger.stateId, gunpowderEraEnabled);
      ledger.lastConsumed = {};
      ledger.unmetDemand = {};
      if (!ledger.supplyMarketId) continue;

      // Fodder is settled regardless of era; iron/lead/gunpowder only apply once firearms exist.
      const resources = gunpowderEraEnabled
        ? (["fodder", "iron", "lead", "gunpowder"] as const)
        : (["fodder"] as const);

      for (const resource of resources) {
        const requested = (ledger.annualDemand[resource] ?? 0) / MONTHS_PER_YEAR;
        if (requested <= 0) continue;
        const good = goodsByName.get(resource === "iron" || resource === "lead" ? `${resource} ingot` : resource);
        const supplied = good ? Markets.consumeForMilitary(ledger.supplyMarketId, good.i, requested) : 0;
        ledger.lastConsumed[resource] = supplied;
        ledger.unmetDemand[resource] = rn(Math.max(0, requested - supplied), 4);
      }
    }
  }

  private getSupplyMarketId(stateId: number): number | null {
    const burgs = getWorldContext().pack.burgs;
    const market = getMarkets()
      .filter(candidate => burgs[candidate.centerBurgId]?.state === stateId)
      .sort((a, b) => (burgs[b.centerBurgId]?.population ?? 0) - (burgs[a.centerBurgId]?.population ?? 0))[0];
    return market?.i ?? null;
  }

  private getAnnualDemand(stateId: number, gunpowderEraEnabled: boolean): ResourceAmounts {
    const state = getWorldContext().pack.states[stateId];
    if (!state || state.removed) return {};

    const populationRate = getWorldContext().populationRate || 1;
    let artillery = 0;
    let firearms = 0;
    let mounted = 0;
    for (const regiment of state.military || []) {
      for (const [unitName, rawCount] of Object.entries(regiment.u || {})) {
        const count = rawCount / populationRate;
        if (this.isArtillery(unitName)) artillery += count;
        else if (this.isFirearm(unitName)) firearms += count;
        if (isMountedUnit(unitName)) mounted += count;
      }
    }

    const demand: ResourceAmounts = {};
    const fodder = rn(mounted * MOUNTED_FODDER_PER_HEAD, 4);
    if (fodder > 0) demand.fodder = fodder;

    if (!gunpowderEraEnabled) return demand;

    const gunpowder = artillery * ARTILLERY_GUNPOWDER_PER_GUN + firearms * FIREARM_GUNPOWDER_PER_HEAD;
    demand.iron = rn(artillery * ARTILLERY_IRON_PER_GUN + firearms * FIREARM_IRON_PER_HEAD, 4);
    demand.lead = rn(artillery * ARTILLERY_LEAD_PER_GUN + firearms * FIREARM_LEAD_PER_HEAD, 4);
    demand.gunpowder = rn(gunpowder, 4);
    // Gunpowder is consumed as a finished Good. These fields expose its recipe-level
    // strategic inputs without consuming them a second time in the same market cycle.
    demand.saltpeter = rn(gunpowder * 0.5, 4);
    demand.sulfur = rn(gunpowder * 0.25, 4);
    demand.coal = rn(gunpowder * 0.5, 4);
    return demand;
  }

  private isArtillery(unitName: string): boolean {
    return unitName.toLowerCase() === "artillery";
  }

  private isFirearm(unitName: string): boolean {
    return /arquebus|musketeer|musket|firearm|handgun|gunner/.test(unitName.toLowerCase());
  }
}

export const MilitaryResources = new MilitaryResourcesModule();
