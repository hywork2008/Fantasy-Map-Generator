import { pow } from "../../../simulation/deterministicMath";
import { measureTickStep, rn } from "../../hostUtils";
import {
  getBurgMarketLedgers,
  getGoods,
  getMarkets,
  getMintLedgers,
  getWorldContext,
  setMintLedgers
} from "../economyContext";
import {
  getCurrencySufficiency,
  INITIAL_MONTHS_OF_CURRENCY,
  isMoneySupplyEnabled,
  SEIGNIORAGE_RATE,
  stepPriceLevel,
  TARGET_MONTHS_OF_CURRENCY
} from "./currencySufficiency";
import { getEconomyStartProfile } from "./economyStartMode";
import { Markets } from "./markets-generator";
import type { Market } from "./marketTypes";
import type { MintLedger } from "./mintingTypes";
import { nominal } from "./moneyScale";
import { getStateMoneyStocks, type StateMoneyStock } from "./stateMoneySupply";

export type { MintLedger } from "./mintingTypes";

const METAL_COIN_VALUES = [
  ["silver ingot", 10],
  ["gold ingot", 100],
  ["copper ingot", 1]
] as const;
const CIRCULATION_MONTHLY_RETENTION = 0.995;
/** Share of a market's stock of market goods valued into the State's monthly currency demand. */
const MARKET_STOCK_CURRENCY_SHARE = 0.002;
/**
 * Coin lost to wear each year under the money-supply model: English pennies lost 2–2.75% of their
 * weight in ten years (Lloyd, Edwardian Monetary Affairs). docs/plan/money-supply-mint.md §5.
 */
export const COIN_WEAR_ANNUAL_RATE = 0.0025;
const COIN_WEAR_MONTHLY_RETENTION = pow(1 - COIN_WEAR_ANNUAL_RATE, 1 / 12);

/**
 * Months after the model starts over which `MintLedger.demandScale` follows the State's money before
 * it is fixed: the start profile's uneven split between States evens out in the first years' trade,
 * and the farms of land a State claims early count to its money and partly fall back in the second
 * year. Calibrating before that read it as a lasting shortage (money-supply-mint.md §11.4).
 */
const START_CALIBRATION_MONTHS = 24;
/** Bounds of the start calibration of a State's currency demand (`MintLedger.demandScale`). */
const MIN_DEMAND_SCALE = 0.25;
const MAX_DEMAND_SCALE = 4;

const mean = (range: readonly [number, number]) => (range[0] + range[1]) / 2;

/**
 * Monthly currency demand under the money-supply model (docs/plan/money-supply-mint.md §4.1): one
 * twelfth of the cash the start profile gives the State's people, towns and markets, so a full
 * 12-month stock is the money a newly generated State holds per head. The legacy demand
 * (`nominal(population × 0.06 …)`) was about a twentieth of that, which a real money stock always
 * exceeded. Population is the live count, not the stale `state.rural`.
 */
export function getMoneySupplyDemand(
  stock: Pick<StateMoneyStock, "population" | "urbanPopulation">,
  marketStockValue = 0
): number {
  const profile = getEconomyStartProfile(getWorldContext().options ?? {});
  const perHead = profile.householdWealthPerPopulation + profile.stateTreasuryPerPopulation;
  const perTownHead =
    profile.burgTreasuryPerPopulation * (1 + mean(profile.marketTreasuryShare) + mean(profile.tradeCapitalShare));
  const yearly = stock.population * perHead + stock.urbanPopulation * perTownHead;
  return rn(Math.max(1, yearly / TARGET_MONTHS_OF_CURRENCY + marketStockValue * MARKET_STOCK_CURRENCY_SHARE), 2);
}

/**
 * The State's money when the model starts is what its prices were set by: demand is scaled so that
 * stock is exactly 12 months (sufficiency 1, price level 1), whatever the start profile put where.
 * Later growth without new bullion, or bullion piling in, moves sufficiency from there.
 */
function calibrateDemandScale(stock: Pick<StateMoneyStock, "money">, rawDemand: number): number {
  if (!(rawDemand > 0)) return 1;
  const scale = stock.money / (rawDemand * TARGET_MONTHS_OF_CURRENCY);
  return rn(Math.min(MAX_DEMAND_SCALE, Math.max(MIN_DEMAND_SCALE, scale)), 4);
}

/**
 * Converts Gold / Silver / Copper Ingot market stock into a state currency ledger.
 *
 * Legacy model: `circulation` is a ledger figure (`currencySufficiency.ts`); only seigniorage
 * credits the fiscal treasury, so metal / coin / treasury are not the same wealth thrice.
 *
 * Money-supply model (`fmg-money-supply` on, docs/plan/money-supply-mint.md §4.1, §11.3): the mint
 * buys bullion at its coin value and pays in new coin, so the market's cash grows by what it sold.
 * `circulation` is the State's real money; a State without bullion cannot add to it.
 */
export class MintingModule {
  generate(): void {
    const priorByState = new Map(getMintLedgers().map(ledger => [ledger.stateId, ledger]));
    const moneySupply = isMoneySupplyEnabled();
    const stocks = moneySupply ? getStateMoneyStocks() : undefined;
    const ledgers: MintLedger[] = [];
    for (const state of getWorldContext().pack.states) {
      if (!state.i || state.removed) continue;
      const prior = priorByState.get(state.i);
      const stock = stocks?.get(state.i);
      const rawDemand = stock ? getMoneySupplyDemand(stock, this.getMarketStockValue(state.i)) : 0;
      const demandScale = stock ? (prior?.demandScale ?? calibrateDemandScale(stock, rawDemand)) : undefined;
      const currencyDemand = stock ? rn(rawDemand * (demandScale ?? 1), 2) : this.getCurrencyDemand(state.i);
      ledgers.push({
        stateId: state.i,
        mintMarketId: this.getMintMarketId(state.i),
        currencyDemand,
        circulation: stock
          ? rn(stock.money, 2)
          : (prior?.circulation ?? rn(currencyDemand * INITIAL_MONTHS_OF_CURRENCY, 2)),
        lastMintedValue: 0,
        totalMintedValue: prior?.totalMintedValue ?? 0,
        lastSeigniorage: 0,
        ...(moneySupply
          ? {
              priceLevel: prior?.priceLevel ?? 1,
              lastWear: 0,
              demandScale,
              calibrationMonthsLeft: prior ? prior.calibrationMonthsLeft : START_CALIBRATION_MONTHS
            }
          : {})
      });
    }
    setMintLedgers(ledgers);
  }

  clear(): void {
    setMintLedgers([]);
  }

  /** Runs once per Economy production month, before the market prices are refreshed. */
  settleMonthly(): void {
    if (isMoneySupplyEnabled()) {
      this.settleMoneySupplyMonthly();
      return;
    }
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

  /**
   * Money-supply month (§4.1–§4.3, §11.3): coin wears away, each State's mint coins the bullion
   * brought to it, and the price level moves toward what the money stock against 12 months of
   * demand now supports.
   */
  private settleMoneySupplyMonthly(): void {
    // Separate steps so the money-flow recorder shows wear and issue apart (§7.1).
    const wear = measureTickStep("money:coinWear", () => this.wearCoin());
    measureTickStep("money:mint", () => this.mintMoneySupply(wear));
  }

  private mintMoneySupply(wear: ReadonlyMap<number, number>): void {
    const goodsByName = new Map(getGoods().map(good => [good.name.toLowerCase(), good]));
    const { states, burgs } = getWorldContext().pack;
    const stocks = getStateMoneyStocks();
    const ledgerByState = new Map(getMintLedgers().map(ledger => [ledger.stateId, ledger]));
    // A State founded since the ledgers were built gets one now.
    if ([...stocks.keys()].some(stateId => !ledgerByState.has(stateId))) {
      this.generate();
      for (const ledger of getMintLedgers()) ledgerByState.set(ledger.stateId, ledger);
    }

    for (const ledger of ledgerByState.values()) {
      const stock = stocks.get(ledger.stateId);
      ledger.lastMintedValue = 0;
      ledger.lastSeigniorage = 0;
      ledger.lastWear = rn(wear.get(ledger.stateId) ?? 0, 2);
      const state = states[ledger.stateId];
      if (!stock || !state || state.removed) continue;
      ledger.mintMarketId = this.getMintMarketId(ledger.stateId);
      const rawDemand = getMoneySupplyDemand(stock, this.getMarketStockValue(ledger.stateId));
      // A save switched to the model keeps its ledgers, so the start calibration begins here.
      if (ledger.demandScale === undefined) ledger.calibrationMonthsLeft = START_CALIBRATION_MONTHS;
      if (ledger.calibrationMonthsLeft) {
        ledger.demandScale = calibrateDemandScale(stock, rawDemand);
        ledger.calibrationMonthsLeft -= 1;
      }
      ledger.demandScale ??= calibrateDemandScale(stock, rawDemand);
      ledger.currencyDemand = rn(rawDemand * ledger.demandScale, 2);
      let money = stock.money;

      // Free coinage (§11.3): the mint coins whatever bullion is brought, at the metal's coin value,
      // whether or not coin is short; too much coin shows in the price level. The realm's changers
      // bring it from every market, as the regal purchase right (Kutná Hora's Urbura) required.
      // Where bullion sells above its coin value to craftsmen and exporters, none reaches the mint:
      // the bullion famine.
      for (const market of getMarkets()) {
        if (!market || burgs[market.centerBurgId]?.state !== ledger.stateId) continue;
        let minted = 0;
        for (const [metal] of METAL_COIN_VALUES) {
          const good = goodsByName.get(metal);
          const price = good?.value ?? 0;
          const marketPrice = good ? (market.goods[good.i]?.price ?? 0) : 0;
          if (!good || !(price > 0) || marketPrice > price) continue;
          const suppliedUnits = Markets.consumeForMint(market.i, good.i, Number.POSITIVE_INFINITY);
          if (suppliedUnits > 0) minted = rn(minted + suppliedUnits * price, 2);
        }
        if (!(minted > 0)) continue;
        // The sellers of the bullion are paid in new coin; the mint's fee goes to the treasury.
        const seigniorage = rn(minted * SEIGNIORAGE_RATE, 2);
        state.treasury = rn((state.treasury || 0) + seigniorage, 2);
        const treasury = market.marketTreasury ?? { balance: 0, ruralGrainPayable: 0 };
        treasury.balance = rn(treasury.balance + minted - seigniorage, 2);
        market.marketTreasury = treasury;
        ledger.lastMintedValue = rn(ledger.lastMintedValue + minted, 2);
        ledger.totalMintedValue = rn(ledger.totalMintedValue + minted, 2);
        ledger.lastSeigniorage = rn(ledger.lastSeigniorage + seigniorage, 2);
        money += minted;
      }

      ledger.circulation = rn(money, 2);
      ledger.priceLevel = rn(stepPriceLevel(ledger.priceLevel, getCurrencySufficiency(ledger)), 4);
    }
  }

  /**
   * Coin in everyday use — market tills and household purses — loses a little each month to wear
   * (§4.2). Returns the coin lost per State (by the market's centre town and the town's State).
   */
  private wearCoin(): Map<number, number> {
    const lost = new Map<number, number>();
    const { pack } = getWorldContext();
    const share = 1 - COIN_WEAR_MONTHLY_RETENTION;
    const record = (stateId: number | undefined, amount: number) => {
      if (stateId && amount > 0) lost.set(stateId, (lost.get(stateId) ?? 0) + amount);
    };
    for (const market of getMarkets()) {
      if (!market) continue;
      const stateId = pack.burgs[market.centerBurgId]?.state;
      const treasury = market.marketTreasury;
      if (treasury && treasury.balance > 0) {
        const amount = rn(treasury.balance * share, 2);
        treasury.balance = rn(treasury.balance - amount, 2);
        record(stateId, amount);
      }
      const ledger = market.foodLedger;
      if (ledger?.ruralHouseholdWealth && ledger.ruralHouseholdWealth > 0) {
        const amount = rn(ledger.ruralHouseholdWealth * share, 2);
        ledger.ruralHouseholdWealth = rn(ledger.ruralHouseholdWealth - amount, 2);
        record(stateId, amount);
      }
    }
    for (const ledger of getBurgMarketLedgers()) {
      if (!(ledger.householdWealth && ledger.householdWealth > 0)) continue;
      const amount = rn(ledger.householdWealth * share, 2);
      ledger.householdWealth = rn(ledger.householdWealth - amount, 2);
      record(pack.burgs[ledger.burgId]?.state, amount);
    }
    return lost;
  }

  private getMintMarketId(stateId: number): number | null {
    const burgs = getWorldContext().pack.burgs;
    const candidates = getMarkets()
      .filter(market => burgs[market.centerBurgId]?.state === stateId)
      .sort((a, b) => (burgs[b.centerBurgId]?.population ?? 0) - (burgs[a.centerBurgId]?.population ?? 0));
    return candidates[0]?.i ?? null;
  }

  private getMarketStockValue(stateId: number): number {
    const burgs = getWorldContext().pack.burgs;
    return getMarkets()
      .filter((market: Market) => burgs[market.centerBurgId]?.state === stateId)
      .reduce(
        (total, market) =>
          total + Object.values(market.goods).reduce((value, entry) => value + entry.stock * entry.price, 0),
        0
      );
  }

  private getCurrencyDemand(stateId: number): number {
    const state = getWorldContext().pack.states[stateId];
    if (!state) return 0;
    const population = (state.rural || 0) + (state.urban || 0);
    const marketTradeValue = this.getMarketStockValue(stateId);
    return rn(
      Math.max(
        1,
        nominal(population * 0.06 + (state.urban || 0) * 0.04) + marketTradeValue * MARKET_STOCK_CURRENCY_SHARE
      ),
      2
    );
  }
}

export const Minting = new MintingModule();
