import { rn } from "../../hostUtils";
import { getGoods, getMarkets, getMintLedgers, getWorldContext, setMintLedgers } from "../economyContext";
import { INITIAL_MONTHS_OF_CURRENCY, TARGET_MONTHS_OF_CURRENCY } from "./currencySufficiency";
import { Markets } from "./markets-generator";
import type { MintLedger } from "./mintingTypes";

export type { MintLedger } from "./mintingTypes";

const METAL_COIN_VALUES = [
  ["silver ingot", 10],
  ["gold ingot", 100],
  ["copper ingot", 1]
] as const;
const CIRCULATION_MONTHLY_RETENTION = 0.995;
const SEIGNIORAGE_RATE = 0.02;

/**
 * Converts Gold / Silver / Copper Ingot market stock into a state currency ledger.
 * `circulation` is the L7 money-supply input (`currencySufficiency.ts`); only seigniorage
 * credits the fiscal treasury, so metal / coin / treasury are not the same wealth thrice.
 */
export class MintingModule {
  generate(): void {
    const priorByState = new Map(getMintLedgers().map(ledger => [ledger.stateId, ledger]));
    const ledgers: MintLedger[] = [];
    for (const state of getWorldContext().pack.states) {
      if (!state.i || state.removed) continue;
      const prior = priorByState.get(state.i);
      const currencyDemand = this.getCurrencyDemand(state.i);
      ledgers.push({
        stateId: state.i,
        mintMarketId: this.getMintMarketId(state.i),
        currencyDemand,
        circulation: prior?.circulation ?? rn(currencyDemand * INITIAL_MONTHS_OF_CURRENCY, 2),
        lastMintedValue: 0,
        totalMintedValue: prior?.totalMintedValue ?? 0,
        lastSeigniorage: 0
      });
    }
    setMintLedgers(ledgers);
  }

  clear(): void {
    setMintLedgers([]);
  }

  /** Runs once per Economy production month, before the market prices are refreshed. */
  settleMonthly(): void {
    const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));
    const states = getWorldContext().pack.states;

    for (const ledger of getMintLedgers()) {
      ledger.currencyDemand = this.getCurrencyDemand(ledger.stateId);
      ledger.lastMintedValue = 0;
      ledger.lastSeigniorage = 0;
      ledger.circulation = rn(ledger.circulation * CIRCULATION_MONTHLY_RETENTION, 2);
      const state = states[ledger.stateId];
      if (!state || state.removed || !ledger.mintMarketId) continue;

      let remainingDemand = Math.max(0, ledger.currencyDemand * TARGET_MONTHS_OF_CURRENCY - ledger.circulation);
      for (const [metal, coinValue] of METAL_COIN_VALUES) {
        if (remainingDemand <= 0) break;
        const good = goodsByName.get(metal);
        if (!good) continue;

        // Reserve most stock for private trade and manufacturing. Minting is a
        // state demand, not a free duplicate of the market's metal inventory.
        const suppliedUnits = Markets.consumeForMint(ledger.mintMarketId, good.i, remainingDemand / coinValue);
        if (suppliedUnits <= 0) continue;
        const mintedValue = rn(suppliedUnits * coinValue, 2);
        ledger.circulation = rn(ledger.circulation + mintedValue, 2);
        ledger.lastMintedValue = rn(ledger.lastMintedValue + mintedValue, 2);
        ledger.totalMintedValue = rn(ledger.totalMintedValue + mintedValue, 2);
        remainingDemand = Math.max(0, remainingDemand - mintedValue);
      }

      // Only the mint's fee reaches fiscal treasury. The remaining issued value
      // is recorded as circulation, so metal, coin stock and treasury cannot be
      // counted as the same wealth three times.
      const seigniorage = rn(ledger.lastMintedValue * SEIGNIORAGE_RATE, 2);
      ledger.lastSeigniorage = seigniorage;
      state.treasury = rn((state.treasury || 0) + seigniorage, 2);
    }
  }

  private getMintMarketId(stateId: number): number | null {
    const burgs = getWorldContext().pack.burgs;
    const candidates = getMarkets()
      .filter(market => burgs[market.centerBurgId]?.state === stateId)
      .sort((a, b) => (burgs[b.centerBurgId]?.population ?? 0) - (burgs[a.centerBurgId]?.population ?? 0));
    return candidates[0]?.i ?? null;
  }

  private getCurrencyDemand(stateId: number): number {
    const state = getWorldContext().pack.states[stateId];
    if (!state) return 0;
    const population = (state.rural || 0) + (state.urban || 0);
    const marketTradeValue = getMarkets()
      .filter(market => getWorldContext().pack.burgs[market.centerBurgId]?.state === stateId)
      .reduce(
        (total, market) =>
          total + Object.values(market.goods).reduce((value, entry) => value + entry.stock * entry.price, 0),
        0
      );
    return rn(Math.max(1, population * 0.06 + (state.urban || 0) * 0.04 + marketTradeValue * 0.002), 2);
  }
}

export const Minting = new MintingModule();
