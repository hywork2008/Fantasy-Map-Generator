import { getCropResidueState } from "../context/cropResidues";
import { getEconomySlice } from "../context/economyApi";
import { getWinterSlaughterState, isWinterSlaughterExperimentEnabled } from "../context/winterSlaughter";
import {
  getGoods,
  getHusbandryWorkers,
  getMarketCellColumn,
  getMarkets,
  getOrCreateFaunaStockTable,
  getOrCreateLivestockFeedTable,
  getWorldContext
} from "../economyContext";
import { getCropResidueForecast } from "./cropResidues";
import type { FaunaCohorts } from "./faunaPopulationTypes";
import { SALT_KILOGRAMS_PER_BAG } from "./goodMeasureCatalog";
import { isGoodEnabled } from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { getRuralHouseholdWealth } from "./householdWealth";
import { calculateHusbandryDemand, getPastureAreaUsedHectares } from "./husbandry";
import { getHusbandryLaborBudget } from "./husbandryLabor";
import { getPastureGrowth, HAY_WORK_DAYS_PER_TONNE_DM } from "./livestockFeedPolicy";
import { livestockFeedPeriod } from "./livestockFeedState";
import type { Market } from "./marketTypes";
import { getModifiers } from "./production-utils";
import { readAgriculturalClimate } from "./seasonalCropClimate";
import { createWinterSlaughterState, settleWinterSlaughterCell } from "./winterSlaughter";
import { EXPERIMENTAL_CARCASS_PROFILES, WINTER_SLAUGHTER_POLICY as policy } from "./winterSlaughterPolicy";
import { WOOD_KG_PER_LOT } from "./woodRecipeContracts";

/** After hay harvest and salt supply, before trade and current-period feeding. */
export function settleWinterSlaughter(): void {
  const previous = getWinterSlaughterState();
  const enabled = isWinterSlaughterExperimentEnabled();
  if (!enabled && !previous) return;
  const slice = getEconomySlice();
  if (!slice) return;
  const world = getWorldContext();
  const period = livestockFeedPeriod();
  const month = ((period % 12) + 12) % 12;
  const year = Math.floor(period / 12);
  const herds = getOrCreateFaunaStockTable();
  const feed = getOrCreateLivestockFeedTable();
  if (!herds || !feed) return;
  const state = previous ? structuredClone(previous) : createWinterSlaughterState();
  const goods = getGoods();
  const salt = goods.find(good => good.name === "Salt" && isGoodEnabled(good));
  const wood = goods.find(good => good.name === "Wood" && isGoodEnabled(good));
  const markets = new Map(getMarkets().map(market => [market.i, market]));
  const column = getMarketCellColumn();
  const accounts = new Map<
    number,
    {
      market: Market;
      wallet: number;
      saltKg: number;
      woodKg: number;
      saltPrice: number;
      woodPrice: number;
      spent: number;
      saltUsed: number;
      woodUsed: number;
    }
  >();
  const changes: { key: string; herd: FaunaCohorts }[] = [];
  const byCell = new Map<number, Record<string, FaunaCohorts>>();
  for (const [key, herd] of Object.entries(herds)) {
    const separator = key.indexOf(":");
    const cell = Number(key.slice(0, separator));
    const species = key.slice(separator + 1);
    if (separator < 0 || !Number.isSafeInteger(cell) || cell < 0) continue;
    const rows = byCell.get(cell) ?? {};
    rows[species] = structuredClone(herd);
    byCell.set(cell, rows);
  }
  // Existing private stocks continue aging and feeding their owners after disabling new jobs.
  for (const cell of Object.keys(state.lastPeriodByCell)) if (!byCell.has(+cell)) byCell.set(+cell, {});
  let changed = false;
  for (const [cell, localHerds] of [...byCell].sort(([a], [b]) => a - b)) {
    if ((state.lastPeriodByCell[cell] ?? -Infinity) >= period || world.pack.cells.h[cell] < 20) continue;
    if (
      !Object.keys(localHerds).some(species => EXPERIMENTAL_CARCASS_PROFILES[species]) &&
      state.lastPeriodByCell[cell] === undefined
    )
      continue;
    const people = Math.max(0, world.pack.cells.pop[cell] ?? 0) * (world.populationRate ?? 1000);
    if (!(people > 0) && previous?.lastPeriodByCell[cell] === undefined) continue;
    const market = markets.get(column[cell]);
    let account = market ? accounts.get(market.i) : undefined;
    if (market?.foodLedger && !account) {
      const saltStock = salt ? market.goods[salt.i] : undefined;
      const woodStock = wood ? market.goods[wood.i] : undefined;
      const saltPrice = (saltStock?.price ?? 0) / SALT_KILOGRAMS_PER_BAG;
      const woodPrice = (woodStock?.price ?? 0) / WOOD_KG_PER_LOT;
      account = {
        market,
        wallet: getRuralHouseholdWealth(market),
        spent: 0,
        saltUsed: 0,
        woodUsed: 0,
        saltKg:
          Number.isFinite(saltPrice) && saltPrice > 0 ? Math.max(0, saltStock?.stock ?? 0) * SALT_KILOGRAMS_PER_BAG : 0,
        woodKg: Number.isFinite(woodPrice) && woodPrice > 0 ? Math.max(0, woodStock?.stock ?? 0) * WOOD_KG_PER_LOT : 0,
        saltPrice: Number.isFinite(saltPrice) && saltPrice > 0 ? saltPrice : 0,
        woodPrice: Number.isFinite(woodPrice) && woodPrice > 0 ? woodPrice : 0
      };
      accounts.set(market.i, account);
    }
    const assigned = Math.max(0, getHusbandryWorkers()[cell] ?? 0);
    const demand = calculateHusbandryDemand(world, cell);
    const hay = feed[cell];
    // Routine care and the actual haymaking work retain priority over meat processing.
    const labor = getHusbandryLaborBudget(cell, month, demand);
    const hayDays = hay?.harvestPeriod === period ? (hay.harvestedKg / 1000) * HAY_WORK_DAYS_PER_TONNE_DM : 0;
    const residue = getCropResidueState()?.cells[cell];
    const residueDays = residue?.samples.find(sample => sample.period === period)?.workDays ?? 0;
    const availableDays = Math.max(0, labor.reservedDays - labor.careDays - hayDays - residueDays);
    const growth = getPastureGrowth(world, cell);
    const forage = getPastureAreaUsedHectares(cell) * growth.annualKgPerHa;
    const allowedSpecies =
      enabled && year >= policy.firstYear && year <= policy.lastYear
        ? goods
            .filter(
              good =>
                EXPERIMENTAL_CARCASS_PROFILES[good.name] &&
                good.tags.includes("food") &&
                good.tags.includes("liveAnimal") &&
                isGoodEnabled(good) &&
                getModifiers(good, cell) > 0
            )
            .map(good => good.name)
        : [];
    const sample = settleWinterSlaughterCell(state, {
      cellId: cell,
      period,
      people,
      herds: localHerds,
      allowedSpecies,
      temperaturesC: Array.from(readAgriculturalClimate(world, cell).monthlyMeanTemperatureC),
      forageKg: Array.from(
        { length: policy.forecastMonths },
        (_, ahead) => forage * growth.weights[(month + ahead) % 12]
      ),
      hayKg: hay?.hayKg ?? 0,
      cropResidues: getCropResidueForecast(residue, period),
      workDays: availableDays,
      handlingKg: assigned * policy.handlingKgPerWorkerMonth,
      storageKg: assigned * policy.storageKgPerWorker,
      saltKg: account?.saltKg ?? 0,
      woodKg: account?.woodKg ?? 0,
      saltPricePerKg: account?.saltPrice ?? 0,
      woodPricePerKg: account?.woodPrice ?? 0,
      cashBudget: account
        ? Math.floor(Math.max(0, account.wallet * policy.materialCashShare - account.spent) * 100) / 100
        : 0
    });
    if (!sample) continue;
    sample.workBudgetBasis = labor.basis;
    sample.workReservedDays = labor.reservedDays;
    sample.careWorkDays = labor.careDays;
    sample.hayWorkDays = hayDays;
    sample.cropResidueWorkDays = residueDays;
    changed = true;
    for (const [species, herd] of Object.entries(localHerds)) changes.push({ key: `${cell}:${species}`, herd });
    if (account) {
      account.saltKg = Math.max(0, account.saltKg - sample.saltKg);
      account.woodKg = Math.max(0, account.woodKg - sample.woodKg);
      account.spent += sample.spending;
      account.saltUsed += sample.saltKg;
      account.woodUsed += sample.woodKg;
    }
  }
  if (!changed) return;
  // Publish physical cohorts, private food, material debits and cash without callbacks between writes.
  for (const { key, herd } of changes) herds[key] = herd;
  for (const account of accounts.values()) {
    const { market } = account;
    if (salt && account.saltUsed > 0) market.goods[salt.i].stock = account.saltKg / SALT_KILOGRAMS_PER_BAG;
    if (wood && account.woodUsed > 0) market.goods[wood.i].stock = account.woodKg / WOOD_KG_PER_LOT;
    if (account.spent > 0) {
      market.foodLedger!.ruralHouseholdWealth = Math.round((account.wallet - account.spent) * 100) / 100;
      market.marketTreasury ??= { balance: 0, ruralGrainPayable: 0 };
      market.marketTreasury.balance = Math.round((market.marketTreasury.balance + account.spent) * 100) / 100;
    }
  }
  slice.winterSlaughter = state;
  for (const account of accounts.values()) {
    for (const [good, kg, kgPerUnit] of [
      [salt, account.saltUsed, SALT_KILOGRAMS_PER_BAG],
      [wood, account.woodUsed, WOOD_KG_PER_LOT]
    ] as const) {
      if (good && kg > 0)
        recordGoodFlow({
          direction: "sink",
          category: "recipeInput",
          goodId: good.i,
          units: kg / kgPerUnit,
          marketId: account.market.i
        });
    }
  }
}
