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
 * Base values of Boots, Leather Goods and Candles: `historical` against grain and the medieval
 * prices; `legacy` the authored values (docs/plan/household-goods-values.md §5).
 */
export const HOUSEHOLD_GOOD_VALUE_MODES = ["historical", "legacy"] as const;
export type HouseholdGoodValueMode = (typeof HOUSEHOLD_GOOD_VALUE_MODES)[number];

/** Hides and tallow off the map: `staple` the port markets sell their surplus; `off` none, as before. */
export const BYPRODUCT_EXPORT_MODES = ["staple", "off"] as const;
/** How buyers split a heat need between Wood and Peat (docs/plan/fuel-price-share.md). */
export const FUEL_CHOICE_MODES = ["priceShare", "cheapest"] as const;
export type FuelChoiceMode = (typeof FUEL_CHOICE_MODES)[number];
/** How far ahead the bogs cut Peat for the market (docs/plan/peat-cut-plan.md). */
export const PEAT_CUT_PLAN_MODES = ["yearlyAverage", "smoothedDraw"] as const;
export type PeatCutPlanMode = (typeof PEAT_CUT_PLAN_MODES)[number];
/** What guilds do with their treasury beyond their working capital (docs/plan/guild-spending.md). */
export const GUILD_SURPLUS_USE_MODES = ["spend", "keep"] as const;
export type GuildSurplusUseMode = (typeof GUILD_SURPLUS_USE_MODES)[number];
/** How much cheese a dairy cell makes for its market (docs/plan/dairy-supply-use.md §3.1). */
export const CELL_CHEESE_SALE_MODES = ["demandGap", "allMilk", "fixedShare"] as const;
export type CellCheeseSaleMode = (typeof CELL_CHEESE_SALE_MODES)[number];
/** Whether farm families eat their own milk as cheese every month (docs/plan/dairy-supply-use.md §3.2). */
export const RURAL_DAIRY_USE_MODES = ["eat", "reserveOnly"] as const;
export type RuralDairyUseMode = (typeof RURAL_DAIRY_USE_MODES)[number];
/** Dairy demand from a slow tradition and the cheese price, or the old fixed targets (docs/plan/dairy-demand.md). */
export const DAIRY_DEMAND_MODES = ["tradition", "fixedTargets"] as const;
export type DairyDemandMode = (typeof DAIRY_DEMAND_MODES)[number];
/** The cheese price the elasticity is measured against: the cost of making it here, or the good's value. */
export const CHEESE_REFERENCE_PRICE_MODES = ["productionCost", "goodValue"] as const;
export type CheeseReferencePriceMode = (typeof CHEESE_REFERENCE_PRICE_MODES)[number];
export type ByproductExportMode = (typeof BYPRODUCT_EXPORT_MODES)[number];

/**
 * Who burns candles: `everyone` the towns and the countryside at `candleKgPerPerson`;
 * `townsOnly` the towns at 1 kg a person a year, as before (docs/plan/candle-demand.md §4.1).
 */
export const CANDLE_DEMAND_MODES = ["everyone", "townsOnly"] as const;
export type CandleDemandMode = (typeof CANDLE_DEMAND_MODES)[number];

/**
 * Work in a lot of Boots: `perDay` about a pair a shoemaker a day; `legacy` a pair a month, as
 * before (docs/plan/footwear-capacity.md §5.1).
 */
export const BOOTS_LABOR_MODES = ["perDay", "legacy"] as const;
export type BootsLaborMode = (typeof BOOTS_LABOR_MODES)[number];

/**
 * How the slaughter by-products and the goods the towns buy to a target are priced:
 * `stockAndDemand` from their stock against the towns' targets; `legacy` as before, when the
 * by-products were never priced and only purchases moved them (docs/plan/byproduct-prices.md §3).
 */
export const BYPRODUCT_PRICING_MODES = ["stockAndDemand", "legacy"] as const;
export type ByproductPricingMode = (typeof BYPRODUCT_PRICING_MODES)[number];
export const CHARACTER_RESERVE_MODES = ["byTier", "legacy"] as const;
export type CharacterReserveMode = (typeof CHARACTER_RESERVE_MODES)[number];
export const HEIRLESS_ESTATE_MODES = ["town", "keep"] as const;
export const HAY_CATCH_UP_MODES = ["aftermath", "legacy"] as const;
export type HayCatchUpMode = (typeof HAY_CATCH_UP_MODES)[number];
export const RURAL_WORK_YEAR_MODES = ["offField", "legacy"] as const;
export type RuralWorkYearMode = (typeof RURAL_WORK_YEAR_MODES)[number];
export const GRAIN_FEED_MODES = ["fodderGrains", "off"] as const;
export type GrainFeedMode = (typeof GRAIN_FEED_MODES)[number];
export const FEED_SHORTFALL_RESPONSE_MODES = ["random", "work", "herd", "legacy"] as const;
export type FeedShortfallResponseMode = (typeof FEED_SHORTFALL_RESPONSE_MODES)[number];
export const FEED_SHORTFALL_TIMING_MODES = ["sameSummer", "nextYear"] as const;
export type FeedShortfallTimingMode = (typeof FEED_SHORTFALL_TIMING_MODES)[number];
/** Lean stock carry their unmet feed as lost condition and give lighter carcasses until refed, or the legacy rule (docs/plan/livestock-lean-condition.md). */
export const LEAN_CONDITION_MODES = ["carcass", "off"] as const;
export type LeanConditionMode = (typeof LEAN_CONDITION_MODES)[number];
export const LEAN_CULL_MODES = ["unfed", "off"] as const;
export type LeanCullMode = (typeof LEAN_CULL_MODES)[number];
export const FODDER_VALUE_MODES = ["historical", "legacy"] as const;
export type FodderValueMode = (typeof FODDER_VALUE_MODES)[number];
export const FEED_CRISIS_BUDGET_MODES = ["worth", "nearCull", "off"] as const;
export type FeedCrisisBudgetMode = (typeof FEED_CRISIS_BUDGET_MODES)[number];
export const LEAN_DEATH_MODES = ["die", "off"] as const;
export type LeanDeathMode = (typeof LEAN_DEATH_MODES)[number];
export const RURAL_REST_DAYS_MODES = ["byPeriod", "custom"] as const;
export type RuralRestDaysMode = (typeof RURAL_REST_DAYS_MODES)[number];
export const URBAN_HARVEST_HELP_MODES = ["cornAndHay", "legacy"] as const;
export type UrbanHarvestHelpMode = (typeof URBAN_HARVEST_HELP_MODES)[number];
export const HAY_PLAN_HERD_MODES = ["wintered", "current"] as const;
export type HayPlanHerdMode = (typeof HAY_PLAN_HERD_MODES)[number];
export const HERD_OFFTAKE_SPREAD_MODES = ["toRenewal", "legacy"] as const;
export type HerdOfftakeSpreadMode = (typeof HERD_OFFTAKE_SPREAD_MODES)[number];
export const BYPRODUCT_FARMGATE_MODES = ["pay", "free"] as const;
export type ByproductFarmgateMode = (typeof BYPRODUCT_FARMGATE_MODES)[number];
export type HeirlessEstateMode = (typeof HEIRLESS_ESTATE_MODES)[number];
export const STATE_BUDGET_INCOME_MODES = ["allRevenue", "pollTax"] as const;
export type StateBudgetIncomeMode = (typeof STATE_BUDGET_INCOME_MODES)[number];
export const GUILD_MASTER_SEAT_MODES = ["byWorkshop", "legacy"] as const;
export type GuildMasterSeatMode = (typeof GUILD_MASTER_SEAT_MODES)[number];
export const GUILD_MASTER_INCOME_MODES = ["workshop", "stipend"] as const;
export type GuildMasterIncomeMode = (typeof GUILD_MASTER_INCOME_MODES)[number];
export const WAX_SURPLUS_MODES = ["tithe", "keep"] as const;
export type WaxSurplusMode = (typeof WAX_SURPLUS_MODES)[number];

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
  /** The market pays the farm families for the hides, tallow and rennet of their slaughtered stock, or takes them free (docs/plan/byproduct-farmgate.md). */
  byproductFarmgate: ByproductFarmgateMode;
  /** A managed herd sells its excess evenly over the months left before the January renewal, or a twelfth of what is left each month (docs/plan/herd-offtake-spread.md). */
  herdOfftakeSpread: HerdOfftakeSpreadMode;
  /** The herd a cell cuts hay for: the one it will winter (each species' larger of present and supported heads), or the present one (docs/plan/hay-plan-herd.md). */
  hayPlanHerd: HayPlanHerdMode;
  /** Town adults help with the corn and hay harvest up to a share, and their workshops lose those days, or the period's small share helps with corn only (docs/plan/urban-harvest-help.md). */
  urbanHarvestHelp: UrbanHarvestHelpMode;
  /** Hay left uncut for want of hands in its month is cut from the regrowth in later months (docs/plan/hay-catch-up.md). */
  hayCatchUp: HayCatchUpMode;
  hayCatchUpMonths: number;
  /** Rural adults also work the days of the year outside the 140 field days, less housework, for herds, hay and household cloth (docs/plan/rural-work-year.md). */
  ruralWorkYear: RuralWorkYearMode;
  ruralWorkDaysPerYear: number;
  ruralChoreDaysPerAdult: number;
  /** Sundays and holy days kept from servile work (hay, cloth): by the historical period, or a custom count. */
  ruralRestDays: RuralRestDaysMode;
  /** Feed short after pasture, hay and bought hay is made up with oats, barley and pulses from the market granary's spare grain (docs/plan/livestock-feed-shortfall.md). */
  grainFeed: GrainFeedMode;
  /** A cell short of feed for a year makes hay on rest days next year ("work") or winters fewer animals ("herd"), drawn at random or fixed (docs/plan/livestock-feed-shortfall.md §7). */
  feedShortfallResponse: FeedShortfallResponseMode;
  feedShortfallWorkShare: number;
  /** A cell answering with work mows on rest days from the summer after the short spring, or only from next year's allocation. */
  feedShortfallTiming: FeedShortfallTimingMode;
  leanCondition: LeanConditionMode;
  /** Months of feed need a herd's body reserve holds before it is wholly spent. */
  leanReserveMonths: number;
  /** Carcass weight lost when the reserve is wholly spent. */
  leanMaxCarcassLoss: number;
  /** Most extra grass, as a share of a month's need, lean stock eat in a month to recover. */
  leanRefeedShare: number;
  /** Lean keepers sell the mouths they could not feed, or keep them (docs/plan/livestock-lean-condition.md §7). */
  leanCull: LeanCullMode;
  /** Share of the body reserve spent before keepers sell unfed mouths. */
  leanCullThreshold: number;
  /** Stock short beyond the body reserve die, or the deficit stops at the reserve. */
  leanDeaths: LeanDeathMode;
  /** Stock about to be sold unfed are fed beyond the month's feed purse, or not (docs/plan/livestock-feed-shortfall.md §10). */
  feedCrisisBudget: FeedCrisisBudgetMode;
  /** Most of the farms' cash spent in a month on feed for stock about to be sold unfed. */
  feedCrisisCashShare: number;
  /** Milk lost when the body reserve is wholly spent (docs/plan/livestock-lean-condition.md §8). */
  leanMilkLoss: number;
  /** Fodder's base value per bale: oats at 4.4 times hay by weight, or the legacy 1 (docs/plan/fodder-value.md). */
  fodderValue: FodderValueMode;
  ruralRestDaysCustom: number;
  /** Most of a town's adults that go out in a harvest or hay month under cornAndHay. */
  urbanHarvestHelpShare: number;
  bootsLabor: BootsLaborMode;
  byproductPricing: ByproductPricingMode;
  /** Beeswax priced from its stock against the towns' candle targets, or by the legacy rule (docs/plan/wax-pricing.md). */
  beeswaxPricing: ByproductPricingMode;
  /** Wax beyond `waxKeepMonths` of a market's use paid to the church as wax rent, or kept (docs/plan/wax-tithe.md). */
  waxSurplus: WaxSurplusMode;
  /** Months of its own use a market keeps of beeswax before the surplus goes to the church. */
  waxKeepMonths: number;
  /** Share of the wax beyond `waxKeepMonths` paid to the church each month. */
  waxTitheRate: number;
  /** Village shoemakers for each 1,000 farm people, counted in their market's towns; used with `everyone`. */
  ruralShoemakersPerThousand: number;
  /**
   * Weight of a rural person against a town person in the wages a market pays from its surplus:
   * carters, threshers and hay hands in its countryside as well as dealers and porters in its towns.
   */
  householdGoodValues: HouseholdGoodValueMode;
  /** Kilograms of tallow the curriers stuff into a hide of shoe, leather-goods and harness leather; 0 none. */
  curryingTallowKgPerHide: number;
  byproductExport: ByproductExportMode;
  /** Months of its own use of hides and tallow a port market keeps before selling the rest off the map. */
  byproductExportReserveMonths: number;
  /** Share of that surplus a port market ships in a month. */
  byproductExportShare: number;
  /** `staple`: the port markets ship their Beeswax beyond their own use with the hides and tallow; `off`: they keep it. */
  beeswaxExport: ByproductExportMode;
  /** Months of its own use of a return good below which a port market takes it for its hides and tallow. */
  byproductReturnMonths: number;
  /** Months of its own use of hides and tallow a market keeps before the rest starts to spoil. */
  byproductKeepMonths: number;
  /** Share of the hides and tallow beyond that which spoil each month; 0 none, as before. */
  byproductExcessSpoil: number;
  /** `priceShare`: Wood and Peat each take a share of the heat by their price per heat; `cheapest`: all from the cheaper first. */
  fuelChoice: FuelChoiceMode;
  /** Exponent of the price per heat in `priceShare`: a fuel's share goes as price^-k. */
  fuelPriceElasticity: number;
  /** `yearlyAverage`: Peat cut to 6 months of the year's mean draw; `smoothedDraw`: of the last months' draw. */
  peatCutPlan: PeatCutPlanMode;
  /** `spend`: guilds spend part of their treasury above the working reserve on their town's households each month; `keep`: they keep it. */
  guildSurplusUse: GuildSurplusUseMode;
  cellCheeseSale: CellCheeseSaleMode;
  ruralDairyUse: RuralDairyUseMode;
  dairyDemand: DairyDemandMode;
  cheeseReferencePrice: CheeseReferencePriceMode;
  /** Share of a guild's treasury above its working reserve spent in its town a month, with `guildSurplusUse` spend. */
  guildSpendRate: number;
  /** Months of a Guild Master's stipend a guild keeps before it spends the rest. */
  guildReserveMonths: number;
  candleDemand: CandleDemandMode;
  /** Kilograms of candles a person burns a year, with `candleDemand` everyone. */
  candleKgPerPerson: number;
  /** Kilograms of wax candles a person's parish burns a year, with `candleDemand` everyone. */
  waxCandleKgPerPerson: number;
  /** Village people dipping candles for each 1,000 farm people, counted in their market's towns. */
  ruralChandlersPerThousand: number;
  /** Craft wage as a multiple of the worker's own staple food bill (docs/plan/per-capita-income-scale.md). */
  wageSubsistenceMultiple: number;
  /** Adult work days to make cheese of one 1,000 L milk lot in its cell (docs/plan/dairy-supply-use.md §7). */
  cheeseMakingDaysPerMilkLot: number;
  /** Most of its own milk, as cheese, a farm family eats with `ruralDairyUse` eat; the rest it sells. */
  ruralCheeseEatShare: number;
  /** Half-life of the dairy tradition, years. */
  dairyTraditionHalfLifeYears: number;
  /** Most animal protein (meat, cheese, milk) a person eats a day, g; dairy demand above it is dropped. */
  animalProteinCapGramsPerDay: number;
  /** Own-price elasticity of cheese demand. */
  cheesePriceElasticity: number;
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
  /** Reserve years by lifestyle tier, or five years for all but the merchants (docs/plan/character-reserve.md). */
  characterReserve: CharacterReserveMode;
  /** Years of living costs kept, with `characterReserve` byTier; below 0 counts as 0 until borrowing exists. */
  rulerReserveYears: number;
  officeReserveYears: number;
  commanderReserveYears: number;
  commonReserveYears: number;
  /** A dead character's unclaimed cash paid to their town's households, or kept (docs/plan/heirless-estates.md). */
  heirlessEstate: HeirlessEstateMode;
  /** Months an estate waits for a living child before it goes to the town. */
  estateClaimMonths: number;
  /** The revenue a state's court, officers and departments are budgeted from (docs/plan/state-budget-income.md). */
  stateBudgetIncome: StateBudgetIncomeMode;
  /** Guild masters in any craft whose workshops keep one, or smiths in every metallurgy town (docs/plan/guild-master-workshop.md). */
  guildMasterSeat: GuildMasterSeatMode;
  /** A guild master's income: a share of their workshops' margin, or the guild's fixed stipend. */
  guildMasterIncome: GuildMasterIncomeMode;
  /** Share of a domain's monthly craft margin at a Burg its guild master earns. */
  guildMasterWorkshopShare: number;
  /** Earnings, as a share of a master's living cost, under which a master gives up the office. */
  guildMasterRetireRatio: number;
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
  byproductFarmgate: "pay",
  herdOfftakeSpread: "toRenewal",
  hayPlanHerd: "wintered",
  urbanHarvestHelp: "cornAndHay",
  hayCatchUp: "aftermath",
  hayCatchUpMonths: 3,
  ruralWorkYear: "offField",
  ruralWorkDaysPerYear: 365,
  ruralChoreDaysPerAdult: 160,
  ruralRestDays: "byPeriod",
  grainFeed: "fodderGrains",
  feedShortfallResponse: "random",
  feedShortfallWorkShare: 0.5,
  feedShortfallTiming: "sameSummer",
  leanCondition: "carcass",
  leanReserveMonths: 2,
  leanMaxCarcassLoss: 0.25,
  leanRefeedShare: 0.3,
  leanCull: "unfed",
  leanCullThreshold: 0.25,
  leanDeaths: "die",
  feedCrisisBudget: "worth",
  leanMilkLoss: 0.5,
  feedCrisisCashShare: 0.15,
  fodderValue: "historical",
  ruralRestDaysCustom: 97,
  urbanHarvestHelpShare: 0.5,
  bootsLabor: "perDay",
  byproductPricing: "stockAndDemand",
  beeswaxPricing: "stockAndDemand",
  waxSurplus: "tithe",
  waxKeepMonths: 12,
  waxTitheRate: 0.1,
  ruralShoemakersPerThousand: 2,
  householdGoodValues: "historical",
  curryingTallowKgPerHide: 2,
  byproductExport: "staple",
  byproductExportReserveMonths: 6,
  byproductExportShare: 0.2,
  beeswaxExport: "staple",
  byproductReturnMonths: 3,
  byproductKeepMonths: 12,
  byproductExcessSpoil: 0.1,
  fuelChoice: "priceShare",
  fuelPriceElasticity: 4,
  peatCutPlan: "yearlyAverage",
  guildSurplusUse: "spend",
  cellCheeseSale: "demandGap",
  ruralDairyUse: "eat",
  dairyDemand: "tradition",
  cheeseReferencePrice: "productionCost",
  guildSpendRate: 0.08,
  guildReserveMonths: 1,
  candleDemand: "everyone",
  candleKgPerPerson: 1,
  waxCandleKgPerPerson: 0.05,
  ruralChandlersPerThousand: 0.5,
  wageSubsistenceMultiple: 1.5,
  cheeseMakingDaysPerMilkLot: 10,
  ruralCheeseEatShare: 0.5,
  dairyTraditionHalfLifeYears: 10,
  animalProteinCapGramsPerDay: 30,
  cheesePriceElasticity: -0.8,
  surplusRuralWeight: 1,
  surplusReserveFactor: 0.25,
  harvestReserveMonths: 4,
  merchantProfitShare: 1 / 3,
  merchantProfitUse: "houseCapital",
  merchantReserveYears: 0.25,
  characterReserve: "byTier",
  rulerReserveYears: 0,
  officeReserveYears: 0.5,
  commanderReserveYears: 0,
  commonReserveYears: 0.25,
  heirlessEstate: "town",
  estateClaimMonths: 12,
  stateBudgetIncome: "allRevenue",
  guildMasterSeat: "byWorkshop",
  guildMasterIncome: "workshop",
  guildMasterWorkshopShare: 0.3,
  guildMasterRetireRatio: 0.5
};

export const MARKET_SETTING_LIMITS = {
  foundingSpacingFactor: { min: 0, max: 3, step: 0.05 },
  dissolveWealthShare: { min: 0, max: 1, step: 0.01 },
  dissolveMonths: { min: 1, max: 60, step: 1 },
  surplusRuralWeight: { min: 0, max: 1, step: 0.05 },
  surplusReserveFactor: { min: 0, max: 2, step: 0.05 },
  harvestReserveMonths: { min: 0, max: 12, step: 1 },
  merchantProfitShare: { min: 0, max: 1, step: 0.01 },
  merchantReserveYears: { min: -5, max: 10, step: 0.25 },
  rulerReserveYears: { min: -5, max: 10, step: 0.25 },
  officeReserveYears: { min: -5, max: 10, step: 0.25 },
  commanderReserveYears: { min: -5, max: 10, step: 0.25 },
  commonReserveYears: { min: -5, max: 10, step: 0.25 },
  estateClaimMonths: { min: 0, max: 120, step: 1 },
  guildMasterWorkshopShare: { min: 0, max: 1, step: 0.05 },
  guildMasterRetireRatio: { min: 0, max: 1, step: 0.05 },
  ruralPurseMonths: { min: 0.5, max: 24, step: 0.5 },
  ruralSpendElasticityAbove: { min: 0, max: 2, step: 0.05 },
  ruralSpendElasticityBelow: { min: 0, max: 2, step: 0.05 },
  ruralTownServices: { min: 0, max: 5, step: 0.05 },
  footwearPairsPerPerson: { min: 0, max: 4, step: 0.25 },
  leatherGoodsShare: { min: 0, max: 2, step: 0.05 },
  summerHideLoss: { min: 0, max: 0.5, step: 0.01 },
  urbanHarvestHelpShare: { min: 0, max: 1, step: 0.05 },
  hayCatchUpMonths: { min: 1, max: 4, step: 1 },
  ruralWorkDaysPerYear: { min: 140, max: 365, step: 5 },
  ruralChoreDaysPerAdult: { min: 0, max: 225, step: 5 },
  ruralRestDaysCustom: { min: 0, max: 150, step: 1 },
  feedShortfallWorkShare: { min: 0, max: 1, step: 0.05 },
  leanReserveMonths: { min: 0.5, max: 4, step: 0.5 },
  leanMaxCarcassLoss: { min: 0, max: 0.5, step: 0.05 },
  leanRefeedShare: { min: 0, max: 1, step: 0.05 },
  leanCullThreshold: { min: 0, max: 1, step: 0.05 },
  feedCrisisCashShare: { min: 0, max: 1, step: 0.05 },
  leanMilkLoss: { min: 0, max: 1, step: 0.05 },
  ruralShoemakersPerThousand: { min: 0, max: 10, step: 0.5 },
  candleKgPerPerson: { min: 0, max: 4, step: 0.25 },
  waxCandleKgPerPerson: { min: 0, max: 0.5, step: 0.01 },
  waxKeepMonths: { min: 0, max: 60, step: 1 },
  waxTitheRate: { min: 0, max: 0.5, step: 0.01 },
  curryingTallowKgPerHide: { min: 0, max: 6, step: 0.25 },
  byproductExportReserveMonths: { min: 0, max: 36, step: 1 },
  byproductExportShare: { min: 0, max: 1, step: 0.05 },
  byproductReturnMonths: { min: 0, max: 12, step: 0.5 },
  byproductKeepMonths: { min: 0, max: 60, step: 1 },
  byproductExcessSpoil: { min: 0, max: 0.5, step: 0.01 },
  fuelPriceElasticity: { min: 1, max: 20, step: 1 },
  guildSpendRate: { min: 0, max: 0.5, step: 0.01 },
  guildReserveMonths: { min: 0, max: 24, step: 1 },
  ruralChandlersPerThousand: { min: 0, max: 5, step: 0.1 },
  wageSubsistenceMultiple: { min: 1.5, max: 16, step: 0.5 },
  cheeseMakingDaysPerMilkLot: { min: 1, max: 60, step: 1 },
  ruralCheeseEatShare: { min: 0, max: 1, step: 0.05 },
  dairyTraditionHalfLifeYears: { min: 1, max: 50, step: 1 },
  animalProteinCapGramsPerDay: { min: 5, max: 80, step: 1 },
  cheesePriceElasticity: { min: -2, max: 0, step: 0.1 }
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

const householdGoodValueMode = (value: unknown): HouseholdGoodValueMode =>
  HOUSEHOLD_GOOD_VALUE_MODES.includes(value as HouseholdGoodValueMode)
    ? (value as HouseholdGoodValueMode)
    : DEFAULT_MARKET_SETTINGS.householdGoodValues;

const byproductExportMode = (
  value: unknown,
  key: "byproductExport" | "beeswaxExport" = "byproductExport"
): ByproductExportMode =>
  BYPRODUCT_EXPORT_MODES.includes(value as ByproductExportMode)
    ? (value as ByproductExportMode)
    : DEFAULT_MARKET_SETTINGS[key];

const fuelChoiceMode = (value: unknown): FuelChoiceMode =>
  FUEL_CHOICE_MODES.includes(value as FuelChoiceMode) ? (value as FuelChoiceMode) : DEFAULT_MARKET_SETTINGS.fuelChoice;

const peatCutPlanMode = (value: unknown): PeatCutPlanMode =>
  PEAT_CUT_PLAN_MODES.includes(value as PeatCutPlanMode)
    ? (value as PeatCutPlanMode)
    : DEFAULT_MARKET_SETTINGS.peatCutPlan;

const cellCheeseSaleMode = (value: unknown): CellCheeseSaleMode =>
  CELL_CHEESE_SALE_MODES.includes(value as CellCheeseSaleMode)
    ? (value as CellCheeseSaleMode)
    : DEFAULT_MARKET_SETTINGS.cellCheeseSale;
const cheeseReferencePriceMode = (value: unknown): CheeseReferencePriceMode =>
  CHEESE_REFERENCE_PRICE_MODES.includes(value as CheeseReferencePriceMode)
    ? (value as CheeseReferencePriceMode)
    : DEFAULT_MARKET_SETTINGS.cheeseReferencePrice;
const dairyDemandMode = (value: unknown): DairyDemandMode =>
  DAIRY_DEMAND_MODES.includes(value as DairyDemandMode)
    ? (value as DairyDemandMode)
    : DEFAULT_MARKET_SETTINGS.dairyDemand;
const ruralDairyUseMode = (value: unknown): RuralDairyUseMode =>
  RURAL_DAIRY_USE_MODES.includes(value as RuralDairyUseMode)
    ? (value as RuralDairyUseMode)
    : DEFAULT_MARKET_SETTINGS.ruralDairyUse;
const guildSurplusUseMode = (value: unknown): GuildSurplusUseMode =>
  GUILD_SURPLUS_USE_MODES.includes(value as GuildSurplusUseMode)
    ? (value as GuildSurplusUseMode)
    : DEFAULT_MARKET_SETTINGS.guildSurplusUse;

const candleDemandMode = (value: unknown): CandleDemandMode =>
  CANDLE_DEMAND_MODES.includes(value as CandleDemandMode)
    ? (value as CandleDemandMode)
    : DEFAULT_MARKET_SETTINGS.candleDemand;

const bootsLaborMode = (value: unknown): BootsLaborMode =>
  BOOTS_LABOR_MODES.includes(value as BootsLaborMode) ? (value as BootsLaborMode) : DEFAULT_MARKET_SETTINGS.bootsLabor;

const byproductPricingMode = (
  value: unknown,
  key: "byproductPricing" | "beeswaxPricing" = "byproductPricing"
): ByproductPricingMode =>
  BYPRODUCT_PRICING_MODES.includes(value as ByproductPricingMode)
    ? (value as ByproductPricingMode)
    : DEFAULT_MARKET_SETTINGS[key];

const characterReserveMode = (value: unknown): CharacterReserveMode =>
  CHARACTER_RESERVE_MODES.includes(value as CharacterReserveMode)
    ? (value as CharacterReserveMode)
    : DEFAULT_MARKET_SETTINGS.characterReserve;

const hayCatchUpMode = (value: unknown): HayCatchUpMode =>
  HAY_CATCH_UP_MODES.includes(value as HayCatchUpMode) ? (value as HayCatchUpMode) : DEFAULT_MARKET_SETTINGS.hayCatchUp;
const ruralWorkYearMode = (value: unknown): RuralWorkYearMode =>
  RURAL_WORK_YEAR_MODES.includes(value as RuralWorkYearMode)
    ? (value as RuralWorkYearMode)
    : DEFAULT_MARKET_SETTINGS.ruralWorkYear;
const grainFeedMode = (value: unknown): GrainFeedMode =>
  GRAIN_FEED_MODES.includes(value as GrainFeedMode) ? (value as GrainFeedMode) : DEFAULT_MARKET_SETTINGS.grainFeed;
const feedShortfallResponseMode = (value: unknown): FeedShortfallResponseMode =>
  FEED_SHORTFALL_RESPONSE_MODES.includes(value as FeedShortfallResponseMode)
    ? (value as FeedShortfallResponseMode)
    : DEFAULT_MARKET_SETTINGS.feedShortfallResponse;
const feedShortfallTimingMode = (value: unknown): FeedShortfallTimingMode =>
  FEED_SHORTFALL_TIMING_MODES.includes(value as FeedShortfallTimingMode)
    ? (value as FeedShortfallTimingMode)
    : DEFAULT_MARKET_SETTINGS.feedShortfallTiming;
const leanConditionMode = (value: unknown): LeanConditionMode =>
  LEAN_CONDITION_MODES.includes(value as LeanConditionMode)
    ? (value as LeanConditionMode)
    : DEFAULT_MARKET_SETTINGS.leanCondition;
const leanCullMode = (value: unknown): LeanCullMode =>
  LEAN_CULL_MODES.includes(value as LeanCullMode) ? (value as LeanCullMode) : DEFAULT_MARKET_SETTINGS.leanCull;
const leanDeathMode = (value: unknown): LeanDeathMode =>
  LEAN_DEATH_MODES.includes(value as LeanDeathMode) ? (value as LeanDeathMode) : DEFAULT_MARKET_SETTINGS.leanDeaths;
const feedCrisisBudgetMode = (value: unknown): FeedCrisisBudgetMode =>
  FEED_CRISIS_BUDGET_MODES.includes(value as FeedCrisisBudgetMode)
    ? (value as FeedCrisisBudgetMode)
    : DEFAULT_MARKET_SETTINGS.feedCrisisBudget;
const fodderValueMode = (value: unknown): FodderValueMode =>
  FODDER_VALUE_MODES.includes(value as FodderValueMode)
    ? (value as FodderValueMode)
    : DEFAULT_MARKET_SETTINGS.fodderValue;
const ruralRestDaysMode = (value: unknown): RuralRestDaysMode =>
  RURAL_REST_DAYS_MODES.includes(value as RuralRestDaysMode)
    ? (value as RuralRestDaysMode)
    : DEFAULT_MARKET_SETTINGS.ruralRestDays;
const urbanHarvestHelpMode = (value: unknown): UrbanHarvestHelpMode =>
  URBAN_HARVEST_HELP_MODES.includes(value as UrbanHarvestHelpMode)
    ? (value as UrbanHarvestHelpMode)
    : DEFAULT_MARKET_SETTINGS.urbanHarvestHelp;

const hayPlanHerdMode = (value: unknown): HayPlanHerdMode =>
  HAY_PLAN_HERD_MODES.includes(value as HayPlanHerdMode)
    ? (value as HayPlanHerdMode)
    : DEFAULT_MARKET_SETTINGS.hayPlanHerd;

const herdOfftakeSpreadMode = (value: unknown): HerdOfftakeSpreadMode =>
  HERD_OFFTAKE_SPREAD_MODES.includes(value as HerdOfftakeSpreadMode)
    ? (value as HerdOfftakeSpreadMode)
    : DEFAULT_MARKET_SETTINGS.herdOfftakeSpread;

const byproductFarmgateMode = (value: unknown): ByproductFarmgateMode =>
  BYPRODUCT_FARMGATE_MODES.includes(value as ByproductFarmgateMode)
    ? (value as ByproductFarmgateMode)
    : DEFAULT_MARKET_SETTINGS.byproductFarmgate;

const heirlessEstateMode = (value: unknown): HeirlessEstateMode =>
  HEIRLESS_ESTATE_MODES.includes(value as HeirlessEstateMode)
    ? (value as HeirlessEstateMode)
    : DEFAULT_MARKET_SETTINGS.heirlessEstate;

const stateBudgetIncomeMode = (value: unknown): StateBudgetIncomeMode =>
  STATE_BUDGET_INCOME_MODES.includes(value as StateBudgetIncomeMode)
    ? (value as StateBudgetIncomeMode)
    : DEFAULT_MARKET_SETTINGS.stateBudgetIncome;

const guildMasterSeatMode = (value: unknown): GuildMasterSeatMode =>
  GUILD_MASTER_SEAT_MODES.includes(value as GuildMasterSeatMode)
    ? (value as GuildMasterSeatMode)
    : DEFAULT_MARKET_SETTINGS.guildMasterSeat;

const guildMasterIncomeMode = (value: unknown): GuildMasterIncomeMode =>
  GUILD_MASTER_INCOME_MODES.includes(value as GuildMasterIncomeMode)
    ? (value as GuildMasterIncomeMode)
    : DEFAULT_MARKET_SETTINGS.guildMasterIncome;

const waxSurplusMode = (value: unknown): WaxSurplusMode =>
  WAX_SURPLUS_MODES.includes(value as WaxSurplusMode) ? (value as WaxSurplusMode) : DEFAULT_MARKET_SETTINGS.waxSurplus;

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
    byproductFarmgate: byproductFarmgateMode(parsed.byproductFarmgate),
    herdOfftakeSpread: herdOfftakeSpreadMode(parsed.herdOfftakeSpread),
    hayPlanHerd: hayPlanHerdMode(parsed.hayPlanHerd),
    urbanHarvestHelp: urbanHarvestHelpMode(parsed.urbanHarvestHelp),
    hayCatchUp: hayCatchUpMode(parsed.hayCatchUp),
    hayCatchUpMonths: clamp("hayCatchUpMonths", parsed.hayCatchUpMonths),
    ruralWorkYear: ruralWorkYearMode(parsed.ruralWorkYear),
    ruralWorkDaysPerYear: clamp("ruralWorkDaysPerYear", parsed.ruralWorkDaysPerYear),
    ruralChoreDaysPerAdult: clamp("ruralChoreDaysPerAdult", parsed.ruralChoreDaysPerAdult),
    ruralRestDays: ruralRestDaysMode(parsed.ruralRestDays),
    grainFeed: grainFeedMode(parsed.grainFeed),
    feedShortfallResponse: feedShortfallResponseMode(parsed.feedShortfallResponse),
    feedShortfallWorkShare: clamp("feedShortfallWorkShare", parsed.feedShortfallWorkShare),
    feedShortfallTiming: feedShortfallTimingMode(parsed.feedShortfallTiming),
    leanCondition: leanConditionMode(parsed.leanCondition),
    leanReserveMonths: clamp("leanReserveMonths", parsed.leanReserveMonths),
    leanMaxCarcassLoss: clamp("leanMaxCarcassLoss", parsed.leanMaxCarcassLoss),
    leanRefeedShare: clamp("leanRefeedShare", parsed.leanRefeedShare),
    leanCull: leanCullMode(parsed.leanCull),
    leanCullThreshold: clamp("leanCullThreshold", parsed.leanCullThreshold),
    leanDeaths: leanDeathMode(parsed.leanDeaths),
    feedCrisisBudget: feedCrisisBudgetMode(parsed.feedCrisisBudget),
    feedCrisisCashShare: clamp("feedCrisisCashShare", parsed.feedCrisisCashShare),
    leanMilkLoss: clamp("leanMilkLoss", parsed.leanMilkLoss),
    fodderValue: fodderValueMode(parsed.fodderValue),
    ruralRestDaysCustom: clamp("ruralRestDaysCustom", parsed.ruralRestDaysCustom),
    urbanHarvestHelpShare: clamp("urbanHarvestHelpShare", parsed.urbanHarvestHelpShare),
    bootsLabor: bootsLaborMode(parsed.bootsLabor),
    byproductPricing: byproductPricingMode(parsed.byproductPricing),
    beeswaxPricing: byproductPricingMode(parsed.beeswaxPricing, "beeswaxPricing"),
    waxSurplus: waxSurplusMode(parsed.waxSurplus),
    waxKeepMonths: clamp("waxKeepMonths", parsed.waxKeepMonths),
    waxTitheRate: clamp("waxTitheRate", parsed.waxTitheRate),
    ruralShoemakersPerThousand: clamp("ruralShoemakersPerThousand", parsed.ruralShoemakersPerThousand),
    householdGoodValues: householdGoodValueMode(parsed.householdGoodValues),
    curryingTallowKgPerHide: clamp("curryingTallowKgPerHide", parsed.curryingTallowKgPerHide),
    byproductExport: byproductExportMode(parsed.byproductExport),
    beeswaxExport: byproductExportMode(parsed.beeswaxExport, "beeswaxExport"),
    byproductExportReserveMonths: clamp("byproductExportReserveMonths", parsed.byproductExportReserveMonths),
    byproductExportShare: clamp("byproductExportShare", parsed.byproductExportShare),
    byproductReturnMonths: clamp("byproductReturnMonths", parsed.byproductReturnMonths),
    byproductKeepMonths: clamp("byproductKeepMonths", parsed.byproductKeepMonths),
    byproductExcessSpoil: clamp("byproductExcessSpoil", parsed.byproductExcessSpoil),
    fuelChoice: fuelChoiceMode(parsed.fuelChoice),
    fuelPriceElasticity: clamp("fuelPriceElasticity", parsed.fuelPriceElasticity),
    peatCutPlan: peatCutPlanMode(parsed.peatCutPlan),
    guildSurplusUse: guildSurplusUseMode(parsed.guildSurplusUse),
    cellCheeseSale: cellCheeseSaleMode(parsed.cellCheeseSale),
    ruralDairyUse: ruralDairyUseMode(parsed.ruralDairyUse),
    dairyDemand: dairyDemandMode(parsed.dairyDemand),
    cheeseReferencePrice: cheeseReferencePriceMode(parsed.cheeseReferencePrice),
    guildSpendRate: clamp("guildSpendRate", parsed.guildSpendRate),
    guildReserveMonths: clamp("guildReserveMonths", parsed.guildReserveMonths),
    candleDemand: candleDemandMode(parsed.candleDemand),
    candleKgPerPerson: clamp("candleKgPerPerson", parsed.candleKgPerPerson),
    waxCandleKgPerPerson: clamp("waxCandleKgPerPerson", parsed.waxCandleKgPerPerson),
    ruralChandlersPerThousand: clamp("ruralChandlersPerThousand", parsed.ruralChandlersPerThousand),
    wageSubsistenceMultiple: clamp("wageSubsistenceMultiple", parsed.wageSubsistenceMultiple),
    cheeseMakingDaysPerMilkLot: clamp("cheeseMakingDaysPerMilkLot", parsed.cheeseMakingDaysPerMilkLot),
    ruralCheeseEatShare: clamp("ruralCheeseEatShare", parsed.ruralCheeseEatShare),
    dairyTraditionHalfLifeYears: clamp("dairyTraditionHalfLifeYears", parsed.dairyTraditionHalfLifeYears),
    animalProteinCapGramsPerDay: clamp("animalProteinCapGramsPerDay", parsed.animalProteinCapGramsPerDay),
    cheesePriceElasticity: clamp("cheesePriceElasticity", parsed.cheesePriceElasticity),
    surplusRuralWeight: clamp("surplusRuralWeight", parsed.surplusRuralWeight),
    surplusReserveFactor: clamp("surplusReserveFactor", parsed.surplusReserveFactor),
    harvestReserveMonths: clamp("harvestReserveMonths", parsed.harvestReserveMonths),
    merchantProfitShare: clamp("merchantProfitShare", parsed.merchantProfitShare),
    merchantProfitUse: profitUse(parsed.merchantProfitUse),
    merchantReserveYears: clamp("merchantReserveYears", parsed.merchantReserveYears),
    characterReserve: characterReserveMode(parsed.characterReserve),
    rulerReserveYears: clamp("rulerReserveYears", parsed.rulerReserveYears),
    officeReserveYears: clamp("officeReserveYears", parsed.officeReserveYears),
    commanderReserveYears: clamp("commanderReserveYears", parsed.commanderReserveYears),
    commonReserveYears: clamp("commonReserveYears", parsed.commonReserveYears),
    heirlessEstate: heirlessEstateMode(parsed.heirlessEstate),
    estateClaimMonths: clamp("estateClaimMonths", parsed.estateClaimMonths),
    stateBudgetIncome: stateBudgetIncomeMode(parsed.stateBudgetIncome),
    guildMasterSeat: guildMasterSeatMode(parsed.guildMasterSeat),
    guildMasterIncome: guildMasterIncomeMode(parsed.guildMasterIncome),
    guildMasterWorkshopShare: clamp("guildMasterWorkshopShare", parsed.guildMasterWorkshopShare),
    guildMasterRetireRatio: clamp("guildMasterRetireRatio", parsed.guildMasterRetireRatio)
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
    byproductFarmgate: byproductFarmgateMode(next.byproductFarmgate),
    herdOfftakeSpread: herdOfftakeSpreadMode(next.herdOfftakeSpread),
    hayPlanHerd: hayPlanHerdMode(next.hayPlanHerd),
    urbanHarvestHelp: urbanHarvestHelpMode(next.urbanHarvestHelp),
    hayCatchUp: hayCatchUpMode(next.hayCatchUp),
    hayCatchUpMonths: clamp("hayCatchUpMonths", next.hayCatchUpMonths),
    ruralWorkYear: ruralWorkYearMode(next.ruralWorkYear),
    ruralWorkDaysPerYear: clamp("ruralWorkDaysPerYear", next.ruralWorkDaysPerYear),
    ruralChoreDaysPerAdult: clamp("ruralChoreDaysPerAdult", next.ruralChoreDaysPerAdult),
    ruralRestDays: ruralRestDaysMode(next.ruralRestDays),
    grainFeed: grainFeedMode(next.grainFeed),
    feedShortfallResponse: feedShortfallResponseMode(next.feedShortfallResponse),
    feedShortfallWorkShare: clamp("feedShortfallWorkShare", next.feedShortfallWorkShare),
    feedShortfallTiming: feedShortfallTimingMode(next.feedShortfallTiming),
    leanCondition: leanConditionMode(next.leanCondition),
    leanReserveMonths: clamp("leanReserveMonths", next.leanReserveMonths),
    leanMaxCarcassLoss: clamp("leanMaxCarcassLoss", next.leanMaxCarcassLoss),
    leanRefeedShare: clamp("leanRefeedShare", next.leanRefeedShare),
    leanCull: leanCullMode(next.leanCull),
    leanCullThreshold: clamp("leanCullThreshold", next.leanCullThreshold),
    leanDeaths: leanDeathMode(next.leanDeaths),
    feedCrisisBudget: feedCrisisBudgetMode(next.feedCrisisBudget),
    feedCrisisCashShare: clamp("feedCrisisCashShare", next.feedCrisisCashShare),
    leanMilkLoss: clamp("leanMilkLoss", next.leanMilkLoss),
    fodderValue: fodderValueMode(next.fodderValue),
    ruralRestDaysCustom: clamp("ruralRestDaysCustom", next.ruralRestDaysCustom),
    urbanHarvestHelpShare: clamp("urbanHarvestHelpShare", next.urbanHarvestHelpShare),
    bootsLabor: bootsLaborMode(next.bootsLabor),
    byproductPricing: byproductPricingMode(next.byproductPricing),
    beeswaxPricing: byproductPricingMode(next.beeswaxPricing, "beeswaxPricing"),
    waxSurplus: waxSurplusMode(next.waxSurplus),
    waxKeepMonths: clamp("waxKeepMonths", next.waxKeepMonths),
    waxTitheRate: clamp("waxTitheRate", next.waxTitheRate),
    ruralShoemakersPerThousand: clamp("ruralShoemakersPerThousand", next.ruralShoemakersPerThousand),
    householdGoodValues: householdGoodValueMode(next.householdGoodValues),
    curryingTallowKgPerHide: clamp("curryingTallowKgPerHide", next.curryingTallowKgPerHide),
    byproductExport: byproductExportMode(next.byproductExport),
    beeswaxExport: byproductExportMode(next.beeswaxExport, "beeswaxExport"),
    byproductExportReserveMonths: clamp("byproductExportReserveMonths", next.byproductExportReserveMonths),
    byproductExportShare: clamp("byproductExportShare", next.byproductExportShare),
    byproductReturnMonths: clamp("byproductReturnMonths", next.byproductReturnMonths),
    byproductKeepMonths: clamp("byproductKeepMonths", next.byproductKeepMonths),
    byproductExcessSpoil: clamp("byproductExcessSpoil", next.byproductExcessSpoil),
    fuelChoice: fuelChoiceMode(next.fuelChoice),
    fuelPriceElasticity: clamp("fuelPriceElasticity", next.fuelPriceElasticity),
    peatCutPlan: peatCutPlanMode(next.peatCutPlan),
    guildSurplusUse: guildSurplusUseMode(next.guildSurplusUse),
    cellCheeseSale: cellCheeseSaleMode(next.cellCheeseSale),
    ruralDairyUse: ruralDairyUseMode(next.ruralDairyUse),
    dairyDemand: dairyDemandMode(next.dairyDemand),
    cheeseReferencePrice: cheeseReferencePriceMode(next.cheeseReferencePrice),
    guildSpendRate: clamp("guildSpendRate", next.guildSpendRate),
    guildReserveMonths: clamp("guildReserveMonths", next.guildReserveMonths),
    candleDemand: candleDemandMode(next.candleDemand),
    candleKgPerPerson: clamp("candleKgPerPerson", next.candleKgPerPerson),
    waxCandleKgPerPerson: clamp("waxCandleKgPerPerson", next.waxCandleKgPerPerson),
    ruralChandlersPerThousand: clamp("ruralChandlersPerThousand", next.ruralChandlersPerThousand),
    wageSubsistenceMultiple: clamp("wageSubsistenceMultiple", next.wageSubsistenceMultiple),
    cheeseMakingDaysPerMilkLot: clamp("cheeseMakingDaysPerMilkLot", next.cheeseMakingDaysPerMilkLot),
    ruralCheeseEatShare: clamp("ruralCheeseEatShare", next.ruralCheeseEatShare),
    dairyTraditionHalfLifeYears: clamp("dairyTraditionHalfLifeYears", next.dairyTraditionHalfLifeYears),
    animalProteinCapGramsPerDay: clamp("animalProteinCapGramsPerDay", next.animalProteinCapGramsPerDay),
    cheesePriceElasticity: clamp("cheesePriceElasticity", next.cheesePriceElasticity),
    surplusRuralWeight: clamp("surplusRuralWeight", next.surplusRuralWeight),
    surplusReserveFactor: clamp("surplusReserveFactor", next.surplusReserveFactor),
    harvestReserveMonths: clamp("harvestReserveMonths", next.harvestReserveMonths),
    merchantProfitShare: clamp("merchantProfitShare", next.merchantProfitShare),
    merchantProfitUse: profitUse(next.merchantProfitUse),
    merchantReserveYears: clamp("merchantReserveYears", next.merchantReserveYears),
    characterReserve: characterReserveMode(next.characterReserve),
    rulerReserveYears: clamp("rulerReserveYears", next.rulerReserveYears),
    officeReserveYears: clamp("officeReserveYears", next.officeReserveYears),
    commanderReserveYears: clamp("commanderReserveYears", next.commanderReserveYears),
    commonReserveYears: clamp("commonReserveYears", next.commonReserveYears),
    heirlessEstate: heirlessEstateMode(next.heirlessEstate),
    estateClaimMonths: clamp("estateClaimMonths", next.estateClaimMonths),
    stateBudgetIncome: stateBudgetIncomeMode(next.stateBudgetIncome),
    guildMasterSeat: guildMasterSeatMode(next.guildMasterSeat),
    guildMasterIncome: guildMasterIncomeMode(next.guildMasterIncome),
    guildMasterWorkshopShare: clamp("guildMasterWorkshopShare", next.guildMasterWorkshopShare),
    guildMasterRetireRatio: clamp("guildMasterRetireRatio", next.guildMasterRetireRatio)
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
