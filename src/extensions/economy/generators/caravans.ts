import { rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { getBurgMarketLedger } from "./burgMarketLedgers";
import type { Caravan, Deal } from "./marketTypes";
import { TradeAnimation } from "./trade-animation";

const AVERAGE_SPEED_KM_PER_DAY = 40;

export class CaravansModule {
  spawnFromDeals(deals: Deal[]) {
    const world = getWorldContext();
    if (!world.pack.caravans) world.pack.caravans = [];

    let nextId = world.pack.caravans.length > 0 ? Math.max(...world.pack.caravans.map(c => c.i)) + 1 : 0;

    const markets = world.pack.markets;
    const burgs = world.pack.burgs;
    if (!markets || !burgs) return;

    type RouteKey = `${number}-${string}-${number}-${string}`;
    const bundles = new Map<
      RouteKey,
      {
        seller: number;
        sellerType: "burg" | "market";
        buyer: number;
        buyerType: "burg" | "market";
        deals: Deal[];
      }
    >();

    for (const deal of deals) {
      if (deal.units <= 0 || deal.spawned) continue;
      deal.spawned = true;

      const key: RouteKey = `${deal.seller}-${deal.sellerType}-${deal.buyer}-${deal.buyerType}`;
      let bundle = bundles.get(key);
      if (!bundle) {
        bundle = {
          seller: deal.seller,
          sellerType: deal.sellerType,
          buyer: deal.buyer,
          buyerType: deal.buyerType,
          deals: []
        };
        bundles.set(key, bundle);
      }
      bundle.deals.push(deal);
    }

    for (const bundle of bundles.values()) {
      let startBurgId: number;
      if (bundle.sellerType === "market") {
        const m = markets[bundle.seller];
        if (!m) continue;
        startBurgId = m.centerBurgId;
      } else {
        startBurgId = bundle.seller;
      }

      let endBurgId: number;
      if (bundle.buyerType === "market") {
        const m = markets[bundle.buyer];
        if (!m) continue;
        endBurgId = m.centerBurgId;
      } else {
        endBurgId = bundle.buyer;
      }

      const startBurg = burgs[startBurgId];
      const endBurg = burgs[endBurgId];

      if (!startBurg || !endBurg || startBurg.i === endBurg.i) continue;

      const routePath = TradeAnimation.findRoutePath(startBurg.cell, endBurg.cell);
      if (!routePath || routePath.segments.length === 0) continue;

      let calculatedDistance = 0;
      for (const seg of routePath.segments) {
        for (let i = 0; i < seg.points.length - 1; i++) {
          const [x1, y1] = seg.points[i];
          const [x2, y2] = seg.points[i + 1];
          calculatedDistance += Math.hypot(x2 - x1, y2 - y1);
        }
      }

      const distance = calculatedDistance * world.distanceScale;
      if (distance <= 0) continue;

      let totalUnits = 0;
      let totalValue = 0;
      const payload = bundle.deals.map(d => {
        const value = d.price * d.units;
        totalUnits += d.units;
        totalValue += value;
        return { goodId: d.good, dealId: d.i, units: d.units, value };
      });

      const caravan: Caravan = {
        i: nextId++,
        seller: bundle.seller,
        sellerType: bundle.sellerType,
        buyer: bundle.buyer,
        buyerType: bundle.buyerType,
        payload,
        units: rn(totalUnits, 2),
        value: rn(totalValue, 2),
        routeSegments: routePath.segments as { type: "land" | "water"; points: [number, number][] }[],
        totalDistance: distance,
        currentDistance: 0,
        state: "transit"
      };

      world.pack.caravans.push(caravan);
    }
  }

  tick(deltaDays: number) {
    const world = getWorldContext();
    if (!world.pack.caravans) return;

    for (const caravan of world.pack.caravans) {
      if (caravan.state !== "transit") continue;

      caravan.currentDistance += AVERAGE_SPEED_KM_PER_DAY * deltaDays;

      // Calculate Bandit Risk based on route path or simple market states
      // For now, default is 0. If there's a war in the region, risk increases.
      const buyerMarket = world.pack.markets[caravan.buyer];
      let banditRiskPerDay = 0;
      if (buyerMarket) {
        const ledger = getBurgMarketLedger(buyerMarket.centerBurgId);
        if (ledger?.warIntensity) {
          banditRiskPerDay = 0.001 * ledger.warIntensity; // 0.1% chance per day per intensity level
        }
      }

      if (banditRiskPerDay > 0) {
        const risk = banditRiskPerDay * deltaDays;
        if (Math.random() < risk) {
          caravan.state = "lost";
          // We could optionally generate a news log or notification here
          continue;
        }
      }

      if (caravan.currentDistance >= caravan.totalDistance) {
        caravan.state = "arrived";

        // Add goods to target market
        if (caravan.buyerType === "market") {
          const buyerMarket = world.pack.markets[caravan.buyer];
          if (buyerMarket) {
            for (const item of caravan.payload) {
              const good = buyerMarket.goods[item.goodId];
              if (good) {
                good.stock = rn(good.stock + item.units, 2);
              }
            }
          }
        }
      }
    }

    // Clean up arrived/lost caravans
    world.pack.caravans = world.pack.caravans.filter(c => c.state === "transit");
  }
}

export const Caravans = new CaravansModule();
