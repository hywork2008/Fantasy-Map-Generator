import { pow } from "./deterministicMath";
import { worldSettings } from "./worldSettings";

/**
 * Market founding and dissolution (docs/plan/market-founding-viability.md §3.1–3.2). Saved with the
 * world; the economy reads it, the Simulation settings tab edits it.
 */
export const MARKET_SETTINGS_KEY = "fmg-market-settings";

/**
 * Cargo between markets when one is dissolved: `windDown` books no new trade with it and dissolves
 * it once that cargo has arrived; `handOver` dissolves it at once and hands the cargo to the
 * absorbing market. Its own towns' deliveries are handed over in both.
 */
export const MARKET_DISSOLVE_CARGO_MODES = ["windDown", "handOver"] as const;
export type MarketDissolveCargoMode = (typeof MARKET_DISSOLVE_CARGO_MODES)[number];

/**
 * Spare hay at the cut (docs/analytics/hay-surplus-20261031.md): `marketShortfall` has the market buy
 * it up to its farms' shortfall against their winter reserve plans; `farmsFirst` first moves it from
 * farms with spare hay to short farms of the same market, and the market buys for what is still short.
 */
export const HAY_TRADE_MODES = ["marketShortfall", "farmsFirst"] as const;
export type HayTradeMode = (typeof HAY_TRADE_MODES)[number];

/**
 * The merchants' share of a market's surplus payout (docs/analytics/hay-trade-modes-20261101.md §12):
 * `houseCapital` puts it into their market's trading house as each merchant's stake, as far as the
 * house wants capital, and pays what it does not take as the market's local wages; `wealth` adds it
 * to the merchants' own wealth.
 */
export const MERCHANT_PROFIT_USES = ["houseCapital", "wealth"] as const;
export type MerchantProfitUse = (typeof MERCHANT_PROFIT_USES)[number];

/**
 * How a market pays for the hay it buys at the cut (docs/analytics/hay-trade-modes-20261101.md §13):
 * `onCredit` owes it to the farms and repays them as the Fodder sells, as it does for grain; `cash`
 * pays at the cut from its cash, which then sits in the market until the next cut.
 */
export const HAY_PAYMENT_MODES = ["onCredit", "cash"] as const;
export type HayPaymentMode = (typeof HAY_PAYMENT_MODES)[number];

/**
 * How a market takes the goods its towns make (docs/plan/market-goods-settlement.md §2.2):
 * `consignment` buys what its cash allows and holds the rest for the town, paying for it once it has
 * sold; `cash` takes only what its cash buys, and the rest of the town's output is lost.
 */
export const CRAFT_SALE_PAYMENT_MODES = ["consignment", "cash"] as const;
export type CraftSalePaymentMode = (typeof CRAFT_SALE_PAYMENT_MODES)[number];

/**
 * Whether households pay the market for the drinks and foods they take from its stock
 * (docs/plan/market-goods-settlement.md §2.1): `free` takes them without payment, and the towns'
 * consigned goods so taken are not paid for; `pay` debits the town purses above their buffer and a
 * month's town spending of the farm purse at the market price, and they take only what they paid
 * for. With today's household incomes `pay` leaves most of the ale undrunk
 * (docs/analytics/market-goods-settlement-20261106.md §3).
 */
export const HOUSEHOLD_GOODS_PAYMENT_MODES = ["free", "pay"] as const;
export type HouseholdGoodsPaymentMode = (typeof HOUSEHOLD_GOODS_PAYMENT_MODES)[number];

/**
 * When a market repays the farms the grain it bought on credit (docs/plan/grain-quarter-day-payment.md):
 * `monthly` repays it first from every month's retail and cash; `quarterDays` repays it only in the
 * months of the English quarter days (Lady Day, Midsummer, Michaelmas, Christmas), so the cash in
 * between buys the towns' goods.
 */
/**
 * How much farm families spend each month in their market's towns: `need` from what they need at the
 * local wage level and how their purse stands to a few months of it; `purseShare` a fixed share of
 * the purse (docs/plan/rural-town-spending.md).
 */
export const RURAL_TOWN_SPENDING_MODES = ["need", "purseShare"] as const;
export type RuralTownSpendingMode = (typeof RURAL_TOWN_SPENDING_MODES)[number];

/**
 * Who buys footwear: `everyone` the towns and the countryside at `footwearPairsPerPerson`;
 * `townsOnly` the towns at a quarter pair a year, as before (docs/plan/leather-uses.md §4.1).
 */
export const FOOTWEAR_DEMAND_MODES = ["everyone", "townsOnly"] as const;
export type FootwearDemandMode = (typeof FOOTWEAR_DEMAND_MODES)[number];

/**
 * Work in a lot of Boots: `perDay` about a pair a shoemaker a day; `legacy` a pair a month, as
 * before (docs/plan/footwear-capacity.md §5.1).
 */
export const BOOTS_LABOR_MODES = ["perDay", "legacy"] as const;
export type BootsLaborMode = (typeof BOOTS_LABOR_MODES)[number];

export const GRAIN_REPAYMENT_MODES = ["quarterDays", "monthly"] as const;
export type GrainRepaymentMode = (typeof GRAIN_REPAYMENT_MODES)[number];

/** Calendar months of the English quarter days: Lady Day (25 Mar), Midsummer, Michaelmas, Christmas. */
export const QUARTER_DAY_MONTHS: readonly number[] = [3, 6, 9, 12];

export type MarketSettings = {
  /** A town promoted during the run opens a market only this many generation spacings from every market centre. */
  foundingSpacingFactor: number;
  /** A market dissolves when its rural purse per head stays below this share of the median market's. */
  dissolveWealthShare: number;
  /** ...for this many consecutive months. */
  dissolveMonths: number;
  dissolveCargo: MarketDissolveCargoMode;
  hayTrade: HayTradeMode;
  hayPayment: HayPaymentMode;
  craftSalePayment: CraftSalePaymentMode;
  householdGoodsPayment: HouseholdGoodsPaymentMode;
  grainRepayment: GrainRepaymentMode;
  ruralTownSpending: RuralTownSpendingMode;
  /** Months of their monthly need farm families keep in their purse (one quarter-day term). */
  ruralPurseMonths: number;
  /** How their spending follows the purse above that reserve: 1 spends the purse over `ruralPurseMonths`. */
  ruralSpendElasticityAbove: number;
  /** ...and below it: under 1, they cut back less than the purse falls and it never pins at zero. */
  ruralSpendElasticityBelow: number;
  /** Multiplier on the per-head need fixed at a market's first month from the `purseShare` amount. */
  ruralTownServices: number;
  footwearDemand: FootwearDemandMode;
  /** Pairs of shoes a person wears out a year. */
  footwearPairsPerPerson: number;
  /** Leather in the leather goods other than shoes, as a share of the shoes' leather; 0 makes none. */
  leatherGoodsShare: number;
  /** Share of a market's hides that spoil each month of June to August, when tanners work the fields. */
  summerHideLoss: number;
  bootsLabor: BootsLaborMode;
  /** Village shoemakers for each 1,000 farm people, counted in their market's towns; used with `everyone`. */
  ruralShoemakersPerThousand: number;
  /**
   * Weight of a rural person against a town person in the wages a market pays from its surplus:
   * carters, threshers and hay hands in its countryside as well as dealers and porters in its towns.
   */
  surplusRuralWeight: number;
  /** Cash a market keeps before paying out its surplus, per member-town population point, as times the town working cash. */
  surplusReserveFactor: number;
  /**
   * Months ahead of its harvest buying a market keeps in cash before paying out its surplus: the
   * farmgate payments it made in those calendar months a year ago (docs/plan/harvest-cash-reserve.md).
   */
  harvestReserveMonths: number;
  /** Share of that payout the market's manager and rival merchants take as profit. */
  merchantProfitShare: number;
  merchantProfitUse: MerchantProfitUse;
  /** Years of living costs a market merchant keeps before spending the rest of its wealth. */
  merchantReserveYears: number;
};

export const DEFAULT_MARKET_SETTINGS: Readonly<MarketSettings> = {
  foundingSpacingFactor: 1,
  dissolveWealthShare: 0.2,
  dissolveMonths: 12,
  dissolveCargo: "windDown",
  hayTrade: "marketShortfall",
  hayPayment: "onCredit",
  craftSalePayment: "consignment",
  householdGoodsPayment: "free",
  grainRepayment: "quarterDays",
  ruralTownSpending: "need",
  ruralPurseMonths: 3,
  ruralSpendElasticityAbove: 1,
  ruralSpendElasticityBelow: 0.5,
  ruralTownServices: 1,
  footwearDemand: "everyone",
  footwearPairsPerPerson: 1,
  leatherGoodsShare: 0.5,
  summerHideLoss: 0.1,
  bootsLabor: "perDay",
  ruralShoemakersPerThousand: 2,
  surplusRuralWeight: 1,
  surplusReserveFactor: 0.25,
  harvestReserveMonths: 4,
  merchantProfitShare: 1 / 3,
  merchantProfitUse: "houseCapital",
  merchantReserveYears: 5
};

export const MARKET_SETTING_LIMITS = {
  foundingSpacingFactor: { min: 0, max: 3, step: 0.05 },
  dissolveWealthShare: { min: 0, max: 1, step: 0.01 },
  dissolveMonths: { min: 1, max: 60, step: 1 },
  surplusRuralWeight: { min: 0, max: 1, step: 0.05 },
  surplusReserveFactor: { min: 0, max: 2, step: 0.05 },
  harvestReserveMonths: { min: 0, max: 12, step: 1 },
  merchantProfitShare: { min: 0, max: 1, step: 0.01 },
  merchantReserveYears: { min: 0, max: 10, step: 0.5 },
  ruralPurseMonths: { min: 0.5, max: 24, step: 0.5 },
  ruralSpendElasticityAbove: { min: 0, max: 2, step: 0.05 },
  ruralSpendElasticityBelow: { min: 0, max: 2, step: 0.05 },
  ruralTownServices: { min: 0, max: 5, step: 0.05 },
  footwearPairsPerPerson: { min: 0, max: 4, step: 0.25 },
  leatherGoodsShare: { min: 0, max: 2, step: 0.05 },
  summerHideLoss: { min: 0, max: 0.5, step: 0.01 },
  ruralShoemakersPerThousand: { min: 0, max: 10, step: 0.5 }
} as const;

type NumericMarketSetting = keyof typeof MARKET_SETTING_LIMITS;

const cargoMode = (value: unknown): MarketDissolveCargoMode =>
  MARKET_DISSOLVE_CARGO_MODES.includes(value as MarketDissolveCargoMode)
    ? (value as MarketDissolveCargoMode)
    : DEFAULT_MARKET_SETTINGS.dissolveCargo;

const hayTradeMode = (value: unknown): HayTradeMode =>
  HAY_TRADE_MODES.includes(value as HayTradeMode) ? (value as HayTradeMode) : DEFAULT_MARKET_SETTINGS.hayTrade;

const profitUse = (value: unknown): MerchantProfitUse =>
  MERCHANT_PROFIT_USES.includes(value as MerchantProfitUse)
    ? (value as MerchantProfitUse)
    : DEFAULT_MARKET_SETTINGS.merchantProfitUse;

const hayPaymentMode = (value: unknown): HayPaymentMode =>
  HAY_PAYMENT_MODES.includes(value as HayPaymentMode) ? (value as HayPaymentMode) : DEFAULT_MARKET_SETTINGS.hayPayment;

const craftSalePaymentMode = (value: unknown): CraftSalePaymentMode =>
  CRAFT_SALE_PAYMENT_MODES.includes(value as CraftSalePaymentMode)
    ? (value as CraftSalePaymentMode)
    : DEFAULT_MARKET_SETTINGS.craftSalePayment;

const householdGoodsPaymentMode = (value: unknown): HouseholdGoodsPaymentMode =>
  HOUSEHOLD_GOODS_PAYMENT_MODES.includes(value as HouseholdGoodsPaymentMode)
    ? (value as HouseholdGoodsPaymentMode)
    : DEFAULT_MARKET_SETTINGS.householdGoodsPayment;

const grainRepaymentMode = (value: unknown): GrainRepaymentMode =>
  GRAIN_REPAYMENT_MODES.includes(value as GrainRepaymentMode)
    ? (value as GrainRepaymentMode)
    : DEFAULT_MARKET_SETTINGS.grainRepayment;

const ruralTownSpendingMode = (value: unknown): RuralTownSpendingMode =>
  RURAL_TOWN_SPENDING_MODES.includes(value as RuralTownSpendingMode)
    ? (value as RuralTownSpendingMode)
    : DEFAULT_MARKET_SETTINGS.ruralTownSpending;

const footwearDemandMode = (value: unknown): FootwearDemandMode =>
  FOOTWEAR_DEMAND_MODES.includes(value as FootwearDemandMode)
    ? (value as FootwearDemandMode)
    : DEFAULT_MARKET_SETTINGS.footwearDemand;

const bootsLaborMode = (value: unknown): BootsLaborMode =>
  BOOTS_LABOR_MODES.includes(value as BootsLaborMode) ? (value as BootsLaborMode) : DEFAULT_MARKET_SETTINGS.bootsLabor;

const clamp = (key: NumericMarketSetting, value: unknown): number => {
  const { min, max, step } = MARKET_SETTING_LIMITS[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_MARKET_SETTINGS[key];
  const clamped = Math.max(min, Math.min(max, value));
  return step === 1 ? Math.round(clamped) : clamped;
};

export function getMarketSettings(): MarketSettings {
  let parsed: Partial<MarketSettings> = {};
  try {
    const stored = worldSettings.getItem(MARKET_SETTINGS_KEY);
    if (stored) parsed = JSON.parse(stored) as Partial<MarketSettings>;
  } catch {
    // Blocked storage or a damaged value: the code defaults apply.
  }
  return {
    foundingSpacingFactor: clamp("foundingSpacingFactor", parsed.foundingSpacingFactor),
    dissolveWealthShare: clamp("dissolveWealthShare", parsed.dissolveWealthShare),
    dissolveMonths: clamp("dissolveMonths", parsed.dissolveMonths),
    dissolveCargo: cargoMode(parsed.dissolveCargo),
    hayTrade: hayTradeMode(parsed.hayTrade),
    hayPayment: hayPaymentMode(parsed.hayPayment),
    craftSalePayment: craftSalePaymentMode(parsed.craftSalePayment),
    householdGoodsPayment: householdGoodsPaymentMode(parsed.householdGoodsPayment),
    grainRepayment: grainRepaymentMode(parsed.grainRepayment),
    ruralTownSpending: ruralTownSpendingMode(parsed.ruralTownSpending),
    ruralPurseMonths: clamp("ruralPurseMonths", parsed.ruralPurseMonths),
    ruralSpendElasticityAbove: clamp("ruralSpendElasticityAbove", parsed.ruralSpendElasticityAbove),
    ruralSpendElasticityBelow: clamp("ruralSpendElasticityBelow", parsed.ruralSpendElasticityBelow),
    ruralTownServices: clamp("ruralTownServices", parsed.ruralTownServices),
    footwearDemand: footwearDemandMode(parsed.footwearDemand),
    footwearPairsPerPerson: clamp("footwearPairsPerPerson", parsed.footwearPairsPerPerson),
    leatherGoodsShare: clamp("leatherGoodsShare", parsed.leatherGoodsShare),
    summerHideLoss: clamp("summerHideLoss", parsed.summerHideLoss),
    bootsLabor: bootsLaborMode(parsed.bootsLabor),
    ruralShoemakersPerThousand: clamp("ruralShoemakersPerThousand", parsed.ruralShoemakersPerThousand),
    surplusRuralWeight: clamp("surplusRuralWeight", parsed.surplusRuralWeight),
    surplusReserveFactor: clamp("surplusReserveFactor", parsed.surplusReserveFactor),
    harvestReserveMonths: clamp("harvestReserveMonths", parsed.harvestReserveMonths),
    merchantProfitShare: clamp("merchantProfitShare", parsed.merchantProfitShare),
    merchantProfitUse: profitUse(parsed.merchantProfitUse),
    merchantReserveYears: clamp("merchantReserveYears", parsed.merchantReserveYears)
  };
}

export function setMarketSettings(patch: Partial<MarketSettings>): MarketSettings {
  const next = { ...getMarketSettings(), ...patch };
  const settings: MarketSettings = {
    foundingSpacingFactor: clamp("foundingSpacingFactor", next.foundingSpacingFactor),
    dissolveWealthShare: clamp("dissolveWealthShare", next.dissolveWealthShare),
    dissolveMonths: clamp("dissolveMonths", next.dissolveMonths),
    dissolveCargo: cargoMode(next.dissolveCargo),
    hayTrade: hayTradeMode(next.hayTrade),
    hayPayment: hayPaymentMode(next.hayPayment),
    craftSalePayment: craftSalePaymentMode(next.craftSalePayment),
    householdGoodsPayment: householdGoodsPaymentMode(next.householdGoodsPayment),
    grainRepayment: grainRepaymentMode(next.grainRepayment),
    ruralTownSpending: ruralTownSpendingMode(next.ruralTownSpending),
    ruralPurseMonths: clamp("ruralPurseMonths", next.ruralPurseMonths),
    ruralSpendElasticityAbove: clamp("ruralSpendElasticityAbove", next.ruralSpendElasticityAbove),
    ruralSpendElasticityBelow: clamp("ruralSpendElasticityBelow", next.ruralSpendElasticityBelow),
    ruralTownServices: clamp("ruralTownServices", next.ruralTownServices),
    footwearDemand: footwearDemandMode(next.footwearDemand),
    footwearPairsPerPerson: clamp("footwearPairsPerPerson", next.footwearPairsPerPerson),
    leatherGoodsShare: clamp("leatherGoodsShare", next.leatherGoodsShare),
    summerHideLoss: clamp("summerHideLoss", next.summerHideLoss),
    bootsLabor: bootsLaborMode(next.bootsLabor),
    ruralShoemakersPerThousand: clamp("ruralShoemakersPerThousand", next.ruralShoemakersPerThousand),
    surplusRuralWeight: clamp("surplusRuralWeight", next.surplusRuralWeight),
    surplusReserveFactor: clamp("surplusReserveFactor", next.surplusReserveFactor),
    harvestReserveMonths: clamp("harvestReserveMonths", next.harvestReserveMonths),
    merchantProfitShare: clamp("merchantProfitShare", next.merchantProfitShare),
    merchantProfitUse: profitUse(next.merchantProfitUse),
    merchantReserveYears: clamp("merchantReserveYears", next.merchantReserveYears)
  };
  worldSettings.setItem(MARKET_SETTINGS_KEY, JSON.stringify(settings));
  return settings;
}

/** Distance between market centres at map generation: it scales with map size over the burg count. */
export function getMarketGenerationSpacing(graphWidth: number, graphHeight: number, burgSlots: number): number {
  return ((graphWidth + graphHeight) * 2) / pow(Math.max(1, burgSlots), 0.6);
}

/** Whether a market repays the farms' grain credit in this calendar month. */
export function isGrainRepaymentMonth(calendarMonth: number): boolean {
  return getMarketSettings().grainRepayment === "monthly" || QUARTER_DAY_MONTHS.includes(calendarMonth);
}
