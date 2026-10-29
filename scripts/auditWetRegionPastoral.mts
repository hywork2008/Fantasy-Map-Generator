/**
 * Wet-region pastoral economy, M0 (docs/plan/wet-region-pastoral-economy.md): by annual rainfall
 * band, the people, fields (required, labour-affordable excess, allocated), yield, the crop mix's
 * rainfall suitability p, herds (source-based target and supported heads) and herders; and where the
 * harvest of the labour-affordable excess fields went over the run (kept by households, bought by the
 * market, offered but unsold), with the market's purchases split into urban/rural sales and storage
 * spoilage. Markets are reconstructed from the monthly Food Ledger; the excess is attributed at each
 * market's own ratios, since households keep their reserve first and the excess is marginal grain.
 * Read-only. Usage: auditWetRegionPastoral.mts <archive.fmg> <output.json> [months]
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { WET_TOLERANCE_AT_MAX, type ClimateRange } from "../src/data/stapleCrops";
import {
  getCropLaborCoverage,
  getCultivableArea,
  getCultivatedArea,
  getFoodPotential,
  getHusbandryRequiredWorkers,
  getHusbandryWorkers,
  getRuralFoodCapacity,
  getYieldPerArea
} from "../src/extensions/economy/context/agriculture";
import { getMarketCellColumn } from "../src/extensions/economy/context/cellTables";
import { getWorldContext } from "../src/extensions/economy/context/economyApi";
import { getGoods, getMarkets } from "../src/extensions/economy/context/trade";
import { getCropMix } from "../src/extensions/economy/generators/agriculturalLandUse";
import { getDomesticatedCarryingCapacity } from "../src/extensions/economy/generators/faunaPopulation";
import { GROSS_FOOD_NEED } from "../src/extensions/economy/generators/foodConstants";
import {
  ANNUAL_FEED_DM_KG_PER_HEAD,
  calculateWinterFeedShare,
  getLivestockHayPlan,
  getPastureGrowth,
  HAY_WORK_DAYS_PER_TONNE_DM
} from "../src/extensions/economy/generators/livestockFeedPolicy";
import { readAgriculturalClimate } from "../src/extensions/economy/generators/seasonalCropClimate";
import { isGoodEnabled } from "../src/extensions/economy/generators/goods-generator";
import * as husbandry from "../src/extensions/economy/generators/husbandry";
import { getRuralGrainDietShare } from "../src/extensions/economy/generators/ruralDiet";
import { advanceWorld, createNodeSimulationHost } from "../src/simulation/adapters/node";

const [input, output, length = "12"] = process.argv.slice(2);
const months = Number(length);
if (!input || !output || !Number.isSafeInteger(months) || months < 1)
  throw new Error("Usage: auditWetRegionPastoral.mts <archive.fmg> <output.json> [months]");

// Same shape as src/data/stapleCrops.ts (not exported there); see scripts/auditYieldFactors.mts.
function precipitationSuitability(value: number, range: ClimateRange): number {
  if (value <= range.min) return 0;
  if (value < range.idealMin) return (value - range.min) / (range.idealMin - range.min);
  if (value <= range.idealMax) return 1;
  if (value < range.max)
    return 1 - ((1 - WET_TOLERANCE_AT_MAX) * (value - range.idealMax)) / (range.max - range.idealMax);
  return WET_TOLERANCE_AT_MAX * Math.sqrt(range.max / value);
}
const bandOf = (mm: number) =>
  mm < 400 ? "<400" : mm < 800 ? "400-800" : mm < 1200 ? "800-1200" : mm < 2000 ? "1200-2000" : mm < 3000 ? "2000-3000" : ">=3000";
const BANDS = ["<400", "400-800", "800-1200", "1200-2000", "2000-3000", ">=3000"];
// Tentative §2.1 values, to show what the formula would give before M2.
const PASTORAL_SHARE_MAX = 0.5;
const GRAIN_SHARE_FLOOR = 0.4;
const pastoralShare = (p: number) =>
  p < 1 ? Math.min(1 - GRAIN_SHARE_FLOOR, (PASTORAL_SHARE_MAX * (1 - p)) / (1 - WET_TOLERANCE_AT_MAX)) : 0;

type MarketFlow = { bought: number; unsold: number; spoiledX3: number; urbanSupplied: number; ruralFromMarket: number };
const flows = new Map<number, MarketFlow>();
const sum = (values: number[] | undefined) => (values ?? []).reduce((s, v) => s + Math.max(0, v), 0);

const bytes = readFileSync(input);
const host = createNodeSimulationHost();
try {
  await host.loadArchive(new Uint8Array(bytes));
  await host.prepare();
  for (let m = 1; m <= months; m++) {
    await advanceWorld(host, { months: 1 });
    await new Promise(done => setImmediate(done));
    for (const market of getMarkets()) {
      const ledger = market.foodLedger;
      if (!ledger) continue;
      const row = (flows.get(market.i) ?? flows.set(market.i, { bought: 0, unsold: 0, spoiledX3: 0, urbanSupplied: 0, ruralFromMarket: 0 }).get(market.i))!;
      row.bought += Math.max(0, ledger.foodProduced ?? 0);
      row.unsold += Math.max(0, ledger.unsoldHarvest ?? 0);
      // Set at each quarter's last month and held for three monthly samples.
      row.spoiledX3 += Math.max(0, ledger.storageSpoiled ?? 0);
      row.urbanSupplied += Math.max(0, ledger.monthlyConsumption?.urbanSupplied ?? 0);
      row.ruralFromMarket += Math.max(0, ledger.monthlyConsumption?.ruralFromMarket ?? 0);
    }
    console.error(`[wet-pastoral] ${m}/${months}`);
  }

  const world = getWorldContext();
  const cells = world.pack.cells;
  const rate = world.populationRate || 1;
  const yields = getYieldPerArea();
  const cultivated = getCultivatedArea();
  const cultivable = getCultivableArea();
  const potential = getFoodPotential();
  const coverage = getCropLaborCoverage();
  const capacity = getRuralFoodCapacity();
  const herders = getHusbandryWorkers();
  const herdersRequired = getHusbandryRequiredWorkers();
  const marketOf = getMarketCellColumn();
  const cropGoods = getGoods().filter(good => Boolean(good.crop) && isGoodEnabled(good));
  const grazed = getGoods().filter(good => husbandry.isGrazedLivestockGood(good.name));
  const yearScale = 12 / months;

  type Row = Record<string, number>;
  const band = (b: string, rows: Record<string, Row>) => (rows[b] ??= {});
  const add = (row: Row, key: string, v: number) => (row[key] = (row[key] ?? 0) + (Number.isFinite(v) ? v : 0));
  const land: Record<string, Row> = {};
  const herds: Record<string, Row> = {};
  // Per cell: annual harvest and excess harvest (food units), for the market attribution below.
  const cellHarvest: { cell: number; band: string; harvest: number; excess: number }[] = [];
  const marketHarvest = new Map<number, number>();

  for (const budget of Object.values(world.pack.landUse?.cells ?? {})) {
    const cell = budget.sourceCellId;
    if (cells.h[cell] < 20) continue;
    const mm = (world.grid?.cells.prec?.[cells.g?.[cell] ?? cell] ?? 45) * 100;
    const b = bandOf(mm);
    const row = band(b, land);
    const people = budget.foodDemandPeople;
    const rural = Math.max(0, cells.pop[cell] ?? 0) * rate;
    const mix = getCropMix(world, cell, cropGoods);
    const p = mix.length
      ? mix.reduce((s, entry) => s + entry.share * precipitationSuitability(mm / 100, entry.good.crop!.precipitation), 0)
      : 0;
    add(row, "cells", 1);
    add(row, "foodDemandPeople", people);
    add(row, "ruralPeople", rural);
    add(row, "ruralGrainEaters", rural * getRuralGrainDietShare(cells, cell, capacity));
    add(row, "requiredHa", budget.requiredAreaHa);
    add(row, "targetHa", budget.policyTargetAreaHa);
    add(row, "allocatedHa", budget.allocatedAreaHa);
    const excess = Math.max(0, budget.policyTargetAreaHa - budget.requiredAreaHa * 1.1);
    add(row, "laborExcessHa", excess);
    if (excess > 1e-6) add(row, "laborExcessCells", 1);
    add(row, "cultivatedHa", cultivated[cell] ?? 0);
    add(row, "cultivatedYieldKgHa", (cultivated[cell] ?? 0) * (yields[cell] ?? 0));
    if (mix.length) {
      add(row, "pPeople", people);
      add(row, "pTimesPeople", p * people);
      add(row, "pastoralShareTimesPeople", pastoralShare(p) * people);
    }
    for (const tag of ["livestock-land-shortfall", "staple-arable-protected", "resolved-livestock-land"])
      if (budget.diagnostics.includes(tag)) add(row, `diag:${tag}`, 1);
    // One cow on the pasture its feed needs at local growth: grazing months, hay work and the
    // share of the herd its own forage carries through winter (livestockFeedPolicy.ts).
    const temperatures = readAgriculturalClimate(world, cell).monthlyMeanTemperatureC;
    const growth = getPastureGrowth(world, cell);
    add(row, "annualMeanTempTimesPeople", (people * temperatures.reduce((a, t) => a + t, 0)) / 12);
    add(row, "grazingMonthsTimesPeople", people * growth.weights.filter(w => w > 0).length);
    add(row, "pastureGrowthKgHaTimesPeople", people * growth.annualKgPerHa);
    const cowKg = ANNUAL_FEED_DM_KG_PER_HEAD.Cattle;
    const cowHa = husbandry.getPastureHectaresPerHead(world, cell, "Cattle");
    if (growth.annualKgPerHa > 0 && Number.isFinite(cowHa)) {
      const hay = getLivestockHayPlan(world, cell, cowKg, cowHa);
      add(row, "cowPeople", people);
      add(row, "cowHaTimesPeople", people * cowHa);
      add(row, "cowHayDaysTimesPeople", (people * hay.rawHarvestKg * HAY_WORK_DAYS_PER_TONNE_DM) / 1000);
      add(row, "cowWinterFeedShareTimesPeople", people * calculateWinterFeedShare(cowKg, cowKg / 0.8, growth.weights));
    }
    add(row, "pasturePlanNoLaborHa", husbandry.calculateDesiredPastureAreaHectares(world, cell, true));
    const adults = (Math.max(0, cells.maleAdults?.[cell] ?? 0) + Math.max(0, cells.femaleAdults?.[cell] ?? 0)) * rate;
    add(row, "ruralAdults", adults);
    add(row, "unallocatedHa", budget.unallocatedAreaHa);
    add(row, "unresolvedFoodPeople", budget.unresolvedFoodPeople);
    add(row, "cultivableHa", cultivable[cell] ?? 0);
    add(row, "herdersAssigned", herders[cell] ?? 0);
    add(row, "herdersRequired", herdersRequired[cell] ?? 0);
    const targets = husbandry.getLivestockHerdTargets(world, cell);
    const grossPasture = Object.entries(targets).reduce(
      (s, [name, heads]) => s + heads * husbandry.getPastureHectaresPerHead(world, cell, name),
      0
    );
    add(row, "pastureNeedHa", Math.max(0, grossPasture - husbandry.getGrazedFallowPastureEquivalentHectares(world, cell)));
    add(row, "pastureCeilingHa", husbandry.calculatePastureCeilingAreaHectares(world, cell));
    add(row, "pastureKeptHa", husbandry.getPastureAreaUsedHectares(cell));
    add(row, "physicalHa", budget.physicalLandAreaHa);
    const herdRow = band(b, herds);
    for (const good of grazed) {
      add(herdRow, `${good.name}Target`, targets[good.name] ?? 0);
      add(herdRow, `${good.name}Supported`, getDomesticatedCarryingCapacity(cell, good, 0));
    }
    // foodProduction.ts: annual harvest = potential x land coverage x labour coverage.
    const landCoverage = cultivable[cell] > 0 ? Math.min(1, Math.max(0, (cultivated[cell] ?? 0) / cultivable[cell])) : 0;
    const harvest = (potential[cell] ?? 0) * landCoverage * Math.min(1, Math.max(0, coverage[cell] ?? 1));
    const excessHarvest = budget.allocatedAreaHa > 0 ? harvest * Math.min(1, excess / budget.allocatedAreaHa) : 0;
    add(row, "harvestPersonYears", harvest / GROSS_FOOD_NEED);
    add(row, "excessHarvestPersonYears", excessHarvest / GROSS_FOOD_NEED);
    cellHarvest.push({ cell, band: b, harvest, excess: excessHarvest });
    marketHarvest.set(marketOf[cell], (marketHarvest.get(marketOf[cell]) ?? 0) + harvest);
  }

  // Excess harvest destination, at each market's own ratios over the run (annualised).
  const destination: Record<string, Row> = {};
  const marketTotals: Row = {};
  for (const [id, flow] of flows) {
    const harvest = marketHarvest.get(id) ?? 0;
    const offered = (flow.bought + flow.unsold) * yearScale;
    add(marketTotals, "harvest", harvest / GROSS_FOOD_NEED);
    add(marketTotals, "offered", offered / GROSS_FOOD_NEED);
    add(marketTotals, "bought", (flow.bought * yearScale) / GROSS_FOOD_NEED);
    add(marketTotals, "unsold", (flow.unsold * yearScale) / GROSS_FOOD_NEED);
    add(marketTotals, "spoiled", ((flow.spoiledX3 / 3) * yearScale) / GROSS_FOOD_NEED);
    add(marketTotals, "urbanSupplied", (flow.urbanSupplied * yearScale) / GROSS_FOOD_NEED);
    add(marketTotals, "ruralFromMarket", (flow.ruralFromMarket * yearScale) / GROSS_FOOD_NEED);
  }
  const marketRatios = new Map<number, { offeredShare: number; boughtShare: number; eatenShare: number; spoiledShare: number }>();
  for (const [id, flow] of flows) {
    const harvest = (marketHarvest.get(id) ?? 0) / yearScale;
    const offered = flow.bought + flow.unsold;
    const eaten = flow.urbanSupplied + flow.ruralFromMarket;
    const spoiled = flow.spoiledX3 / 3;
    marketRatios.set(id, {
      offeredShare: harvest > 0 ? Math.min(1, offered / harvest) : 0,
      boughtShare: offered > 0 ? flow.bought / offered : 0,
      eatenShare: flow.bought > 0 ? Math.min(1, eaten / flow.bought) : 0,
      spoiledShare: flow.bought > 0 ? Math.min(1, spoiled / flow.bought) : 0
    });
  }
  for (const { cell, band: b, harvest, excess } of cellHarvest) {
    if (!(excess > 0)) continue;
    const r = marketRatios.get(marketOf[cell]);
    const row = band(b, destination);
    const units = excess / GROSS_FOOD_NEED;
    if (!r) {
      add(row, "noMarket", units);
      continue;
    }
    // Households keep their reserve first, so the excess is the first grain the cell offers.
    const offered = Math.min(units, (harvest * r.offeredShare) / GROSS_FOOD_NEED);
    const bought = offered * r.boughtShare;
    add(row, "keptByHouseholds", units - offered);
    add(row, "offeredUnsold", offered - bought);
    add(row, "boughtEaten", bought * r.eatenShare);
    add(row, "boughtSpoiled", bought * Math.min(r.spoiledShare, 1 - r.eatenShare));
    add(row, "boughtOther", bought * Math.max(0, 1 - r.eatenShare - r.spoiledShare));
  }

  writeFileSync(
    output,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        inputSha256: createHash("sha256").update(bytes).digest("hex"),
        months,
        date: [host.simulation.currentYear, host.simulation.currentMonth],
        notes: [
          "Settled land cells with a land-use budget, banded by the map's 100 mm rainfall proxy, shown in mm.",
          "laborExcessHa = policy target - required x 1.1 (the labour-affordable top-up). p = share-weighted crop-mix rainfall suitability, people-weighted.",
          "pastoralShare uses the plan's tentative values (max 0.5, grain floor 0.4); nothing in the simulation uses it yet.",
          "Harvest and destinations are food-ledger units / GROSS_FOOD_NEED (person-years of grain), annualised to 12 months.",
          "Destination: per market, offered = bought + unsold over the run; the cell's excess counts as offered first (households keep their reserve first), up to the market's offered total, then at the market's bought, eaten (urban + rural draw), spoiled and other (stock, export, milling) ratios.",
          "Herd heads are real animals: Target from livestockHerdTargetPolicy, Supported = carrying capacity after winter feed."
        ],
        pastoralShareFormula: { max: PASTORAL_SHARE_MAX, grainFloor: GRAIN_SHARE_FLOOR, wetToleranceAtMax: WET_TOLERANCE_AT_MAX },
        bands: BANDS,
        land,
        herds,
        excessHarvestDestination: destination,
        marketTotals
      },
      null,
      1
    )}\n`
  );
} finally {
  host.dispose();
}
