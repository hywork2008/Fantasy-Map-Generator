import { generateGeologicalProvinces, PROVINCE_ORDER } from "../../../generators/geologicalProvinces";
import {
  getMineralDeposits,
  getMineralDistricts,
  getMineralGeologicalProvinces,
  getWorldContext,
  setMineralDeposits,
  setMineralDistricts,
  setMineralGeologicalProvinces
} from "../economyContext";
import {
  FUEL_MINERAL_COMMODITIES,
  type GeologicalProvinceKind,
  type MineralCommodity,
  type MineralDeposit,
  type MineralDistrict,
  type MineralDistrictType,
  type MineralGeologicalProvince,
  type MineralSurveyEvidence,
  type MineralYield,
  ORE_COMMODITIES,
  type OreCommodity
} from "./mineralResourcesTypes";

export type {
  FuelMineralCommodity,
  GeologicalProvinceKind,
  MineOperation,
  MineralCommodity,
  MineralDeposit,
  MineralDistrict,
  MineralDistrictType,
  MineralGeologicalProvince,
  MineralSurveyEvidence,
  MineralYield,
  OreCommodity
} from "./mineralResourcesTypes";
export {
  FUEL_MINERAL_COMMODITIES,
  ORE_COMMODITIES
} from "./mineralResourcesTypes";

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

export function getIngotGoodName(commodity: OreCommodity): string {
  return `${commodity} ingot`;
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
  // Alloying minerals for stainless steel and other corrosion-resistant steels. They remain
  // separate districts so a mine advertises the actual ore it can supply instead of every iron
  // deposit unrealistically producing all alloying elements.
  { type: "chromite", provinces: ["orogen", "shield"], primary: "chromium", commodities: ["chromium", "iron"] },
  { type: "nickelLaterite", provinces: ["shield"], primary: "nickel", commodities: ["nickel", "iron"] },
  {
    type: "molybdenumPorphyry",
    provinces: ["orogen", "granite"],
    primary: "molybdenum",
    commodities: ["molybdenum", "copper"]
  },
  { type: "quartzVein", provinces: ["granite", "orogen"], primary: "silicon", commodities: ["silicon"] },
  { type: "lodeGold", provinces: ["shield", "orogen"], primary: "gold", commodities: ["gold"] },
  { type: "placer", provinces: ["placer"], primary: "gold", commodities: ["gold"] },
  { type: "coalSeam", provinces: ["basin"], primary: "coal", commodities: ["coal"] },
  { type: "evaporite", provinces: ["basin"], primary: "sulfur", commodities: ["sulfur", "saltpeter"] },
  // Sedimentary phosphorite, same "basin" province as coalSeam/evaporite (docs/plan/
  // phosphate-fertilizer-vertical-slice.md §3.2).
  { type: "phosphorite", provinces: ["basin"], primary: "phosphate rock", commodities: ["phosphate rock"] },
  // Sedimentary source-rock petroleum + associated natural gas, same "basin" province as
  // coalSeam/evaporite/phosphorite — no new GeologicalProvinceKind needed. Natural gas rides along
  // as a secondary commodity (0.25x scale via createYield's primary flag below), the same
  // "one district, two commodities" shape evaporite already uses for sulfur/saltpeter.
  // docs/plan/petroleum-and-internal-combustion-vertical-slice.md §3.2,
  // docs/plan/natural-gas-lng-power-generation.md §3.2.
  { type: "oilField", provinces: ["basin"], primary: "crude oil", commodities: ["crude oil", "natural gas"] },
  // Lateritic bauxite weathering crust, same "shield" province as bandedIron/lodeGold — no new
  // GeologicalProvinceKind added (docs/plan/electrolytic-industry-vertical-slice.md §3.2).
  { type: "laterite", provinces: ["shield"], primary: "bauxite", commodities: ["bauxite"] },
  // Hydrothermal cinnabar deposits form in both active-volcanic and orogenic-belt settings
  // historically (Almadén/Idrija sit in tectonic uplift zones, not active volcanoes) — unlike
  // laterite's single "shield" province, this profile lists two so the entire Mercury chain does
  // not depend on a map actually generating a volcano (real volcanoes are deliberately scarce,
  // see volcanicOperations.ts). docs/plan/cinnabar-mercury-vertical-slice.md §3.2.
  { type: "cinnabarVein", provinces: ["volcanic", "orogen"], primary: "cinnabar", commodities: ["cinnabar"] }
];

const PROFILE_PRIORITY: readonly MineralDistrictType[] = [
  "polymetallicVein",
  "mvt",
  "graniteTin",
  "bandedIron",
  "chromite",
  "nickelLaterite",
  "molybdenumPorphyry",
  "quartzVein",
  "sedex",
  "porphyry",
  "skarn",
  "lodeGold",
  "placer",
  "coalSeam",
  "evaporite",
  "phosphorite",
  "oilField",
  "laterite",
  "cinnabarVein"
];

const DEFAULT_IRON_DEPOSITS_PER_STATE = 0.4;
const MIN_IRON_DEPOSITS_PER_STATE = 0.3;
const MAX_IRON_DEPOSITS_PER_STATE = 0.8;
const MIN_IRON_DEPOSITS = 3;
const MAX_SECONDARY_IRON_SITES_PER_PRIMARY = 2;

/**
 * Phase-1 deterministic pseudo-geology. Terrain height, drainage and map seed remain the only
 * inputs for every province kind except "volcanic" — see classifyProvince()'s volcanic branch
 * (docs/plan/volcanic-biome-goods.md §3.1). That one exception deliberately does read biome
 * data (a cell's "volcanic" BiomeTag), because it is now a real, generator-placed signal
 * (HeightmapModule.finalizeVolcanoes → biomeAssignment.ts's volcanicBarrens/lavaField/
 * volcanicSoil) rather than a guess. A future tectonic model would replace the rest.
 */
export class MineralResourcesModule {
  generate(): void {
    const world = getWorldContext();
    const cells = world.pack.cells;
    const seed = world.seed || "0";
    // Classification itself lives in core (docs/plan/underground-realm-and-supernatural-areas.md
    // §3.2) so the underground-realm generator can share it without importing an extension.
    // Delegated verbatim (same hash, same branches) — must not change this module's output.
    const provinces = generateGeologicalProvinces(seed, cells, world.biomesData);
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

    const addDeposit = (profile: DistrictProfile, ordinal: number): boolean => {
      const provinceKind = profile.provinces.find(kind => provincePools.get(kind)?.length) ?? profile.provinces[0];
      const province = provinceByKind.get(provinceKind);
      const pool = provincePools.get(provinceKind);
      if (!province || !pool) return false;
      const cell = this.pickCell(seed, profile.type, ordinal, pool);
      if (cell === null) return false;

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
        groundwaterPressure: getGroundwaterPressureForCell(cell),
        surveyEvidence: this.getSurveyEvidence(profile.type, commodities, depth, richness, seed, cell),
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
      return true;
    };

    for (let ordinal = 0; ordinal < districtCount; ordinal++) {
      const profile = this.pickProfile(ordinal, provinceByKind);
      if (!profile) break;
      addDeposit(profile, ordinal);
    }

    const ironDepositTarget = this.getIronDepositTarget();
    let ironDepositCount = deposits.filter(deposit => deposit.commodities.includes("iron")).length;
    for (let ordinal = districtCount; ironDepositCount < ironDepositTarget; ordinal++) {
      const profile = this.pickIronProfile(ordinal, provincePools);
      if (!profile || !addDeposit(profile, ordinal)) break;
      ironDepositCount += 1;
    }

    this.addSecondaryIronDeposits(seed, provinces, districts, deposits);

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
   * Selects only iron-bearing profiles for the state-scaled minimum, without placing
   * deposits outside their geology. The normal land-area distribution always runs first.
   */
  private pickIronProfile(
    ordinal: number,
    provincePools: ReadonlyMap<GeologicalProvinceKind, readonly number[]>
  ): DistrictProfile | null {
    const candidates = DISTRICT_PROFILES.filter(
      profile =>
        profile.commodities.includes("iron") &&
        profile.provinces.some(kind => (provincePools.get(kind)?.length ?? 0) > 0)
    );
    return candidates.length ? candidates[ordinal % candidates.length] : null;
  }

  /** Guarantees strategic iron availability without requiring every state to own a deposit. */
  private getIronDepositTarget(): number {
    const states = getWorldContext().pack.states ?? [];
    const activeStateCount = states.filter(state => state?.i && !state.removed).length;
    if (!activeStateCount) return 0;
    const configured = getWorldContext().options.ironDepositsPerState ?? DEFAULT_IRON_DEPOSITS_PER_STATE;
    const perState = Math.min(MAX_IRON_DEPOSITS_PER_STATE, Math.max(MIN_IRON_DEPOSITS_PER_STATE, configured));
    return Math.max(MIN_IRON_DEPOSITS, Math.ceil(activeStateCount * perState));
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

  private getSurveyEvidence(
    type: MineralDistrictType,
    commodities: readonly MineralCommodity[],
    depth: MineralDeposit["depth"],
    richness: number,
    seed: string,
    cell: number
  ): MineralSurveyEvidence[] | undefined {
    if (!commodities.includes("iron")) return undefined;
    const evidence: MineralSurveyEvidence[] = [];
    if (depth !== "deep") evidence.push("ironOxideOutcrop");
    if (type === "bandedIron" && richness >= 4 && this.hash(seed, "magnetic", cell) < 0.65) {
      evidence.push("magneticAnomaly");
    }
    return evidence.length ? evidence : undefined;
  }

  /**
   * Adds small, water-borne iron resources after primary deposits are placed.
   * Iron sand appears downstream on the same river as a nearby primary deposit;
   * bog iron occupies a low, wet cell in the same local drainage catchment.
   */
  private addSecondaryIronDeposits(
    seed: string,
    provinces: readonly MineralGeologicalProvince[],
    districts: MineralDistrict[],
    deposits: MineralDeposit[]
  ): void {
    const world = getWorldContext();
    const { cells } = world.pack;
    const primaryIronDeposits = deposits.filter(
      deposit => deposit.commodities.includes("iron") && deposit.type !== "ironSand" && deposit.type !== "bogIron"
    );
    if (!primaryIronDeposits.length || !world.pack.rivers?.length) return;

    const provinceByCell = new Map<number, number>();
    for (const province of provinces) {
      for (const cellId of province.cells) provinceByCell.set(cellId, province.i);
    }
    const usedCells = new Set(deposits.map(deposit => deposit.cell));
    const nearbyIron = this.getNearbyIronSources(primaryIronDeposits, 8);
    const addSecondary = (
      type: "ironSand" | "bogIron",
      cell: number,
      source: MineralDeposit,
      evidence: MineralSurveyEvidence,
      richness: number
    ): void => {
      if (usedCells.has(cell) || cells.h[cell] < 20) return;
      const provinceId = provinceByCell.get(cell) ?? provinceByCell.get(source.cell);
      if (!provinceId) return;
      const districtId = districts.length + 1;
      const depositId = deposits.length + 1;
      const capacityMultiplier = type === "ironSand" ? 0.16 : 0.1;
      const capacity = Math.max(4, Math.round(180 * richness * capacityMultiplier));
      const lifeYears = type === "ironSand" ? 45 : 3;
      const reserveTons = capacity * lifeYears;
      deposits.push({
        i: depositId,
        districtId,
        cell,
        type,
        primaryCommodity: "iron",
        commodities: ["iron"],
        yields: [
          {
            commodity: "iron",
            annualCapacityTons: capacity,
            reserveTons,
            ...(type === "bogIron"
              ? { annualRechargeTons: Math.round(capacity * 0.6 * 100) / 100, reserveCeilingTons: reserveTons }
              : {})
          }
        ],
        richness,
        depth: "surface",
        groundwaterPressure: getGroundwaterPressureForCell(cell),
        surveyEvidence: [evidence],
        secondarySourceDepositId: source.i,
        accessibility: this.getAccessibility(cell),
        discovered: false,
        exhausted: false
      });
      districts.push({ i: districtId, type, provinceId, cell, depositIds: [depositId], richness });
      usedCells.add(cell);
    };

    let added = 0;
    for (const river of world.pack.rivers) {
      const riverCells = river.cells.filter(cell => cell >= 0 && cell < cells.i.length && cells.h[cell] >= 20);
      if (riverCells.length < 3) continue;
      const source = riverCells
        .map((cell, index) => ({ cell, index, source: nearbyIron.get(cell) }))
        .find(candidate => candidate.source !== undefined);
      if (!source?.source) continue;
      const downstream = riverCells.slice(source.index + 2);
      const site = downstream.find(cell => !usedCells.has(cell) && this.hash(seed, "iron-sand", cell) < 0.45);
      if (site !== undefined) {
        addSecondary(
          "ironSand",
          site,
          source.source,
          "riverIronSand",
          1 + Math.floor(this.hash(seed, "iron-sand-richness", site) * 2)
        );
        added += 1;
      }
      if (added >= primaryIronDeposits.length * MAX_SECONDARY_IRON_SITES_PER_PRIMARY) break;
    }

    for (const [cell, source] of nearbyIron) {
      if (added >= primaryIronDeposits.length * MAX_SECONDARY_IRON_SITES_PER_PRIMARY) break;
      if (usedCells.has(cell) || cells.h[cell] < 20 || cells.h[cell] >= 48 || !this.isWetlandCandidate(cell)) continue;
      if (this.hash(seed, "bog-iron", cell) >= 0.16) continue;
      addSecondary("bogIron", cell, source, "bogIron", 1 + Math.floor(this.hash(seed, "bog-iron-richness", cell) * 2));
      added += 1;
    }
  }

  /** Multi-source local catchment search, keeping secondary iron tied to a real primary source. */
  private getNearbyIronSources(sources: readonly MineralDeposit[], maxHops: number): Map<number, MineralDeposit> {
    const { cells } = getWorldContext().pack;
    if (!cells.c) return new Map();
    const result = new Map<number, MineralDeposit>();
    const queue = sources.map(source => ({ cell: source.cell, source, hops: 0 }));
    for (const entry of queue) result.set(entry.cell, entry.source);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor]!;
      if (current.hops >= maxHops) continue;
      for (const neighbor of cells.c[current.cell] ?? []) {
        if (result.has(neighbor) || cells.h[neighbor] < 20) continue;
        result.set(neighbor, current.source);
        queue.push({ cell: neighbor, source: current.source, hops: current.hops + 1 });
      }
    }
    return result;
  }

  private isWetlandCandidate(cell: number): boolean {
    const { cells } = getWorldContext().pack;
    if (cells.r?.[cell]) return true;
    return (cells.c?.[cell] ?? []).some(neighbor => Boolean(cells.r?.[neighbor]));
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
      chromium: 20,
      nickel: 16,
      molybdenum: 6,
      silicon: 100,
      coal: 160,
      saltpeter: 12,
      sulfur: 15,
      "phosphate rock": 140, // calibration TBD — bulk sedimentary rock, slightly below coal's scale
      bauxite: 120, // calibration TBD — bulk lateritic ore, below Phosphate Rock's scale
      cinnabar: 5, // calibration TBD — rare hydrothermal ore, well below Sulfur(15)/Saltpeter(12)
      "crude oil": 70, // calibration TBD — bulk fuel mineral like Coal(160)/Bauxite(120), but scarcer at this era
      "natural gas": 50 // calibration TBD — same order of magnitude as Crude Oil(70); the 0.25x
      // secondary-commodity discount (createYield's primary flag) applies on top, same as
      // saltpeter riding along evaporite's primary sulfur. docs/plan/natural-gas-lng-power-
      // generation.md §3.2.
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

/**
 * Persistent local groundwater pressure for a mineral deposit.
 *
 * This deliberately models long-term recharge, not a monthly weather event: annual
 * precipitation establishes the base pressure and a river crossing the mine cell adds
 * a local ingress component. The fallback keeps legacy/minimal fixtures neutral.
 */
export function getGroundwaterPressureForCell(cell: number): number {
  const world = getWorldContext();
  const cells = world.pack.cells;
  const gridCell = cells.g?.[cell] ?? cell;
  const precipitation = world.grid?.cells?.prec?.[gridCell];
  const rainfallRecharge = typeof precipitation === "number" ? clamp01((precipitation - 10) / 70) : 0;
  const riverRecharge = cells.r?.[cell] ? 0.32 : 0;
  const baselineRecharge = typeof precipitation === "number" ? 0.08 : 0;
  return Math.round(clamp01(baselineRecharge + rainfallRecharge * 0.6 + riverRecharge) * 10000) / 10000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
