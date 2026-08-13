import { getGunpowderDemandTechMultiplier } from "../../../generators/technologyProgress";
import { isFirearmMilitaryUnitName } from "../../../utils/gunpowderEra";
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
import { type MilitaryResource, type MilitaryResourceLedger, MOUNTED_FODDER_PER_HEAD } from "./militaryResourcesTypes";
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
// Archer units (name matches /archer|bowman|longbow|crossbow/) need arrows regardless of
// gunpowder-era status — bows predate and outlast firearms. Uncalibrated.
const ARCHER_ARROWS_PER_HEAD = 0.05;
// Firearm units need finished Bullets (a crafted Good, see goods-generator.ts), not raw lead
// directly — ARTILLERY_LEAD_PER_GUN above still draws raw Lead Ingot for artillery's own
// grapeshot/lining use, which Bullets doesn't cover. Uncalibrated.
const FIREARM_BULLETS_PER_HEAD = 0.012;
/** Replacement weapons and personal protection for every active troop. */
const ARMS_PER_HEAD = 0.01;

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

      // Finished Arms, Arrows, Gunpowder, Bullets, and Muskets are fulfilled through Metallurg work orders
      // after generic production runs. This ledger keeps only direct operational material draws.
      const resources = gunpowderEraEnabled
        ? (["fodder", "arms", "arrows", "iron", "lead", "gunpowder", "bullets", "muskets"] as const)
        : (["fodder", "arms", "arrows"] as const);

      for (const resource of resources) {
        const requested = (ledger.annualDemand[resource] ?? 0) / MONTHS_PER_YEAR;
        if (requested <= 0) continue;
        if (
          resource === "arms" ||
          resource === "arrows" ||
          resource === "gunpowder" ||
          resource === "bullets" ||
          resource === "muskets"
        ) {
          ledger.lastConsumed[resource] = 0;
          ledger.unmetDemand[resource] = requested;
          continue;
        }
        const good = goodsByName.get(resource === "iron" || resource === "lead" ? `${resource} ingot` : resource);
        const supplied = good ? Markets.consumeForMilitary(ledger.supplyMarketId, good.i, requested) : 0;
        ledger.lastConsumed[resource] = supplied;
        ledger.unmetDemand[resource] = rn(Math.max(0, requested - supplied), 4);
      }
    }
  }

  /** Records a completed Metallurg delivery against this month's state equipment demand. */
  recordFinishedGoodsDelivery(stateId: number, goodName: string, units: number): void {
    if (!(units > 0)) return;
    const resource = (
      {
        Arms: "arms",
        Arrows: "arrows",
        Gunpowder: "gunpowder",
        Bullets: "bullets",
        Muskets: "muskets"
      } as const
    )[goodName];
    if (!resource) return;
    const ledger = getMilitaryResourceLedgers().find(candidate => candidate.stateId === stateId);
    if (!ledger) return;
    const delivered = rn((ledger.lastConsumed[resource] ?? 0) + units, 4);
    ledger.lastConsumed[resource] = delivered;
    const requested = (ledger.annualDemand[resource] ?? 0) / MONTHS_PER_YEAR;
    ledger.unmetDemand[resource] = rn(Math.max(0, requested - delivered), 4);
    setMilitaryResourceLedgers(getMilitaryResourceLedgers());
  }

  private getSupplyMarketId(stateId: number): number | null {
    const burgs = getWorldContext().pack.burgs;
    const market = getMarkets()
      .filter(candidate => burgs[candidate.centerBurgId]?.state === stateId)
      .sort((a, b) => (burgs[b.centerBurgId]?.population ?? 0) - (burgs[a.centerBurgId]?.population ?? 0))[0];
    return market?.i ?? null;
  }

  /** Shared source of truth for Metallurg's finished military-Good work orders. */
  getAnnualDemandForState(stateId: number): Readonly<ResourceAmounts> {
    return this.getAnnualDemand(stateId, getWorldContext().options.gunpowderEraEnabled !== false);
  }

  private getAnnualDemand(stateId: number, gunpowderEraEnabled: boolean): ResourceAmounts {
    const state = getWorldContext().pack.states[stateId];
    if (!state || state.removed) return {};

    const populationRate = getWorldContext().populationRate || 1;
    let artillery = 0;
    let firearms = 0;
    let mounted = 0;
    let archers = 0;
    let troops = 0;
    for (const regiment of state.military || []) {
      for (const [unitName, rawCount] of Object.entries(regiment.u || {})) {
        const count = rawCount / populationRate;
        troops += count;
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
    const arms = rn(troops * ARMS_PER_HEAD, 4);
    if (arms > 0) demand.arms = arms;

    if (!gunpowderEraEnabled) return demand;

    // Better black-powder chemistry needs less raw sulfur/saltpeter/coal per unit of gunpowder
    // produced — the pyrotechnics state secret (docs/plan/knowledge-guild-system.md §9 Phase 4)
    // reduces gunpowder demand itself, so saltpeter/sulfur/coal (derived from it below) scale down
    // with it automatically. Host technology graph further scales by state adoption stage
    // (docs/plan/technology-development-roadmap.md Phase 2): pre-demonstration programs waste powder.
    const pyrotechnicsMultiplier = getStateSecretMaterialMultiplier(stateId, "pyrotechnics");
    // Host technology graph (roadmap Phase 2): pre-demonstration programs waste powder.
    const techDemandMultiplier = getGunpowderDemandTechMultiplier(stateId);
    const gunpowder =
      (artillery * ARTILLERY_GUNPOWDER_PER_GUN + firearms * FIREARM_GUNPOWDER_PER_HEAD) *
      pyrotechnicsMultiplier *
      techDemandMultiplier;
    demand.iron = rn(artillery * ARTILLERY_IRON_PER_GUN + firearms * FIREARM_IRON_PER_HEAD, 4);
    demand.gunpowder = rn(gunpowder, 4);
    demand.bullets = rn(firearms * FIREARM_BULLETS_PER_HEAD, 4);
    // Bullets and Gunpowder are consumed as finished Goods. These fields expose their
    // recipe-level strategic inputs without consuming them a second time in the same market
    // cycle. Artillery's own lead use (grapeshot/lining) is unrelated to small-arm Bullets, so
    // it's still drawn directly below.
    demand.lead = rn(artillery * ARTILLERY_LEAD_PER_GUN, 4);
    // Mirrors Gunpowder's own recipe ratio in goods-generator.ts (75% Saltpeter / 10% Sulfur /
    // 15% Charcoal, the historical "corned powder" composition) — kept as a literal duplicate
    // here because this ledger reports the raw-material breakdown behind Gunpowder demand for
    // display purposes without drawing a second time on the market (see comment above). "coal"
    // is this ledger's field name for that Charcoal share, not the separate mined-fuel Coal Good.
    demand.saltpeter = rn(gunpowder * 0.75, 4);
    demand.sulfur = rn(gunpowder * 0.1, 4);
    demand.coal = rn(gunpowder * 0.15, 4);

    // Firearm units carry a personal firearm (Muskets, a finished Good distinct from Gunpowder/
    // Bullets above — see goods-generator.ts) instead of the generic melee Arms set. Move their
    // share of the base Arms demand over once the era is active, so Muskets production tracks
    // actual musketeer headcount the same way the Artillery plan above already tracks gun crews.
    const muskets = rn(firearms * ARMS_PER_HEAD, 4);
    if (muskets > 0) {
      demand.muskets = muskets;
      const meleeArms = rn((troops - firearms) * ARMS_PER_HEAD, 4);
      if (meleeArms > 0) demand.arms = meleeArms;
      else delete demand.arms;
    }
    return demand;
  }

  private isArtillery(unitName: string): boolean {
    return unitName.toLowerCase() === "artillery";
  }

  private isFirearm(unitName: string): boolean {
    return isFirearmMilitaryUnitName(unitName);
  }

  private isArcher(unitName: string): boolean {
    return /archer|bowman|longbow|crossbow/.test(unitName.toLowerCase());
  }
}

export const MilitaryResources = new MilitaryResourcesModule();
