/**
 * Lot → ground area for City Editor yards (docs/plan/fmg-economy-to-city-editor.md §5.3).
 *
 * Coefficients were checked on Paia 1350 (temp/000.savdata/Paia 2026-10-10-10-54.fmg).
 * Marba, a capital that is not a market center, uses 0.45% of its town disc.
 * Paris's wholesale mirror of the market pool uses 108%, almost all maize.
 * The food ledger still stores 17,795 wain in age buckets and records 174,862 wain
 * as overflow with no store. Market goods.stock repeats that wholesale pile.
 * A market center therefore keeps staple-crop age buckets, and every burg keeps
 * its own wholesale and retail lots. The Grain aggregate is omitted.
 * Yards that still exceed 15% of the town disc (25% at a market center) shrink together.
 */

import type { SiteStorageYard, SiteTradePartner, StorageForm } from "../../../services/burgSiteEconomy";
import type { Burg } from "../../../types/models";
import type { PackedGraph } from "../../../types/PackedGraph";
import { burgLotOccupancy, occupancyRadiusMeters } from "../../../utils/cultureLotOccupancy";
import { rn } from "../../hostUtils";
import {
  getBurgRetailInventories,
  getBurgWholesaleInventories,
  getGoods,
  getMarkets,
  getWorldContext
} from "../economyContext";
import type { Good } from "./goodsGeneratorTypes";

/** Square metres of ground per lot. Livestock is per head; the rest follow the good's unit. */
export const STORAGE_AREA_M2 = {
  livestockLarge: 4,
  livestockSmall: 1.5,
  livestockBird: 0.3,
  timberYard: 6,
  stoneYard: 4,
  fuelStack: 2,
  granary: 1.2,
  cellar: 0.2,
  warehouse: 0.8
} as const;

/** Share of the town disc (π·radius²) that yards may cover. */
export const STORAGE_URBAN_SHARE = { town: 0.15, marketCenter: 0.25 } as const;

const LARGE_LIVESTOCK = new Set(["Cattle", "Horses", "Elephants", "Camels"]);
const BIRD_LIVESTOCK = new Set(["Chicken", "Cats"]);
const TIMBER = new Set(["Wood", "Timber", "Mahogany"]);
const STONE = new Set(["Stone", "Marble", "Brick", "Clay", "Lime"]);

const FORM_ORDER: readonly StorageForm[] = [
  "livestockPen",
  "timberYard",
  "stoneYard",
  "fuelStack",
  "granary",
  "cellar",
  "warehouse"
];

export interface StorageStockLine {
  name: string;
  units: number;
  tags: readonly string[];
  unit: string;
  handlingClass?: string;
}

export interface StorageDirection {
  mainGoods: readonly string[];
  annualSlots: number;
  mode: SiteTradePartner["mode"];
  azimuthDeg: number | null;
}

export interface StorageFootprintInput {
  lines: readonly StorageStockLine[];
  /** π·cityRadius². The cap is a share of this disc. */
  urbanAreaM2: number;
  marketCenter: boolean;
  partners?: readonly StorageDirection[];
}

interface Contribution {
  form: StorageForm;
  name: string;
  area: number;
}

function barreled(line: StorageStockLine): boolean {
  return line.handlingClass === "barreled" || line.unit === "barrel";
}

/** Null for the Grain aggregate, which repeats the named staple crops. */
export function storageFormOf(line: StorageStockLine): StorageForm | null {
  const tags = line.tags;
  if (tags.includes("stapleFood")) return null;
  if (tags.includes("liveAnimal") || line.unit === "head") return "livestockPen";
  if (TIMBER.has(line.name)) return "timberYard";
  if (STONE.has(line.name) || (tags.includes("construction") && tags.includes("mineral"))) return "stoneYard";
  if (tags.includes("fuel") && !barreled(line)) return "fuelStack";
  if (barreled(line)) return "cellar";
  if (tags.includes("stapleCrop")) return "granary";
  return "warehouse";
}

function areaPerUnit(line: StorageStockLine, form: StorageForm): number {
  if (form === "livestockPen") {
    if (LARGE_LIVESTOCK.has(line.name)) return STORAGE_AREA_M2.livestockLarge;
    if (BIRD_LIVESTOCK.has(line.name)) return STORAGE_AREA_M2.livestockBird;
    return STORAGE_AREA_M2.livestockSmall;
  }
  return STORAGE_AREA_M2[form];
}

function directionFor(
  names: readonly string[],
  partners: readonly StorageDirection[]
): {
  azimuthDeg: number | null;
  waterborne: boolean;
} {
  let best: StorageDirection | null = null;
  for (const partner of partners) {
    if (!partner.mainGoods.some(good => names.includes(good))) continue;
    if (!best || partner.annualSlots > best.annualSlots) best = partner;
  }
  if (!best) return { azimuthDeg: null, waterborne: false };
  return { azimuthDeg: best.azimuthDeg, waterborne: best.mode !== "land" };
}

/** Group lots into yards and shrink them together when they exceed the town-disc share. */
export function storageYardsFromStock(input: StorageFootprintInput): SiteStorageYard[] {
  if (!(input.urbanAreaM2 > 0)) return [];
  const contributions: Contribution[] = [];
  for (const line of input.lines) {
    if (!(line.units > 0) || !line.name) continue;
    const form = storageFormOf(line);
    if (!form) continue;
    contributions.push({ form, name: line.name, area: line.units * areaPerUnit(line, form) });
  }
  const raw = contributions.reduce((sum, entry) => sum + entry.area, 0);
  if (!(raw > 0)) return [];
  const cap = input.urbanAreaM2 * (input.marketCenter ? STORAGE_URBAN_SHARE.marketCenter : STORAGE_URBAN_SHARE.town);
  const scale = raw > cap ? cap / raw : 1;
  const partners = input.partners ?? [];
  const yards: SiteStorageYard[] = [];
  for (const form of FORM_ORDER) {
    const rows = contributions.filter(entry => entry.form === form);
    const area = Math.round(rows.reduce((sum, entry) => sum + entry.area, 0) * scale);
    if (area < 1) continue;
    const names = [...rows].sort((a, b) => b.area - a.area || a.name.localeCompare(b.name)).map(entry => entry.name);
    const mainGoods = [...new Set(names)].slice(0, 3);
    const direction = directionFor(mainGoods, partners);
    yards.push({
      form,
      areaM2: area,
      mainGoods,
      inflowAzimuthDeg: direction.azimuthDeg,
      waterborne: direction.waterborne
    });
  }
  return yards;
}

function storedCropUnits(inventory: { age0?: number; age1?: number; age2?: number }): number {
  return Math.max(0, inventory.age0 ?? 0) + Math.max(0, inventory.age1 ?? 0) + Math.max(0, inventory.age2 ?? 0);
}

function addLots(lots: Map<number, number>, goodId: number, units: number): void {
  if (!(units > 0) || !Number.isInteger(goodId)) return;
  lots.set(goodId, (lots.get(goodId) ?? 0) + units);
}

/** Town disc City Editor sizes from this burg's population. */
export function burgUrbanAreaM2(burg: Burg, pack: PackedGraph, populationRate: number, urbanization: number): number {
  const people = Math.max(0, burg.population ?? 0) * Math.max(0, populationRate) * Math.max(0, urbanization);
  const radius = occupancyRadiusMeters(people, burgLotOccupancy(pack, burg), burg);
  return Math.PI * radius * radius;
}

function lineFrom(good: Good, units: number): StorageStockLine {
  return {
    name: good.name,
    units,
    tags: good.tags ?? [],
    unit: good.unit ?? "",
    handlingClass: good.cargo?.handlingClass
  };
}

/**
 * Yards for one burg. A market center's staple crops use the ledger age buckets.
 * Overflow and the Grain aggregate are not ground area.
 */
export function storageYardsForBurg(
  burgId: number,
  marketCenter: boolean,
  partners: readonly SiteTradePartner[]
): SiteStorageYard[] {
  const world = getWorldContext();
  const pack = world.pack;
  const burg = pack?.burgs?.find(entry => entry?.i === burgId);
  if (!burg || !pack) return [];
  const goods = getGoods();
  const byId = new Map(goods.map(good => [good.i, good]));
  const lots = new Map<number, number>();
  for (const row of getBurgWholesaleInventories()) {
    if (row.burgId !== burgId) continue;
    for (const [id, units] of Object.entries(row.goods)) addLots(lots, Number(id), units);
  }
  for (const row of getBurgRetailInventories()) {
    if (row.burgId !== burgId) continue;
    for (const [id, stock] of Object.entries(row.goods)) addLots(lots, Number(id), stock.onHand);
  }
  if (marketCenter) {
    const crops = getMarkets().find(market => market.centerBurgId === burgId)?.foodLedger?.stapleCropInventories;
    if (crops) {
      for (const [id, inventory] of Object.entries(crops)) {
        const goodId = Number(id);
        if (!byId.get(goodId)?.tags.includes("stapleCrop")) continue;
        const stored = storedCropUnits(inventory);
        if (stored > 0) lots.set(goodId, stored);
        else lots.delete(goodId);
      }
    }
  }
  const lines: StorageStockLine[] = [];
  for (const [goodId, units] of lots) {
    const good = byId.get(goodId);
    if (!good) continue;
    lines.push(lineFrom(good, units));
  }
  const located: StorageDirection[] = partners.map(partner => ({
    mainGoods: partner.mainGoods,
    annualSlots: partner.annualSlots,
    mode: partner.mode,
    azimuthDeg: azimuthTo(
      burg,
      world.pack.burgs?.find(entry => entry?.i === partner.burgId)
    )
  }));
  return storageYardsFromStock({
    lines,
    urbanAreaM2: burgUrbanAreaM2(burg, world.pack, world.populationRate ?? 1000, world.urbanization ?? 1),
    marketCenter,
    partners: located
  });
}

/** Compass azimuth from one burg to another. Map y grows south, so north is decreasing y. */
function azimuthTo(from: Burg, to: Burg | undefined): number | null {
  if (!to || !Number.isFinite(from.x) || !Number.isFinite(from.y) || !Number.isFinite(to.x) || !Number.isFinite(to.y)) {
    return null;
  }
  const east = to.x - from.x;
  const north = from.y - to.y;
  if (east === 0 && north === 0) return null;
  return rn((Math.atan2(east, north) * 180) / Math.PI + 360, 1) % 360;
}
