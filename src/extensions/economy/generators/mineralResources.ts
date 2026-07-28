import {
  getMineralDeposits,
  getMineralDistricts,
  getMineralGeologicalProvinces,
  getWorldContext,
  setMineralDeposits,
  setMineralDistricts,
  setMineralGeologicalProvinces
} from "../economyContext";

/** Metals extracted as ore; a later smelter operation turns them into ingots. */
export const ORE_COMMODITIES = ["iron", "copper", "tin", "lead", "silver", "gold"] as const;

export type OreCommodity = (typeof ORE_COMMODITIES)[number];

/** Mineral goods that bypass smelting and remain directly mine-supplied. */
export const FUEL_MINERAL_COMMODITIES = ["coal", "saltpeter", "sulfur"] as const;

export type FuelMineralCommodity = (typeof FUEL_MINERAL_COMMODITIES)[number];
export type MineralCommodity = OreCommodity | FuelMineralCommodity;

const MINE_SUPPLIED_GOOD_NAMES = new Set<string>([
  ...ORE_COMMODITIES.map(commodity => `${commodity} ore`),
  ...ORE_COMMODITIES.map(commodity => `${commodity} ingot`),
  ...FUEL_MINERAL_COMMODITIES
]);

export function isMineSuppliedGoodName(name: string): boolean {
  return MINE_SUPPLIED_GOOD_NAMES.has(name.toLowerCase());
}

/** Resolves a geological commodity to the lower-case Economy Good name produced by a mine. */
export function getMinedGoodName(commodity: MineralCommodity): string {
  return (ORE_COMMODITIES as readonly string[]).includes(commodity) ? `${commodity} ore` : commodity;
}
export type GeologicalProvinceKind = "orogen" | "shield" | "granite" | "carbonate" | "basin" | "placer";
export type MineralDistrictType =
  | "bandedIron"
  | "porphyry"
  | "skarn"
  | "polymetallicVein"
  | "mvt"
  | "sedex"
  | "graniteTin"
  | "lodeGold"
  | "placer"
  | "coalSeam"
  | "evaporite";

export interface MineralYield {
  /** Recoverable ore reserve; MineOperation maps one tonne to one Economy Good unit. */
  commodity: MineralCommodity;
  reserveTons: number;
  annualCapacityTons: number;
}

export interface MineralGeologicalProvince {
  i: number;
  kind: GeologicalProvinceKind;
  /** Pack cell ids classified into this broad, deterministic pseudo-geology. */
  cells: number[];
}

export interface MineralDistrict {
  i: number;
  type: MineralDistrictType;
  provinceId: number;
  cell: number;
  depositIds: number[];
  richness: number;
}

export interface MineralDeposit {
  i: number;
  districtId: number;
  cell: number;
  type: MineralDistrictType;
  primaryCommodity: MineralCommodity;
  commodities: MineralCommodity[];
  yields: MineralYield[];
  richness: number;
  depth: "surface" | "shallow" | "deep";
  accessibility: number;
  discovered: boolean;
  exhausted: boolean;
}

export interface MineOperation {
  i: number;
  depositId: number;
  burgId: number;
  marketId: number;
  workers: number;
  technology: number;
  drainage: number;
  fuelAccess: number;
  annualOutputTons: Partial<Record<MineralCommodity, number>>;
  active: boolean;
}

interface DistrictProfile {
  type: MineralDistrictType;
  provinces: readonly GeologicalProvinceKind[];
  primary: MineralCommodity;
  commodities: readonly MineralCommodity[];
}

const DISTRICT_PROFILES: readonly DistrictProfile[] = [
  { type: "porphyry", provinces: ["orogen"], primary: "copper", commodities: ["copper", "gold", "silver"] },
  { type: "skarn", provinces: ["orogen"], primary: "iron", commodities: ["iron", "copper"] },
  {
    type: "polymetallicVein",
    provinces: ["orogen", "carbonate"],
    primary: "lead",
    commodities: ["lead", "silver", "copper"]
  },
  { type: "mvt", provinces: ["carbonate"], primary: "lead", commodities: ["lead", "silver"] },
  { type: "sedex", provinces: ["basin"], primary: "lead", commodities: ["lead", "silver"] },
  { type: "graniteTin", provinces: ["granite"], primary: "tin", commodities: ["tin", "copper", "silver"] },
  { type: "bandedIron", provinces: ["shield"], primary: "iron", commodities: ["iron"] },
  { type: "lodeGold", provinces: ["shield", "orogen"], primary: "gold", commodities: ["gold"] },
  { type: "placer", provinces: ["placer"], primary: "gold", commodities: ["gold"] },
  { type: "coalSeam", provinces: ["basin"], primary: "coal", commodities: ["coal"] },
  { type: "evaporite", provinces: ["basin"], primary: "sulfur", commodities: ["sulfur", "saltpeter"] }
];

const PROFILE_PRIORITY: readonly MineralDistrictType[] = [
  "polymetallicVein",
  "mvt",
  "graniteTin",
  "bandedIron",
  "sedex",
  "porphyry",
  "skarn",
  "lodeGold",
  "placer",
  "coalSeam",
  "evaporite"
];

const PROVINCE_ORDER: readonly GeologicalProvinceKind[] = [
  "orogen",
  "shield",
  "granite",
  "carbonate",
  "basin",
  "placer"
];

/**
 * Phase-1 deterministic pseudo-geology. It deliberately reads no biome data:
 * terrain height, drainage and map seed are the only inputs until a future
 * tectonic model replaces this approximation.
 */
export class MineralResourcesModule {
  generate(): void {
    const world = getWorldContext();
    const cells = world.pack.cells;
    const seed = world.seed || "0";
    const provinceCells = new Map<GeologicalProvinceKind, number[]>(PROVINCE_ORDER.map(kind => [kind, []]));

    for (const cellId of cells.i) {
      if (cells.h[cellId] < 20) continue;
      provinceCells.get(this.classifyProvince(seed, cellId))!.push(cellId);
    }

    const provinces = PROVINCE_ORDER.map((kind, index) => ({ i: index + 1, kind, cells: provinceCells.get(kind)! }));
    const provinceByKind = new Map(provinces.map(province => [province.kind, province]));
    const landCells = provinces.flatMap(province => province.cells);
    // Scales with land area (docs/plan/mineral-resource-system.md §6.1); deliberately
    // uncapped so large maps are not left relatively mineral-poor per capita (see
    // docs/plan/mineral-resource-circulation-fixes.md Fix 1).
    const districtCount = Math.max(4, Math.ceil(landCells.length / 110));
    // Mutable per-province pools that shrink (swap-remove) as cells are consumed, so
    // pickCell never has to rescan already-used cells. A single shared Set filtered on
    // every pick made generate() cost O(districtCount * provinceSize) — quadratic in
    // land cells once districtCount was no longer capped at 40 (Fix 1, see
    // docs/plan/mineral-resource-circulation-fixes.md).
    const provincePools = new Map<GeologicalProvinceKind, number[]>(
      provinces.map(province => [province.kind, [...province.cells]])
    );
    const districts: MineralDistrict[] = [];
    const deposits: MineralDeposit[] = [];

    for (let ordinal = 0; ordinal < districtCount; ordinal++) {
      const profile = this.pickProfile(ordinal, provinceByKind);
      if (!profile) break;
      const provinceKind = profile.provinces.find(kind => provincePools.get(kind)?.length) ?? profile.provinces[0];
      const province = provinceByKind.get(provinceKind);
      const pool = provincePools.get(provinceKind);
      if (!province || !pool) continue;
      const cell = this.pickCell(seed, profile.type, ordinal, pool);
      if (cell === null) continue;

      const districtId = districts.length + 1;
      const depositId = deposits.length + 1;
      const richness = 1 + Math.floor(this.hash(seed, `${profile.type}:richness`, cell) * 5);
      const depth = richness >= 5 ? "deep" : richness >= 3 ? "shallow" : "surface";
      const commodities = this.getCommodities(profile, seed, cell);
      const yields = commodities.map(commodity =>
        this.createYield(commodity, commodity === profile.primary, richness, seed, cell)
      );
      deposits.push({
        i: depositId,
        districtId,
        cell,
        type: profile.type,
        primaryCommodity: profile.primary,
        commodities,
        yields,
        richness,
        depth,
        accessibility: this.getAccessibility(cell),
        discovered: false,
        exhausted: false
      });
      districts.push({
        i: districtId,
        type: profile.type,
        provinceId: province.i,
        cell,
        depositIds: [depositId],
        richness
      });
    }

    setMineralGeologicalProvinces(provinces);
    setMineralDistricts(districts);
    setMineralDeposits(deposits);
  }

  clear(): void {
    setMineralGeologicalProvinces([]);
    setMineralDistricts([]);
    setMineralDeposits([]);
  }

  getDebugSummary(): {
    provinces: Record<GeologicalProvinceKind, number>;
    districts: Record<string, number>;
    commodities: Record<string, number>;
  } {
    const provinces = Object.fromEntries(PROVINCE_ORDER.map(kind => [kind, 0])) as Record<
      GeologicalProvinceKind,
      number
    >;
    for (const province of getMineralGeologicalProvinces()) provinces[province.kind] += province.cells.length;
    const districts: Record<string, number> = {};
    const commodities: Record<string, number> = {};
    for (const district of getMineralDistricts()) districts[district.type] = (districts[district.type] ?? 0) + 1;
    for (const deposit of getMineralDeposits()) {
      for (const commodity of deposit.commodities) commodities[commodity] = (commodities[commodity] ?? 0) + 1;
    }
    return { provinces, districts, commodities };
  }

  private classifyProvince(seed: string, cellId: number): GeologicalProvinceKind {
    const cells = getWorldContext().pack.cells;
    const height = cells.h[cellId] ?? 0;
    const regional = this.hash(seed, "province", Math.floor(cellId / 23));
    if (cells.r[cellId] && height >= 20 && height < 48) return "placer";
    if (height >= 70) return regional < 0.36 ? "granite" : "orogen";
    if (height >= 53) return regional < 0.3 ? "granite" : regional < 0.7 ? "orogen" : "shield";
    if (height >= 38) return regional < 0.42 ? "carbonate" : regional < 0.72 ? "shield" : "basin";
    return regional < 0.28 ? "carbonate" : "basin";
  }

  private pickProfile(
    ordinal: number,
    provinces: ReadonlyMap<GeologicalProvinceKind, MineralGeologicalProvince>
  ): DistrictProfile | null {
    const candidates = DISTRICT_PROFILES.filter(profile =>
      profile.provinces.some(kind => provinces.get(kind)?.cells.length)
    );
    if (!candidates.length) return null;
    const ordered = [...candidates].sort((a, b) => PROFILE_PRIORITY.indexOf(a.type) - PROFILE_PRIORITY.indexOf(b.type));
    return ordered[ordinal % ordered.length];
  }

  /**
   * Deterministically picks one cell out of a province's remaining pool and removes it
   * (swap with the last element, then pop) so the pool never needs to be rescanned for
   * already-used cells. O(1) per call instead of O(poolSize) — districtCount is no
   * longer capped at 40, so this runs many more times per generate() call on large maps
   * (see Fix 1 in docs/plan/mineral-resource-circulation-fixes.md).
   */
  private pickCell(seed: string, type: MineralDistrictType, ordinal: number, pool: number[]): number | null {
    if (!pool.length) return null;
    const index = Math.min(
      pool.length - 1,
      Math.floor(this.hash(seed, `${type}:${ordinal}`, pool.length) * pool.length)
    );
    const cell = pool[index];
    pool[index] = pool[pool.length - 1];
    pool.pop();
    return cell;
  }

  private getCommodities(profile: DistrictProfile, seed: string, cell: number): MineralCommodity[] {
    if (profile.type !== "placer") return [...profile.commodities];
    return this.hash(seed, "placer", cell) < 0.28 ? ["tin"] : ["gold"];
  }

  private createYield(
    commodity: MineralCommodity,
    primary: boolean,
    richness: number,
    seed: string,
    cell: number
  ): MineralYield {
    const baseAnnualCapacity: Record<MineralCommodity, number> = {
      iron: 180,
      copper: 35,
      tin: 8,
      lead: 65,
      silver: 3,
      gold: 1,
      coal: 160,
      saltpeter: 12,
      sulfur: 15
    };
    const capacity = baseAnnualCapacity[commodity] * richness * (primary ? 1 : 0.25);
    const mineLifeYears = 60 + Math.floor(this.hash(seed, `${commodity}:life`, cell) * 190);
    return {
      commodity,
      annualCapacityTons: Math.max(0.1, Math.round(capacity * 100) / 100),
      reserveTons: Math.max(1, Math.round(capacity * mineLifeYears * 100) / 100)
    };
  }

  private getAccessibility(cell: number): number {
    const cells = getWorldContext().pack.cells;
    const hasRiver = Boolean(cells.r[cell]);
    const hasRoute = Boolean(cells.routes?.[cell] && Object.keys(cells.routes[cell]).length);
    const hasHaven = Boolean(cells.haven?.[cell]);
    return Math.min(1, 0.35 + (hasRiver ? 0.15 : 0) + (hasRoute ? 0.25 : 0) + (hasHaven ? 0.15 : 0));
  }

  private hash(seed: string, scope: string, value: string | number): number {
    let hash = 2166136261;
    for (const character of `${seed}:${scope}:${value}`) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) / 4294967296;
  }
}

export const MineralResources = new MineralResourcesModule();
