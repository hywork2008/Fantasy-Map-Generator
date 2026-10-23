// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import {
  getHusbandryMonthlyWorkDays,
  getHusbandryWorkers,
  setHusbandryMonthlyWorkDays,
  setHusbandryWorkers
} from "../extensions/economy/context/agriculture";
import { getOrCreateFaunaStockTable } from "../extensions/economy/context/cellTables";
import { getWinterSlaughterState } from "../extensions/economy/context/winterSlaughter";
import { getGoods, getMarketCellColumn, getMarkets } from "../extensions/economy/economyContext";
import { withLivestockFeedPeriod } from "../extensions/economy/generators/livestockFeedState";
import { readAgriculturalClimate } from "../extensions/economy/generators/seasonalCropClimate";
import { isWinterPreparationSeason } from "../extensions/economy/generators/winterSlaughter";
import { settleWinterSlaughter } from "../extensions/economy/generators/winterSlaughterSettlement";
import { createNodeSimulationHost, loadWorld } from "./adapters/node";

it("keeps private processing, source debits and payments exactly once across real archive reloads", async () => {
  const bytes = new Uint8Array(
    readFileSync(resolve(__dirname, "../../docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg"))
  );
  const host = createNodeSimulationHost();
  try {
    await loadWorld(host, bytes);
    const candidate = Array.from(host.world.pack.cells.i).flatMap(cell => {
      if (host.world.pack.cells.h[cell] < 20 || !getMarketCellColumn()[cell]) return [];
      const temperatures = Array.from(readAgriculturalClimate(host.world, cell).monthlyMeanTemperatureC);
      const month = temperatures.findIndex((_, month) => isWinterPreparationSeason(temperatures, month));
      return month >= 0 ? [{ cell, month }] : [];
    })[0];
    expect(candidate).toBeDefined();
    const { cell, month } = candidate;
    const period = 1300 * 12 + month;
    // Explicitly supply one test household with real debitable animals, workers and purchased materials.
    // Fixture quantities do not establish historical coefficients or natural-run production volume.
    host.world.options.winterLivestockSlaughter = "experimental-temperate";
    host.world.pack.cells.pop[cell] = 100 / host.world.populationRate;
    const workers = getHusbandryWorkers().slice();
    workers[cell] = 10;
    setHusbandryWorkers(workers);
    const calendar = new Float32Array(host.world.pack.cells.i.length * 12);
    calendar[cell * 12 + month] = 100;
    calendar[cell * 12 + ((month + 1) % 12)] = 100;
    setHusbandryMonthlyWorkDays(calendar);
    getOrCreateFaunaStockTable()![`${cell}:Pig`] = { young: 5, breeding: 10, old: 100 };
    const marketId = getMarketCellColumn()[cell];
    let market = getMarkets().find(market => market.i === marketId)!;
    const salt = getGoods().find(good => good.name === "Salt")!;
    const wood = getGoods().find(good => good.name === "Wood")!;
    market.goods[salt.i] = { stock: 50, price: 3 };
    market.goods[wood.i] = { stock: 0, price: 10 };
    market.foodLedger!.ruralHouseholdWealth = 10000;
    withLivestockFeedPeriod(period, () => settleWinterSlaughter());
    const state = getWinterSlaughterState()!;
    const jobs = Object.values(state.jobs).filter(job => job.cellId === cell);
    expect(jobs.length).toBeGreaterThan(0);
    expect(jobs.every(job => job.status === "processing")).toBe(true);
    const saved = structuredClone(state);
    const savedPig = structuredClone(getOrCreateFaunaStockTable()![`${cell}:Pig`]);
    const savedSalt = market.goods[salt.i].stock;
    const savedCash = market.foodLedger!.ruralHouseholdWealth;
    await loadWorld(host, await host.saveArchive());
    expect(host.world.options.winterLivestockSlaughter).toBe("experimental-temperate");
    expect(getWinterSlaughterState()).toEqual(saved);
    expect(getHusbandryMonthlyWorkDays()).toEqual(calendar);
    market = getMarkets().find(market => market.i === marketId)!;
    withLivestockFeedPeriod(period, () => settleWinterSlaughter());
    expect(getWinterSlaughterState()).toEqual(saved);
    expect(getOrCreateFaunaStockTable()![`${cell}:Pig`]).toEqual(savedPig);
    expect(market.goods[salt.i].stock).toBe(savedSalt);
    expect(market.foodLedger!.ruralHouseholdWealth).toBe(savedCash);
    host.world.options.winterLivestockSlaughter = "off";
    withLivestockFeedPeriod(period + 1, () => settleWinterSlaughter());
    expect(jobs.every(job => getWinterSlaughterState()!.jobs[job.id].status === "completed")).toBe(true);
    expect(
      getWinterSlaughterState()!.samples.find(row => row.cellId === cell && row.period === period + 1)!
        .preservedConsumedKg
    ).toBeGreaterThan(0);
    const finished = structuredClone(getWinterSlaughterState());
    await loadWorld(host, await host.saveArchive());
    withLivestockFeedPeriod(period + 1, () => settleWinterSlaughter());
    expect(getWinterSlaughterState()).toEqual(finished);
  } finally {
    host.dispose();
  }
}, 300_000);
