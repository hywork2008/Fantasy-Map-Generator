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
  getQuarryOperations,
  getWorldContext
} from "../economyContext";
import { GROSS_FOOD_NEED } from "./foodConstants";
import { BURG_TARGET_RESERVE_DAYS } from "./foodProduction";
import type { Good } from "./goodsGeneratorTypes";
import { getGranaryReserveMultiplier } from "./publicWorks";

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

/** Same year length as foodLedgerConsumption. */
const DAYS_PER_YEAR = 365.2425;
/** Same height gate as quarryOperations `STONE_QUARRY_MIN_HEIGHT`. */
const QUARRY_ROCK_HEIGHT = 40;
const SUPPLY_RINGS = 2;

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
  const rate = world.populationRate ?? 1000;
  const urbanization = world.urbanization ?? 1;
  const yards = storageYardsFromStock({
    lines,
    urbanAreaM2: burgUrbanAreaM2(burg, world.pack, rate, urbanization),
    marketCenter,
    partners: located
  }).map(yard => withLocalSupply(yard, burg, pack));
  const publicGranary = publicGranaryYard(burg, rate, urbanization);
  if (publicGranary) yards.push(publicGranary);
  return yards;
}

/**
 * Ground area of the state granary. A full works level doubles the 10-day
 * reserve, and that extra grain uses the same 1.2 m²/wain as a stock granary.
 */
export function publicGranaryAreaM2(
  burg: Pick<Burg, "population" | "publicWorks">,
  populationRate: number,
  urbanization: number
): number {
  const level = burg.publicWorks?.granary ?? 0;
  if (!(level > 0)) return 0;
  const people = Math.max(0, burg.population ?? 0) * Math.max(0, populationRate) * Math.max(0, urbanization);
  const extraDays = BURG_TARGET_RESERVE_DAYS * (getGranaryReserveMultiplier(burg) - 1);
  if (!(people > 0) || !(extraDays > 0)) return 0;
  return Math.round(((people * GROSS_FOOD_NEED) / DAYS_PER_YEAR) * extraDays * STORAGE_AREA_M2.granary);
}

function publicGranaryYard(burg: Burg, populationRate: number, urbanization: number): SiteStorageYard | null {
  const area = publicGranaryAreaM2(burg, populationRate, urbanization);
  if (area < 1) return null;
  return {
    form: "granary",
    areaM2: area,
    mainGoods: [],
    inflowAzimuthDeg: null,
    waterborne: false,
    origin: "publicWorks"
  };
}

function withLocalSupply(yard: SiteStorageYard, burg: Burg, pack: PackedGraph): SiteStorageYard {
  if (yard.waterborne || (yard.form !== "timberYard" && yard.form !== "stoneYard")) return yard;
  const azimuth = yard.form === "timberYard" ? forestAzimuth(burg, pack) : quarryAzimuth(burg, pack);
  if (azimuth == null) return yard;
  return { ...yard, supplyAzimuthDeg: azimuth };
}

/** Compass bearing of a weighted cloud. Map y grows south. 0 is north. */
export function weightedSupplyAzimuth(
  origin: { x: number; y: number },
  samples: readonly { x: number; y: number; weight: number }[]
): number | null {
  let east = 0;
  let north = 0;
  for (const sample of samples) {
    if (!(sample.weight > 0)) continue;
    east += (sample.x - origin.x) * sample.weight;
    north += (origin.y - sample.y) * sample.weight;
  }
  if (east * east + north * north < 1e-8) return null;
  return rn((Math.atan2(east, north) * 180) / Math.PI + 360, 1) % 360;
}

function cellCentroid(pack: PackedGraph, cellId: number): { x: number; y: number } | null {
  const verts = pack.cells?.v?.[cellId];
  const xs = pack.vertices?.x;
  const ys = pack.vertices?.y;
  if (!verts?.length || !xs || !ys) return null;
  let x = 0;
  let y = 0;
  let count = 0;
  for (const vertex of verts) {
    const px = xs[vertex];
    const py = ys[vertex];
    if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
    x += px;
    y += py;
    count += 1;
  }
  return count > 0 ? { x: x / count, y: y / count } : null;
}

function nearbyCells(pack: PackedGraph, start: number): number[] {
  const neighbors = pack.cells?.c;
  if (!neighbors || !Number.isInteger(start) || start < 0) return [];
  const seen = new Set<number>([start]);
  let frontier = [start];
  const found: number[] = [];
  for (let ring = 0; ring < SUPPLY_RINGS; ring++) {
    const next: number[] = [];
    for (const id of frontier) {
      for (const neighbor of neighbors[id] ?? []) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        next.push(neighbor);
        found.push(neighbor);
      }
    }
    frontier = next;
  }
  return found;
}

function supplySamples(
  burg: Burg,
  pack: PackedGraph,
  weightOf: (cellId: number) => number
): { x: number; y: number; weight: number }[] {
  if (!Number.isFinite(burg.x) || !Number.isFinite(burg.y) || burg.cell == null) return [];
  const samples: { x: number; y: number; weight: number }[] = [];
  for (const cellId of nearbyCells(pack, burg.cell)) {
    const weight = weightOf(cellId);
    const centre = cellCentroid(pack, cellId);
    if (!(weight > 0) || !centre) continue;
    samples.push({ x: centre.x, y: centre.y, weight });
  }
  return samples;
}

function forestAzimuth(burg: Burg, pack: PackedGraph): number | null {
  const tags = getWorldContext().biomesData?.tags;
  const cells = pack.cells;
  if (!cells) return null;
  return weightedSupplyAzimuth(
    { x: burg.x, y: burg.y },
    supplySamples(burg, pack, cellId => {
      const stock = cells.forestStock?.[cellId];
      if (typeof stock === "number" && stock > 0) return stock;
      const cover = cells.forestCover?.[cellId];
      if (typeof cover === "number" && cover > 0) return cover;
      const code = cells.biomeCode?.[cellId] ?? 0;
      return tags?.[code]?.includes("forest") ? 1 : 0;
    })
  );
}

function quarryAzimuth(burg: Burg, pack: PackedGraph): number | null {
  if (!getQuarryOperations().some(operation => operation.burgId === burg.i && operation.active !== false)) return null;
  const heights = pack.cells?.h;
  if (!heights) return null;
  return weightedSupplyAzimuth(
    { x: burg.x, y: burg.y },
    supplySamples(burg, pack, cellId => {
      const height = heights[cellId] ?? 0;
      return height >= QUARRY_ROCK_HEIGHT ? height - (QUARRY_ROCK_HEIGHT - 1) : 0;
    })
  );
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
