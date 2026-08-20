import { getGunpowderDemandTechMultiplier } from "../../../generators/technologyProgress";
import { isFirearmMilitaryUnitName } from "../../../utils/gunpowderEra";
import { addCivilianMalePeople, isManpowerSimEnabled, Military } from "../../hostCore";
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
import {
  type MilitaryConsumableResource,
  type MilitaryResource,
  type MilitaryResourceLedger,
  MOUNTED_FODDER_PER_HEAD
} from "./militaryResourcesTypes";
import { getStateSecretMaterialMultiplier } from "./stateSecretKnowledge";

export type { MilitaryResource, MilitaryResourceLedger } from "./militaryResourcesTypes";
export { MILITARY_RESOURCES } from "./militaryResourcesTypes";

type ResourceAmounts = Partial<Record<MilitaryResource, number>>;

const STOCKPILED_RESOURCES = [
  "arrows",
  "gunpowder",
  "bullets"
] as const satisfies readonly MilitaryConsumableResource[];

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

// docs/plan/military-era-progression.md §5 Phase 3 — armored/aviation/fieldArtillery/
// machineGunners' equipment and fuel demand. Unlike the plannedU-gated Muskets/Arms establishment
// above, these are drawn straight from the market every month like Iron/Lead/Fodder (the plan's
// own Phase 3 note explicitly defers applying the plannedU dormant-establishment pattern to these
// new units — decide that only after Phase 1/2 see real play). All uncalibrated.
/** Steel barrels/receivers on top of fieldArtillery/machineGunners' existing Iron/Lead/Gunpowder draw (via isArtilleryLike()/isFirearm() below) — see needsModernSteel(). */
const MODERN_STEEL_PER_HEAD = 0.05;
/** Hull and armor plating. */
const STEEL_PER_ARMORED_HEAD = 0.15;
/** Engine fuel — see internalCombustionEngine's own refinedFuelAccess threshold (Kerosene market coverage). */
const KEROSENE_PER_ARMORED_HEAD = 0.06;
/** Airframe structure — electrolyticIndustry's Aluminum, per roadmap §9.4. */
const ALUMINUM_PER_AVIATION_HEAD = 0.2;
/** Engine fuel — higher burn than ground vehicles. */
const KEROSENE_PER_AVIATION_HEAD = 0.08;

/** Settles state military material demand against its principal market. */
export class MilitaryResourcesModule {
  generate(): void {
    this.unstockInitialFirearmForces();
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
        lastDelivered: prior?.lastDelivered ?? {},
        consumableStock: prior?.consumableStock ?? {},
        unmetDemand: prior?.unmetDemand ?? {}
      });
    }
    setMilitaryResourceLedgers(ledgers);
  }

  clear(): void {
    setMilitaryResourceLedgers([]);
  }

  /**
   * Converts generated firearm formations into dormant establishments once, returning their
   * already-reconciled soldiers to the civilian pool. The Economy later activates those exact
   * slots as State armories receive Muskets or Artillery.
   */
  unstockInitialFirearmForces(): boolean {
    const world = getWorldContext();
    if (!world.options.initialFirearmsUnstocked) return false;

    let changed = false;
    for (const state of world.pack.states) {
      if (!state?.i || state.removed) continue;
      for (const regiment of state.military ?? []) {
        let releasedTroops = 0;
        const plannedU = { ...(regiment.plannedU ?? {}) };

        for (const [unitName, rawCount] of Object.entries(regiment.u)) {
          if ((!this.isFirearm(unitName) && !this.isArtillery(unitName)) || plannedU[unitName] !== undefined) {
            continue;
          }
          plannedU[unitName] = rawCount;
          delete regiment.u[unitName];
          releasedTroops += rawCount;
        }

        if (!(releasedTroops > 0)) continue;
        regiment.plannedU = plannedU;
        regiment.a = Math.max(0, (regiment.a ?? releasedTroops) - releasedTroops);
        regiment.t = Math.max(0, (regiment.t ?? releasedTroops) - releasedTroops);
        regiment.icon = Military.getEmblem(regiment);
        if (world.pack.cells?.province && world.pack.provinces) {
          regiment.name = Military.getName(regiment, state.military ?? []);
        }
        if (isManpowerSimEnabled() && state.manpowerReconciled) {
          addCivilianMalePeople(world.pack, state.i, releasedTroops, { preferredProvince: regiment.homeProvince });
        }
        changed = true;
      }
    }
    return changed;
  }

  /** Runs once per Economy production month, before workshops make replacement goods. */
  settleMonthly(): void {
    const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));
    const gunpowderEraEnabled = getWorldContext().options.gunpowderEraEnabled !== false;

    for (const ledger of getMilitaryResourceLedgers()) {
      ledger.supplyMarketId = this.getSupplyMarketId(ledger.stateId);
      ledger.annualDemand = this.getAnnualDemand(ledger.stateId, gunpowderEraEnabled);
      ledger.lastConsumed = {};
      ledger.lastDelivered = {};
      ledger.consumableStock ??= {};
      ledger.unmetDemand = {};
      if (!ledger.supplyMarketId) continue;

      // Finished equipment and ammunition are fulfilled through Metallurg work orders after generic
      // production runs. Ammunition is placed in persistent State stockpiles, not consumed in peacetime.
      // steel/kerosene/aluminum (docs/plan/military-era-progression.md §5 Phase 3) are always in
      // scope, independent of gunpowderEraEnabled — armored/aviation's own recruitment gate is
      // (§4.4), and fieldArtillery/machineGunners' contribution to "steel" is naturally 0 when
      // gunpowder is disabled since those units can't be recruited at all in that case.
      const resources = gunpowderEraEnabled
        ? ([
            "fodder",
            "arms",
            "arrows",
            "iron",
            "lead",
            "gunpowder",
            "bullets",
            "muskets",
            "steel",
            "kerosene",
            "aluminum"
          ] as const)
        : (["fodder", "arms", "arrows", "steel", "kerosene", "aluminum"] as const);

      for (const resource of resources) {
        const requested = (ledger.annualDemand[resource] ?? 0) / MONTHS_PER_YEAR;
        if (requested <= 0) continue;
        if (this.isStockpiledResource(resource)) {
          ledger.lastConsumed[resource] = 0;
          ledger.unmetDemand[resource] = rn(
            Math.max(0, (ledger.annualDemand[resource] ?? 0) - (ledger.consumableStock[resource] ?? 0)),
            4
          );
          continue;
        }
        if (resource === "arms" || resource === "muskets") {
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

  /** Records a completed Metallurg delivery into the State's persistent ammunition reserve. */
  recordFinishedGoodsDelivery(stateId: number, goodName: string, units: number): void {
    if (!(units > 0)) return;
    const resource = (
      {
        Arrows: "arrows",
        Gunpowder: "gunpowder",
        Bullets: "bullets"
      } as const
    )[goodName];
    if (!resource) return;
    const ledger = getMilitaryResourceLedgers().find(candidate => candidate.stateId === stateId);
    if (!ledger) return;
    ledger.consumableStock ??= {};
    ledger.lastDelivered ??= {};
    ledger.consumableStock[resource] = rn((ledger.consumableStock[resource] ?? 0) + units, 4);
    ledger.lastDelivered[resource] = rn((ledger.lastDelivered[resource] ?? 0) + units, 4);
    ledger.unmetDemand[resource] = rn(
      Math.max(0, (ledger.annualDemand[resource] ?? 0) - (ledger.consumableStock[resource] ?? 0)),
      4
    );
    setMilitaryResourceLedgers(getMilitaryResourceLedgers());
  }

  /** The amount still needed to reach a one-year peacetime reserve for one finished consumable. */
  getConsumableStockpileGap(stateId: number, resource: MilitaryConsumableResource): number {
    const annualDemand = this.getAnnualDemandForState(stateId)[resource] ?? 0;
    const stock =
      getMilitaryResourceLedgers().find(ledger => ledger.stateId === stateId)?.consumableStock?.[resource] ?? 0;
    return rn(Math.max(0, annualDemand - stock), 4);
  }

  /**
   * Returns the State's canonical military supply market. Every military ledger, work order,
   * and strategic-material forecast uses this selection. State-owned materials from other
   * domestic markets are subsequently staged here by MetallurgWork before manufacture.
   */
  getSupplyMarketId(stateId: number): number | null {
    const burgs = getWorldContext().pack.burgs;
    const goodsByName = new Map(getGoods().map(good => [good.name, good.i]));
    const ironIngotId = goodsByName.get("Iron Ingot");
    const charcoalId = goodsByName.get("Charcoal");
    const musketId = goodsByName.get("Muskets");
    const market = getMarkets()
      .filter(candidate => burgs[candidate.centerBurgId]?.state === stateId)
      .sort((a, b) => {
        const score = (candidate: ReturnType<typeof getMarkets>[number]): number => {
          const iron = ironIngotId === undefined ? 0 : (candidate.goods[ironIngotId]?.stock ?? 0);
          const charcoal = charcoalId === undefined ? 0 : (candidate.goods[charcoalId]?.stock ?? 0);
          const muskets = musketId === undefined ? 0 : (candidate.goods[musketId]?.stock ?? 0);
          // A State arsenal must be colocated with a forge supply, not merely its largest town.
          return Math.min(2, iron) * 3 + Math.min(2, charcoal) * 2 + Math.min(2, muskets) * 4;
        };
        return (
          score(b) - score(a) ||
          (burgs[b.centerBurgId]?.population ?? 0) - (burgs[a.centerBurgId]?.population ?? 0) ||
          a.i - b.i
        );
      })[0];
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
    let firearmEstablishment = 0;
    let mounted = 0;
    let archers = 0;
    let troops = 0;
    // docs/plan/military-era-progression.md §5 Phase 3.
    let modernSteelHeads = 0; // fieldArtillery/machineGunners — see needsModernSteel()
    let armored = 0;
    let aviation = 0;
    for (const regiment of state.military || []) {
      for (const [unitName, rawCount] of Object.entries(regiment.u || {})) {
        const count = rawCount / populationRate;
        troops += count;
        if (this.isArtilleryLike(unitName)) artillery += count;
        else if (this.isFirearm(unitName)) firearms += count;
        if (isMountedUnit(unitName)) mounted += count;
        if (this.isArcher(unitName)) archers += count;
        if (this.needsModernSteel(unitName)) modernSteelHeads += count;
        if (this.isArmoredUnit(unitName)) armored += count;
        if (this.isAviationUnit(unitName)) aviation += count;
      }
      const firearmUnitNames = new Set([...Object.keys(regiment.u || {}), ...Object.keys(regiment.plannedU ?? {})]);
      for (const unitName of firearmUnitNames) {
        if (!this.isFirearm(unitName)) continue;
        firearmEstablishment += Math.max(
          (regiment.u[unitName] ?? 0) / populationRate,
          (regiment.plannedU?.[unitName] ?? 0) / populationRate
        );
      }
    }

    const demand: ResourceAmounts = {};
    const fodder = rn(mounted * MOUNTED_FODDER_PER_HEAD, 4);
    if (fodder > 0) demand.fodder = fodder;
    const arrows = rn(archers * ARCHER_ARROWS_PER_HEAD, 4);
    if (arrows > 0) demand.arrows = arrows;
    const arms = rn(troops * ARMS_PER_HEAD, 4);
    if (arms > 0) demand.arms = arms;

    // docs/plan/military-era-progression.md §5 Phase 3 — computed unconditionally (unlike the
    // iron/lead/gunpowder/bullets/muskets block below, which returns early when gunpowderEraEnabled
    // is off). armored/aviation are independent of that world gate (§4.4); modernSteelHeads is
    // fieldArtillery/machineGunners, which naturally stay at 0 troops when gunpowder is disabled
    // (they're excluded from recruitment entirely — see gunpowderEra.ts), so this is safe either way.
    const steel = rn(modernSteelHeads * MODERN_STEEL_PER_HEAD + armored * STEEL_PER_ARMORED_HEAD, 4);
    if (steel > 0) demand.steel = steel;
    const kerosene = rn(armored * KEROSENE_PER_ARMORED_HEAD + aviation * KEROSENE_PER_AVIATION_HEAD, 4);
    if (kerosene > 0) demand.kerosene = kerosene;
    const aluminum = rn(aviation * ALUMINUM_PER_AVIATION_HEAD, 4);
    if (aluminum > 0) demand.aluminum = aluminum;

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
    // Bullets above — see goods-generator.ts) instead of generic Arms. The procurement signal
    // follows both active soldiers and dormant equipment-gated establishment slots, while
    // Gunpowder and Bullets above remain tied to the active force only.
    const muskets = rn(firearmEstablishment * ARMS_PER_HEAD, 4);
    if (muskets > 0) {
      demand.muskets = muskets;
      const meleeArms = rn((troops - firearms) * ARMS_PER_HEAD, 4);
      if (meleeArms > 0) demand.arms = meleeArms;
      else delete demand.arms;
    }
    return demand;
  }

  /**
   * The legacy "artillery" unit only. Kept an exact match (not broadened to include
   * "fieldArtillery") specifically because unstockInitialFirearmForces() below reads it: sweeping
   * fieldArtillery into a dormant plannedU slot would strand it there forever, since
   * metallurgWork.ts's own (separately-defined, unbroadened) isArtillery() drives the Metallurg
   * "Artillery" Good work order that reactivates a dormant slot — it doesn't recognize
   * "fieldArtillery" either, and broadening it too is a bigger, explicitly-deferred change (see
   * isArtilleryLike() below for where fieldArtillery's material demand — as opposed to its
   * equipment-establishment tracking — is handled instead).
   */
  private isArtillery(unitName: string): boolean {
    return unitName.toLowerCase() === "artillery";
  }

  /**
   * Broader than isArtillery() above — also matches "fieldArtillery" (steel breech-loaders,
   * docs/plan/military-era-progression.md §4.3), which shares the legacy unit's iron/lead/
   * gunpowder demand shape (same combat role, still a gunpowder-fired gun) on top of the
   * additional Steel draw needsModernSteel() below adds. Used only for material-demand
   * aggregation in getAnnualDemand() — never for the plannedU equipment-establishment tracking in
   * unstockInitialFirearmForces() (see isArtillery()'s own comment for why that stays exact).
   * Same includes("artillery") pattern gunpowderEra.ts's isGunpowderEraMilitaryUnit() already uses
   * for the "machinery" type.
   */
  private isArtilleryLike(unitName: string): boolean {
    return unitName.toLowerCase().includes("artillery");
  }

  private isFirearm(unitName: string): boolean {
    return isFirearmMilitaryUnitName(unitName);
  }

  private getUnitDefinition(unitName: string) {
    return getWorldContext().options.military?.find(unit => unit.name === unitName);
  }

  /**
   * fieldArtillery/machineGunners — identified by their requiresTechnology gate rather than name,
   * so any other custom unit a player gates on modernSteelmaking (Military Options) automatically
   * draws the same Steel demand, no regex maintenance required (docs/plan/military-era-progression.md
   * §5 Phase 3, principle 7).
   */
  private needsModernSteel(unitName: string): boolean {
    return this.getUnitDefinition(unitName)?.requiresTechnology?.id === "modernSteelmaking";
  }

  /** Type-based, not name-based (principle 7) — matches any "armored" type unit, built-in or custom. */
  private isArmoredUnit(unitName: string): boolean {
    return this.getUnitDefinition(unitName)?.type === "armored";
  }

  /** Type-based, not name-based (principle 7) — matches any "aviation" type unit, built-in or custom. */
  private isAviationUnit(unitName: string): boolean {
    return this.getUnitDefinition(unitName)?.type === "aviation";
  }

  private isArcher(unitName: string): boolean {
    return /archer|bowman|longbow|crossbow/.test(unitName.toLowerCase());
  }

  private isStockpiledResource(resource: MilitaryResource): resource is MilitaryConsumableResource {
    return (STOCKPILED_RESOURCES as readonly MilitaryResource[]).includes(resource);
  }
}

export const MilitaryResources = new MilitaryResourcesModule();
