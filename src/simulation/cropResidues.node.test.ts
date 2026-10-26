// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import {
  getHusbandryWorkers,
  setHusbandryMonthlyWorkDays,
  setHusbandryWorkers
} from "../extensions/economy/context/agriculture";
import { getOrCreateFaunaStockTable, getOrCreateLivestockFeedTable } from "../extensions/economy/context/cellTables";
import { cropResiduesNeedPhysicalSettlement, getCropResidueState } from "../extensions/economy/context/cropResidues";
import { settleCropResiduePreparation } from "../extensions/economy/generators/cropResidueSettlement";
import { FoodProduction } from "../extensions/economy/generators/foodProduction";
import { calculateHusbandryDemand } from "../extensions/economy/generators/husbandry";
import {
  getLivestockMonthlyFeedNeedKg,
  harvestLivestockForage,
  settleLivestockFeed
} from "../extensions/economy/generators/livestockFeed";
import { withLivestockFeedPeriod } from "../extensions/economy/generators/livestockFeedState";
import { createNodeSimulationHost, loadWorld } from "./adapters/node";

it("credits actual crop harvests and preserves collected/consumed residues without replay across archive reload", async () => {
  const host = createNodeSimulationHost();
  try {
    await loadWorld(
      host,
      new Uint8Array(
        readFileSync(resolve(__dirname, "../../docs/analytics/inputs/salt-s0-aligned-20261023/world-102.fmg"))
      )
    );
    host.world.options.winterLivestockSlaughter = "experimental-temperate";
    let candidate: { cell: number; period: number } | undefined;
    for (let month = 1; month <= 12; month++) {
      const period = 1301 * 12 + month - 1;
      FoodProduction.generateMonthlyLedger(month, period);
      const cell = Object.entries(getCropResidueState()?.cells ?? {}).find(([, cell]) =>
        cell.receipts.some(receipt => receipt.period === period)
      );
      if (cell) {
        candidate = { cell: Number(cell[0]), period };
        break;
      }
    }
    expect(candidate).toBeDefined();
    const { cell, period } = candidate!;
    const receipts = structuredClone(getCropResidueState()!.cells[cell].receipts);
    const workers = getHusbandryWorkers().slice();
    workers[cell] = 100;
    setHusbandryWorkers(workers);
    const calendar = new Float32Array(host.world.pack.cells.i.length * 12);
    calendar[cell * 12 + (period % 12)] = 1000;
    setHusbandryMonthlyWorkDays(calendar);
    getOrCreateFaunaStockTable()![`${cell}:Sheep`] = { young: 0, breeding: 1000, old: 0 };
    expect(calculateHusbandryDemand(host.world, cell).residueWorkers).toBeGreaterThan(0);
    withLivestockFeedPeriod(period, () => {
      harvestLivestockForage();
      const feed = getOrCreateLivestockFeedTable()![cell];
      feed.grazingReservedKg = 0;
      feed.hayKg = 0;
      feed.harvestedKg = 0;
      settleCropResiduePreparation();
      settleLivestockFeed();
    });
    const sample = getCropResidueState()!.cells[cell].samples.at(-1)!;
    expect(sample.collectedKg).toBeGreaterThan(0);
    expect(sample.feedEquivalentKg).toBeGreaterThan(0);
    expect(sample.feedEquivalentKg).toBeLessThanOrEqual(getLivestockMonthlyFeedNeedKg(cell) * 0.2 + 1e-8);
    expect(sample.openingKg).toBeCloseTo(
      sample.closingKg + sample.lossKg + sample.strawConsumedKg + sample.stubbleConsumedKg
    );
    const saved = structuredClone(getCropResidueState());
    await loadWorld(host, await host.saveArchive());
    expect(getCropResidueState()).toEqual(saved);
    withLivestockFeedPeriod(period, () => {
      settleCropResiduePreparation();
      settleLivestockFeed();
    });
    FoodProduction.generateMonthlyLedger((period % 12) + 1, period);
    expect(getCropResidueState()).toEqual(saved);
    expect(getCropResidueState()!.cells[cell].receipts).toEqual(receipts);
    host.world.options.winterLivestockSlaughter = "off";
    expect(cropResiduesNeedPhysicalSettlement()).toBe(true);
    const oldCount = getCropResidueState()!.cells[cell].receipts.length;
    FoodProduction.generateMonthlyLedger((period % 12) + 1, period + 12);
    expect(getCropResidueState()!.cells[cell].receipts).toHaveLength(oldCount);
    withLivestockFeedPeriod(period + 12, () => settleCropResiduePreparation());
    expect(getCropResidueState()!.cells[cell].lots).toHaveLength(0);
  } finally {
    host.dispose();
  }
}, 300_000);
