// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";
import { getLivestockDispatchTable } from "../extensions/economy/context/cellTables";
import { getGoods, getMarkets } from "../extensions/economy/context/trade";
import { getLivestockLotLedger } from "../extensions/economy/generators/livestockLots";
import { advanceWorld, createNodeSimulationHost, loadWorld } from "./adapters/node";

it("preserves live dispatch, herds and market stocks across a mid-cycle archive reload", async () => {
  const fixture = new Uint8Array(
    readFileSync(resolve(__dirname, "../../docs/analytics/inputs/salt-s0-aligned-20261023/province-101.fmg"))
  );
  const run = async (reload: boolean) => {
    const host = createNodeSimulationHost();
    try {
      await loadWorld(host, fixture);
      await advanceWorld(host, { days: 47 });
      const receipts = JSON.parse(JSON.stringify(getLivestockDispatchTable()));
      expect(Object.keys(receipts).length).toBeGreaterThan(0);
      if (reload) {
        await loadWorld(host, await host.saveArchive());
        expect(JSON.parse(JSON.stringify(getLivestockDispatchTable()))).toEqual(receipts);
        expect(Object.values(getLivestockDispatchTable()!).every(row => !row.observation)).toBe(true);
      }
      await advanceWorld(host, { days: 30 });
      const ledger = getLivestockLotLedger();
      expect(ledger).not.toBeNull();
      expect(Object.keys(ledger!.exits).length).toBeGreaterThan(0);
      const aged = Object.values(ledger!.shipments).filter(row => row.cohortHeads);
      expect(aged.length).toBeGreaterThan(0);
      for (const shipment of aged) {
        const ages = shipment.cohortHeads!;
        expect(ages.young + ages.breeding + ages.old).toBeCloseTo(shipment.heads, 8);
      }
      expect(Object.values(ledger!.lots).every(lot => Number.isFinite(lot.heads) && lot.heads >= 0)).toBe(true);
      const economy = host.simulation.extensions?.economy as Record<string, unknown>;
      const liveIds = getGoods()
        .filter(good => good.tags.includes("liveAnimal"))
        .map(good => good.i);
      return JSON.parse(
        JSON.stringify({
          lots: economy.livestockLots,
          dispatch: economy.livestockDispatch,
          herds: economy.faunaStock,
          phases: economy.cadencePhases,
          stocks: getMarkets().map(market => ({
            marketId: market.i,
            goods: liveIds.map(id => [id, market.goods[id]?.stock ?? 0])
          }))
        })
      );
    } finally {
      host.dispose();
    }
  };
  // Scope the comparison to the persisted livestock chain and its production cadence.
  expect(await run(true)).toEqual(await run(false));
}, 300_000);
