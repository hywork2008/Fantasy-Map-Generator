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
import type { MilitaryResource, MilitaryResourceLedger } from "./militaryResourcesTypes";
import { getStateSecretMaterialMultiplier } from "./stateSecretKnowledge";

export type { MilitaryResource, MilitaryResourceLedger } from "./militaryResourcesTypes";
export { MILITARY_RESOURCES } from "./militaryResourcesTypes";

type ResourceAmounts = Partial<Record<MilitaryResource, number>>;

const MONTHS_PER_YEAR = 12;
const ARTILLERY_IRON_PER_GUN = 0.04;
const ARTILLERY_LEAD_PER_GUN = 0.03;
const ARTILLERY_GUNPOWDER_PER_GUN = 0.02;
const FIREARM_IRON_PER_HEAD = 0.004;
const FIREARM_GUNPOWDER_PER_HEAD = 0.012;
// Mounted units (options.military type "mounted") need fodder for their horses regardless of
// gunpowder-era status — cavalry predates firearms. Uncalibrated, same as the rest of this file.
const MOUNTED_FODDER_PER_HEAD = 0.08;
// Archer units (name matches /archer|bowman|longbow|crossbow/) need arrows regardless of
// gunpowder-era status — bows predate and outlast firearms. Uncalibrated.
const ARCHER_ARROWS_PER_HEAD = 0.05;
// Firearm units need finished Bullets (a crafted Good, see goods-generator.ts), not raw lead
// directly — ARTILLERY_LEAD_PER_GUN above still draws raw Lead Ingot for artillery's own
// grapeshot/lining use, which Bullets doesn't cover. Uncalibrated.
const FIREARM_BULLETS_PER_HEAD = 0.012;

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

      // Fodder and arrows are settled regardless of era; iron/lead/gunpowder/bullets only apply
      // once firearms/artillery exist.
      const resources = gunpowderEraEnabled
        ? (["fodder", "arrows", "iron", "lead", "gunpowder", "bullets"] as const)
        : (["fodder", "arrows"] as const);

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
    let archers = 0;
    for (const regiment of state.military || []) {
      for (const [unitName, rawCount] of Object.entries(regiment.u || {})) {
        const count = rawCount / populationRate;
        if (this.isArtillery(unitName)) artillery += count;
        else if (this.isFirearm(unitName)) firearms += count;
        if (isMountedUnit(unitName)) mounted += count;
        if (this.isArcher(unitName)) archers += count;
      }
    }

    const demand: ResourceAmounts = {};
    const fodder = rn(mounted * MOUNTED_FODDER_PER_HEAD, 4);
    if (fodder > 0) demand.fodder = fodder;
    const arrows = rn(archers * ARCHER_ARROWS_PER_HEAD, 4);
    if (arrows > 0) demand.arrows = arrows;

    if (!gunpowderEraEnabled) return demand;

    // Better black-powder chemistry needs less raw sulfur/saltpeter/coal per unit of gunpowder
    // produced — the pyrotechnics state secret (docs/plan/knowledge-guild-system.md §9 Phase 4)
    // reduces gunpowder demand itself, so saltpeter/sulfur/coal (derived from it below) scale down
    // with it automatically.
    const pyrotechnicsMultiplier = getStateSecretMaterialMultiplier(stateId, "pyrotechnics");
    const gunpowder =
      (artillery * ARTILLERY_GUNPOWDER_PER_GUN + firearms * FIREARM_GUNPOWDER_PER_HEAD) * pyrotechnicsMultiplier;
    demand.iron = rn(artillery * ARTILLERY_IRON_PER_GUN + firearms * FIREARM_IRON_PER_HEAD, 4);
    demand.gunpowder = rn(gunpowder, 4);
    demand.bullets = rn(firearms * FIREARM_BULLETS_PER_HEAD, 4);
    // Bullets and Gunpowder are consumed as finished Goods. These fields expose their
    // recipe-level strategic inputs without consuming them a second time in the same market
    // cycle. Artillery's own lead use (grapeshot/lining) is unrelated to small-arm Bullets, so
    // it's still drawn directly below.
    demand.lead = rn(artillery * ARTILLERY_LEAD_PER_GUN, 4);
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

  private isArcher(unitName: string): boolean {
    return /archer|bowman|longbow|crossbow/.test(unitName.toLowerCase());
  }
}

export const MilitaryResources = new MilitaryResourcesModule();
