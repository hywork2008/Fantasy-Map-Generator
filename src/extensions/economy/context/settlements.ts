/**
 * Burg-scale installations: inns and the urban water systems.
 *
 * Split out of the former single 2,452-line `economyContext.ts`, which had grown into a
 * 410-export module every one of this extension's ~180 files imported. `economyContext.ts` is now
 * a re-export barrel over these domain modules, so the public API is unchanged and no call site
 * moved. docs/plan/economy-coupling-audit.md T3.
 */

/**
 * Module-level context holder for the economy extension.
 * Populated once by init(api) in index.tsx; read by all economy sub-modules.
 *
 * This avoids direct host imports in sub-modules, which would create separate
 * module instances when the extension is loaded via a blob URL.
 */

import {
  type InnConstructionOrder,
  type InnFacility,
  type InnStayLedger,
  LODGING_STYLES,
  type LodgingStyle
} from "../generators/innFacilityTypes";
import type { UrbanWaterSystem } from "../generators/urbanWaterTypes";
import { getEconomySlice, getLegacyPackFields, getSliceArray, setSliceArray } from "./economyApi";

/** Commercial short-stay lodging stock. It is intentionally separate from permanent dwellings. */
export function getInnFacilities(): InnFacility[] {
  return getSliceArray<InnFacility>("innFacilities");
}

export function setInnFacilities(facilities: readonly InnFacility[]): void {
  setSliceArray("innFacilities", facilities);
}

/** Pending non-dwelling inn construction work orders. */
export function getInnConstructionOrders(): InnConstructionOrder[] {
  return getSliceArray<InnConstructionOrder>("innConstructionOrders");
}

export function setInnConstructionOrders(orders: readonly InnConstructionOrder[]): void {
  setSliceArray("innConstructionOrders", orders);
}

/** Short-stay inn occupancy; separate from burg population and permanent housing. */
export function getInnStayLedgers(): InnStayLedger[] {
  return getSliceArray<InnStayLedger>("innStayLedgers");
}

export function setInnStayLedgers(ledgers: readonly InnStayLedger[]): void {
  setSliceArray("innStayLedgers", ledgers);
}

/** Global visual language for lodging. It is stored in Economy's extension slice, never on Burg. */
export function getLodgingStyle(): LodgingStyle {
  const value = getEconomySlice()?.lodgingStyle ?? getLegacyPackFields().lodgingStyle;
  return typeof value === "string" && (LODGING_STYLES as readonly string[]).includes(value)
    ? (value as LodgingStyle)
    : "medievalCentralEuropean";
}

export function setLodgingStyle(style: LodgingStyle): void {
  const slice = getEconomySlice();
  if (slice) {
    slice.lodgingStyle = style;
    return;
  }
  getLegacyPackFields().lodgingStyle = style;
}

/** Burg water / sanitation infrastructure (docs/plan/urban-water-and-sanitation-system.md Phase 1). */
export function getUrbanWaterSystems(): UrbanWaterSystem[] {
  return getSliceArray<UrbanWaterSystem>("urbanWaterSystems");
}

export function setUrbanWaterSystems(systems: readonly UrbanWaterSystem[]): void {
  setSliceArray("urbanWaterSystems", systems);
}
