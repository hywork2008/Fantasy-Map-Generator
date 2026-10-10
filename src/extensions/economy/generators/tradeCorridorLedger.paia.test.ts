import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { TradeRouteSegment } from "./marketTypes";
import { applyCorridorMovement, listCorridorNeeds, modeShareOf, type TradeCorridor } from "./tradeCorridorLedger";

const SAVE = "temp/000.savdata/Paia 2026-10-10-10-54.fmg";

/**
 * Replays the shipments and caravans still in the 2-year Paia save through the ledger.
 * The save itself was advanced before the ledger existed, so this is the window it still holds,
 * not a two-year accumulation. The top of that window includes a port-town pair.
 */
describe("Paia trade corridors", () => {
  it("includes a port-town pair among the busiest corridors", async () => {
    if (!existsSync(SAVE)) return;
    const zip = await JSZip.loadAsync(await readFile(SAVE));
    const core = JSON.parse(await zip.file("simulation/core.json")!.async("string")) as {
      extensions: {
        economy: {
          markets: { i: number; centerBurgId: number }[];
          marketShipments: {
            originBurgId: number;
            destinationBurgId: number;
            units: number;
            goodId: number;
            travelDays?: number;
          }[];
          caravans: {
            seller: number;
            sellerType: "burg" | "market";
            buyer: number;
            buyerType: "burg" | "market";
            value?: number;
            payload?: { goodId: number; units: number; cargoSlotsPerUnit?: number }[];
            routeSegments?: TradeRouteSegment[];
          }[];
        };
      };
    };
    const world = JSON.parse(await zip.file("map/world.json")!.async("string")) as {
      pack: { burgs: { i?: number; name?: string; port?: number; removed?: boolean }[] };
    };
    const ports = new Set<number>();
    const names = new Map<number, string>();
    for (const burg of world.pack.burgs) {
      if (!burg?.i || burg.removed) continue;
      names.set(burg.i, burg.name ?? String(burg.i));
      if (burg.port) ports.add(burg.i);
    }
    const markets = new Map(core.extensions.economy.markets.map(market => [market.i, market.centerBurgId]));
    const endpoint = (kind: "burg" | "market", id: number) => (kind === "burg" ? id : (markets.get(id) ?? null));

    let corridors: TradeCorridor[] = [];
    for (const shipment of core.extensions.economy.marketShipments) {
      const slots = Math.max(0, shipment.units);
      corridors = applyCorridorMovement(corridors, {
        originBurgId: shipment.originBurgId,
        destinationBurgId: shipment.destinationBurgId,
        cargoSlots: slots,
        value: 0,
        modeShare: { land: 1, river: 0, sea: 0 },
        observedDays: shipment.travelDays ?? 0,
        idealDays: shipment.travelDays ?? 0,
        routeIds: [],
        ferryCrossings: 0,
        goods: slots > 0 ? [{ id: shipment.goodId, slots }] : []
      });
    }
    for (const caravan of core.extensions.economy.caravans) {
      const origin = endpoint(caravan.sellerType, caravan.seller);
      const destination = endpoint(caravan.buyerType, caravan.buyer);
      if (origin === null || destination === null) continue;
      const goods = (caravan.payload ?? []).map(line => ({
        id: line.goodId,
        slots: Math.max(0, line.units) * (line.cargoSlotsPerUnit ?? 1)
      }));
      corridors = applyCorridorMovement(corridors, {
        originBurgId: origin,
        destinationBurgId: destination,
        cargoSlots: goods.reduce((sum, line) => sum + line.slots, 0),
        value: caravan.value ?? 0,
        modeShare: modeShareOf(caravan.routeSegments ?? []),
        observedDays: 1,
        idealDays: 1,
        routeIds: [],
        ferryCrossings: 0,
        goods
      });
    }

    const needs = listCorridorNeeds(corridors, {
      name: id => names.get(id) ?? String(id),
      harbor: () => 0
    });
    const top = needs.slice(0, 10);
    expect(top.some(row => ports.has(row.burgA) && ports.has(row.burgB))).toBe(true);
  }, 60_000);
});
