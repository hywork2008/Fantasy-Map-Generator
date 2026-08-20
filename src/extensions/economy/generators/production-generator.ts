import {
  getMechanizedTextilesOutputMultiplier,
  getTechnologyStage,
  isDistillationKnown
} from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import type { Burg, State } from "../../hostTypes";
import { DEBUG, ERROR, measureTickStep, measureTickStepAsync, rn, TIME } from "../../hostUtils";
import {
  getBurgProductionRecords,
  getConstructionOperations,
  getCraftDomainEmploymentRecords,
  getCraftEmploymentRecords,
  getDeals,
  getGoodCellColumn,
  getGoods,
  getMarkets,
  getOrCreateCumulativeGoodsSales,
  getOrCreateMarketGoodProductionTotals,
  getStrategicLaborMarkets,
  getStrategicProcurementOrders,
  getWorldContext,
  setBurgProductionRecords,
  setCraftDomainEmploymentRecords,
  setCraftEmploymentRecords,
  setDeals,
  setStrategicLaborMarkets
} from "../economyContext";
import { getEconomyCalibrationState } from "../store/economyCalibrationState";
import { syncBurgMarketLedgers } from "./burgMarketLedgers";
import { Caravans } from "./caravans";
import { CELL_FOOD_PRESERVATION_LABOR_SHARE } from "./cellFoodRescue";
import {
  type ConstructionOperation,
  ConstructionOperations,
  getConstructionProductivityMultiplier
} from "./constructionEmployment";
import {
  domainShare,
  getCalibratedMonthlyLots,
  getGoodDemandCalibration,
  laborPointsForLots
} from "./craftDemandCalibration";
import { smoothCraftWorkers } from "./craftEmployment";
import { laborPeople } from "./craftScale";
import { ExportStaging } from "./exportStaging";
import { hasViableFoodProcessingMargin } from "./foodProcessingEconomics";
import {
  getFoodProcessingProductionHeadroom,
  recordBeerCaskFilling,
  recordFoodMarketIntake,
  recordFoodProcessingConsumption,
  recordWineCaskFilling,
  refreshAleHouseholdDemand,
  settleFoodProcessingHouseholds
} from "./foodProcessingLedger";
import type { DemandCategory, Good } from "./goods-generator";
import {
  DEMAND_PRIORITY,
  expandRecipeByproducts,
  Goods,
  getDemandTargets,
  isFreshFoodGood,
  isGoodEnabled
} from "./goods-generator";
import { recordGoodFlow } from "./goodsBalanceLedger";
import { getGuildBonus } from "./guildKnowledge";
import {
  CRAFT_KNOWLEDGE_DOMAINS,
  type CraftDomainEmploymentRecord,
  type CraftKnowledgeDomain,
  getCraftDomainForGood
} from "./guildKnowledgeTypes";
import { GUILD_PROFIT_SHARE, GuildTreasury } from "./guildTreasury";
import { beginFlowCycleCapture, recordFlowCycleEnd } from "./marketFlowDiagnostics";
import { settleMarketMaintenance } from "./marketMaintenance";
import { allocateMarketProcurementBudgets } from "./marketProcurementBudget";
import { Markets } from "./markets-generator";
import type { Deal, Market } from "./marketTypes";
import { MerchantTradeCapital } from "./merchantTradeCapital";
import { MerchantTransportAssets } from "./merchantTransportAssets";
import { MetallurgWork } from "./metallurgWork";
import { MilitaryResources } from "./militaryResources";
import { MineOperations } from "./mineOperations";
import { isMineSuppliedGoodName } from "./mineralResources";
import { Minting } from "./minting";
import { expectedWorkerPoints, getOccupationalRow } from "./occupationalCalibration";
import { getModifiers, MAX_BONUS_PRODUCTION } from "./production-utils";
import type {
  DealRecord,
  Ingredient,
  MfgRecord,
  ProductionCandidate,
  ProductionRecipeEntry,
  ProductionRecord
} from "./productionRecordTypes";
import { QuarryOperations } from "./quarryOperations";
import { SaltLogistics } from "./saltLogistics";
import { SmelterOperations } from "./smelterOperations";
import {
  getSmithingProductProgram,
  isSmithingWorkshopProductGood,
  SMITHING_PRODUCT_GOOD_NAMES,
  type SmithingProductProgram
} from "./smithingProductProgram";
import { SmithingWorkshopAccounting } from "./smithingWorkshopLedger";
import {
  getStrategicLaborProductivity,
  getStrategicOccupation,
  type LaborMarket,
  reconcileStrategicLaborMarkets
} from "./strategicLaborMarkets";
import {
  getStrategicDemandMultiplier,
  getStrategicLaborAllocationWeight,
  getStrategicProductionDemandByGood,
  type StrategicProductionDemand
} from "./strategicProductionDemand";
import { getGarmentProductionHeadroom, settleTextileHouseholdDemand } from "./textileDemand";
import { TradeSecurity } from "./tradeSecurity";
import { TransportAssetOrders } from "./transportAssetOrders";
import { advanceViticultureAllocationShares, getViticultureAllocationMultiplier } from "./viticultureAllocation";
import { VolcanicOperations } from "./volcanicOperations";

export type {
  DealRecord,
  Ingredient,
  LocalRecord,
  MfgRecord,
  ProductionCandidate,
  ProductionRecipeEntry,
  ProductionRecord
} from "./productionRecordTypes";

const BONUS_URBAN_PRODUCTION = 1;

/**
 * Guaranteed labor share for goods with outstanding Metallurg/strategic-procurement demand
 * (state armories' Arms/Muskets/Harnesses/Artillery/Arrows/Bullets orders, Shipbuilding's
 * material orders) — see runWorkerLoop()'s "Phase 1b" for the starvation bug this fixes. Same
 * 15% share as CELL_FOOD_PRESERVATION_LABOR_SHARE, kept as its own constant because the two
 * carve-outs protect different things and are free to diverge later.
 */
const STRATEGIC_PRIORITY_LABOR_SHARE = 0.15;

const STATE_TECH_GATED_GOODS: Readonly<Record<string, (stateId: number) => boolean>> = {
  Liquor: isDistillationKnown
};

/** State-scoped technology availability for otherwise globally registered manufactured goods. */
export function isGoodManufacturableInState(good: Pick<Good, "name" | "requiredTechnology">, stateId: number): boolean {
  if (
    good.requiredTechnology &&
    !isTechnologyStageAtLeast(getTechnologyStage(good.requiredTechnology, stateId), "adopted")
  ) {
    return false;
  }
  return STATE_TECH_GATED_GOODS[good.name]?.(stateId) ?? true;
}

/** Converts accumulated wine-press residue into Pomace Wine at the local market. */
export function settlePomaceWineMarketProcessing(market: Market): number {
  const pomace = getGoods().find(good => good.name === "Pomace");
  const barrels = getGoods().find(good => good.name === "Barrels");
  const pomaceWine = getGoods().find(good => good.name === "Pomace Wine");
  if (!pomace || !barrels || !pomaceWine || !isGoodEnabled(pomaceWine)) return 0;

  const recipe = pomaceWine.recipes?.find(candidate => candidate[pomace.i] && candidate[barrels.i]);
  if (!recipe) return 0;
  const pomacePerCask = recipe[pomace.i];
  const barrelsPerCask = recipe[barrels.i];
  const pomaceStock = market.goods[pomace.i]?.stock ?? 0;
  const barrelStock = market.goods[barrels.i]?.stock ?? 0;
  const casks = rn(Math.min(pomaceStock / pomacePerCask, barrelStock / barrelsPerCask), 2);
  if (casks <= 0) return 0;

  market.goods[pomace.i].stock = rn(Math.max(0, pomaceStock - casks * pomacePerCask), 2);
  market.goods[barrels.i].stock = rn(Math.max(0, barrelStock - casks * barrelsPerCask), 2);
  const output = market.goods[pomaceWine.i] ?? { stock: 0, price: pomaceWine.value };
  market.goods[pomaceWine.i] = output;
  output.stock = rn(output.stock + casks, 2);

  for (const [good, units] of [
    [pomace, casks * pomacePerCask],
    [barrels, casks * barrelsPerCask]
  ] as const) {
    recordGoodFlow({
      direction: "sink",
      category: "recipeInput",
      goodId: good.i,
      units,
      marketId: market.i,
      relatedGoodId: pomaceWine.i
    });
    recordFoodProcessingConsumption(market, good.name, units);
  }
  recordGoodFlow({
    direction: "source",
    category: "burgCraft",
    goodId: pomaceWine.i,
    units: casks,
    marketId: market.i
  });
  recordFoodMarketIntake(market, pomaceWine.name, casks);

  const marketIntake = getOrCreateCumulativeGoodsSales();
  if (marketIntake) marketIntake[pomaceWine.i] = rn((marketIntake[pomaceWine.i] ?? 0) + casks, 2);
  const marketProduction = getOrCreateMarketGoodProductionTotals();
  if (marketProduction) {
    const key = `${market.i}:${pomaceWine.i}`;
    marketProduction[key] = rn((marketProduction[key] ?? 0) + casks, 2);
  }
  return casks;
}

export class ProductionModule {
  private get worldContext() {
    return getWorldContext();
  }

  private getSalesTax(burg: { state?: number }): number {
    const stateId = burg.state || 0;
    if (!stateId) return 0;
    return this.worldContext.pack.states?.[stateId]?.salesTax ?? 0;
  }

  produce(): void {
    TIME && console.time("generateProduction");
    try {
      const cycle = measureTickStep("production:startCycle", () => this.startProductionCycle());
      measureTickStep("production:burgLoop", () => {
        for (const burg of cycle.sortedBurgs) this.produceForBurg(burg, cycle);
      });
      measureTickStep("production:finishCycle", () => this.finishProductionCycle(cycle));
    } finally {
      TIME && console.timeEnd("generateProduction");
    }
  }

  /**
   * Same deterministic production cycle as produce(), but releases the main thread between
   * burg batches so a newly generated map remains interactive while economy data is prepared.
   */
  async produceIncrementally({
    isCancelled = () => false,
    onProgress = () => undefined,
    frameBudgetMs = 8,
    skipGlobalTrade = false
  }: IncrementalProductionOptions = {}): Promise<boolean> {
    TIME && console.time("generateProduction");
    try {
      const cycle = this.startProductionCycle();
      const total = cycle.sortedBurgs.length;
      let completed = 0;
      onProgress(0, total);

      while (completed < total) {
        if (isCancelled()) return false;
        const frameStart = performance.now();
        do {
          this.produceForBurg(cycle.sortedBurgs[completed], cycle);
          completed++;
        } while (completed < total && performance.now() - frameStart < frameBudgetMs);

        onProgress(completed, total);
        if (completed < total) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }

      if (isCancelled()) return false;
      return await this.finishProductionCycleIncrementally(cycle, { isCancelled, frameBudgetMs, skipGlobalTrade });
    } finally {
      TIME && console.timeEnd("generateProduction");
    }
  }

  private startProductionCycle(): ProductionCycle {
    // Cleared here (start of cycle) rather than after Taxes.collectTaxes() so the previous
    // cycle's deals stay visible to transaction-history UI (markets-overview.ts,
    // market-deals-overview.ts, production-overview.ts) for the whole ~30-day interval between
    // cycles, instead of for ~0ms (docs/temp/profits.md decision #1).
    setDeals([]);
    // Loaded maps restore goods/markets before the singleton lookup caches are rebuilt.
    // Rural Wood and mine supply both write through those caches.
    Goods.sync();
    Markets.sync();

    // A0 flow diagnostics: retail stock before rural/burg production this cycle.
    beginFlowCycleCapture();
    SmithingWorkshopAccounting.beginProductionCycle();

    measureTickStep("production:rural", () => Markets.collectRuralProduction());
    measureTickStep("production:minesSmelters", () => {
      if (MineOperations.reanchorOperations()) SmelterOperations.generate();
      MineOperations.produceMonth();
      SmelterOperations.produceMonth();
    });
    measureTickStep("production:quarryAshConstruction", () => {
      QuarryOperations.produceMonth();
      VolcanicOperations.produceMonth();
      ConstructionOperations.produceMonth();
    });
    // Salt is neither generic rural output nor a discretionary utilities demand. State saltworks
    // produce, wholesale-dispatch, and retail household supply it before processors price recipes.
    measureTickStep("production:saltLogistics", () => SaltLogistics.settleMonth());
    measureTickStep("production:monthlyLedgers", () => {
      Minting.settleMonthly();
      MilitaryResources.settleMonthly();
      TradeSecurity.settleMonthly();
    });
    measureTickStep("production:militaryMaterialStaging", () => MetallurgWork.stageStateMilitaryMaterials());
    measureTickStep("production:pricesAndLabor", () => {
      Markets.initializeMarketPrices();
      TransportAssetOrders.beginProductionCycle();
      refreshAleHouseholdDemand();
    });

    // stapleFood (Grain) production and Burg demand are owned by the Food Ledger's own
    // quarterly/monthly pipeline (foodProduction.ts / foodLedgerConsumption.ts), not by the
    // generic worker-production / demand-fulfillment loops built from this index.
    const nonStapleGoods = getGoods().filter(good => isGoodEnabled(good) && !good.tags.includes("stapleFood"));
    const index = measureTickStep("production:buildIndex", () => this.buildProductionIndex(nonStapleGoods));
    const strategicLaborMarkets = measureTickStep("production:strategicLabor", () =>
      reconcileStrategicLaborMarkets(
        {
          markets: getMarkets(),
          burgs: this.worldContext.pack.burgs,
          goods: index.goods,
          orders: getStrategicProcurementOrders()
        },
        getStrategicLaborMarkets()
      )
    );
    setStrategicLaborMarkets(strategicLaborMarkets);
    const strategicLaborMarketById = new Map(
      strategicLaborMarkets.map(laborMarket => [laborMarket.marketId, laborMarket])
    );
    const sortedBurgs = this.worldContext.pack.burgs
      .filter(burg => burg.i && !burg.removed)
      .sort((a, b) => a.population! - b.population!);
    const constructionOperationByBurg = new Map(
      getConstructionOperations().map(operation => [operation.burgId, operation])
    );
    const craftWorkersByBurg = new Map(getCraftEmploymentRecords().map(record => [record.burgId, record.workers]));
    const craftDomainWorkersByKey = new Map(
      getCraftDomainEmploymentRecords().map(record => [craftDomainKey(record.burgId, record.domain), record.workers])
    );
    // Purchase budgets must exist before the Burg loop; otherwise first-cycle production
    // would still depend on whichever Burg happens to run first after a legacy load.
    measureTickStep("production:merchantPurchaseCapital", () => MerchantTradeCapital.ensureAllMarkets());
    const saleBudgetByBurg = allocateMarketProcurementBudgets(sortedBurgs, getMarkets());

    return {
      index,
      sortedBurgs,
      strategicLaborMarketById,
      constructionOperationByBurg,
      craftWorkersByBurg,
      craftDomainWorkersByKey,
      saleBudgetByBurg
    };
  }

  private produceForBurg(burg: Burg, cycle: ProductionCycle): void {
    if (!burg.i || burg.removed || !burg.market) return;
    const market = Markets.get(burg.market);
    if (!market) return;

    const state = this.createBurgProductionState(
      burg,
      market,
      cycle.index,
      cycle.strategicLaborMarketById.get(market.i),
      cycle.constructionOperationByBurg.get(burg.i)
    );
    const craftWorkersUsed = this.runWorkerLoop(cycle.index, state);
    const populationRate = Math.max(0, this.worldContext.populationRate ?? 0) || 1;
    cycle.craftWorkersByBurg.set(
      burg.i,
      smoothCraftWorkers(cycle.craftWorkersByBurg.get(burg.i) ?? 0, craftWorkersUsed.total, populationRate)
    );
    for (const domain of CRAFT_KNOWLEDGE_DOMAINS) {
      const key = craftDomainKey(burg.i, domain);
      const observed = craftWorkersUsed.byDomain.get(domain) ?? 0;
      const smoothed = smoothCraftWorkers(cycle.craftDomainWorkersByKey.get(key) ?? 0, observed, populationRate);
      cycle.craftDomainWorkersByKey.set(key, smoothed);
    }
    // Phase 5 (docs/plan/biome-goods-producer-ecosystem.md §9.4): advances Wine/Raisins' smoothed
    // allocation shares from this cycle's market snapshot, read back next cycle by
    // getViticultureAllocationMultiplier() in makeProductionDecision() — same one-cycle-lag timing
    // as the craft employment smoothing above.
    advanceViticultureAllocationShares(burg.i, market);

    const phaseRevenue = this.sellInventoryToMarket(state, cycle.saleBudgetByBurg);
    burg.treasury = rn((burg.treasury || 0) + phaseRevenue, 2);
    burg.product = rn(Math.max(0, phaseRevenue - state.ingredientCosts), 2);
    // Gives a treasury=0 Burg with no local resource a recovery chance even without new product
    // this cycle, drawing only from its own domain guilds' accumulated capital (docs/plan/
    // burg-treasury-equilibrium.md §3.2).
    GuildTreasury.payoutStrugglingBurg(burg);

    setBurgProductionRecords(burg, state.records);
  }

  private finishProductionCycle(cycle: ProductionCycle): void {
    // Phase D: ensure merchant trade capital, then once per map seed inherited export-warehouse
    // stock (pre-start merchant inventory) before this cycle's global trade books more lots.
    measureTickStep("production:merchantPrep", () => {
      MerchantTradeCapital.ensureAllMarkets();
      ExportStaging.seedInheritedExportWarehouseIfNeeded();
    });

    measureTickStep("production:pomaceWine", () => {
      for (const market of getMarkets()) settlePomaceWineMarketProcessing(market);
    });
    measureTickStep("production:globalTrade", () => Markets.runGlobalTrade());
    measureTickStep("production:spawnCaravans", () => Caravans.spawnFromDeals(getDeals()));
    measureTickStep("production:fillDemand", () => this.fillBurgsDemand(cycle.sortedBurgs, cycle.index));
    measureTickStep("production:marketMaintenance", () => settleMarketMaintenance());
    measureTickStep("production:syncLedgers", () => {
      syncBurgMarketLedgers();

      // Garments are durable household purchases, not an ordinary Burg utility input. Settle their
      // market-wide (urban + rural) replacement demand after this cycle's production and trade.
      settleTextileHouseholdDemand();
      settleFoodProcessingHouseholds();

      // A0: record market×good demand / production estimate / trade / end stock for the year rollup.
      recordFlowCycleEnd();
      // After enough flow samples, grow land fleets toward measured annual export slots.
      MerchantTransportAssets.topUpFleetsFromExportDemand();

      const craftEmploymentRecords = Array.from(cycle.craftWorkersByBurg.entries())
        .filter(([, workers]) => workers > 0)
        .map(([burgId, workers]) => ({ burgId, workers }));
      setCraftEmploymentRecords(craftEmploymentRecords);

      const craftDomainEmploymentRecords: CraftDomainEmploymentRecord[] = [];
      for (const [key, workers] of cycle.craftDomainWorkersByKey) {
        if (workers <= 0) continue;
        const [burgId, domain] = parseCraftDomainKey(key);
        craftDomainEmploymentRecords.push({ burgId, domain, workers });
      }
      setCraftDomainEmploymentRecords(craftDomainEmploymentRecords);
    });
  }

  /**
   * Same steps as finishProductionCycle(), but the two steps that dominate its cost on a large
   * map — global trade matching and caravan spawning — run through their yielding
   * "Incrementally" counterparts (Markets.runGlobalTradeIncrementally() /
   * Caravans.spawnFromDealsIncrementally()) so the browser stays responsive between batches.
   * `skipGlobalTrade` lets the "Preparing economy" task defer trade-route generation entirely
   * for this cycle (see IncrementalProductionOptions). Used only by produceIncrementally() —
   * the synchronous produce() (Advance Time, regenerate, editor actions) always calls
   * finishProductionCycle() and always computes trade. Returns false if cancelled before
   * completion.
   */
  private async finishProductionCycleIncrementally(
    cycle: ProductionCycle,
    { isCancelled = () => false, frameBudgetMs = 8, skipGlobalTrade = false }: IncrementalProductionOptions
  ): Promise<boolean> {
    // Phase D: ensure merchant trade capital, then once per map seed inherited export-warehouse
    // stock (pre-start merchant inventory) before this cycle's global trade books more lots.
    measureTickStep("production:merchantPrep", () => {
      MerchantTradeCapital.ensureAllMarkets();
      ExportStaging.seedInheritedExportWarehouseIfNeeded();
    });

    measureTickStep("production:pomaceWine", () => {
      for (const market of getMarkets()) settlePomaceWineMarketProcessing(market);
    });

    if (!skipGlobalTrade) {
      const tradeCompleted = await measureTickStepAsync("production:globalTrade", () =>
        Markets.runGlobalTradeIncrementally({ isCancelled, frameBudgetMs })
      );
      if (!tradeCompleted) return false;

      const caravansCompleted = await measureTickStepAsync("production:spawnCaravans", () =>
        Caravans.spawnFromDealsIncrementally(getDeals(), { isCancelled, frameBudgetMs })
      );
      if (!caravansCompleted) return false;
    }

    if (isCancelled()) return false;

    measureTickStep("production:fillDemand", () => this.fillBurgsDemand(cycle.sortedBurgs, cycle.index));
    measureTickStep("production:marketMaintenance", () => settleMarketMaintenance());
    measureTickStep("production:syncLedgers", () => {
      syncBurgMarketLedgers();

      // Garments are durable household purchases, not an ordinary Burg utility input. Settle their
      // market-wide (urban + rural) replacement demand after this cycle's production and trade.
      settleTextileHouseholdDemand();
      settleFoodProcessingHouseholds();

      // A0: record market×good demand / production estimate / trade / end stock for the year rollup.
      recordFlowCycleEnd();
      // After enough flow samples, grow land fleets toward measured annual export slots.
      MerchantTransportAssets.topUpFleetsFromExportDemand();

      const craftEmploymentRecords = Array.from(cycle.craftWorkersByBurg.entries())
        .filter(([, workers]) => workers > 0)
        .map(([burgId, workers]) => ({ burgId, workers }));
      setCraftEmploymentRecords(craftEmploymentRecords);

      const craftDomainEmploymentRecords: CraftDomainEmploymentRecord[] = [];
      for (const [key, workers] of cycle.craftDomainWorkersByKey) {
        if (workers <= 0) continue;
        const [burgId, domain] = parseCraftDomainKey(key);
        craftDomainEmploymentRecords.push({ burgId, domain, workers });
      }
      setCraftDomainEmploymentRecords(craftDomainEmploymentRecords);
    });
    return true;
  }

  private fillBurgsDemand(sortedBurgs: Burg[], index: ProductionIndex): void {
    for (const burg of sortedBurgs) {
      if (!burg.i || burg.removed || !burg.market) continue;
      const demandTargets = getDemandTargets(burg.population || 0);
      // Clothing is consumed by the textile household ledger below, which includes rural residents
      // and avoids charging a city Burg treasury for the whole market's countryside.
      const clothingIndex = DEMAND_PRIORITY.indexOf("clothing");
      if (clothingIndex >= 0) demandTargets[clothingIndex] = 0;
      this.fillDemandFromMarket({
        burg,
        demandCoverageByGood: index.demandCoverageByGood,
        demandGoodsByCategory: index.demandGoodsByCategory,
        demandTargets,
        records: getBurgProductionRecords(burg)
      });
    }
  }

  private buildProductionIndex(goods: Good[]): ProductionIndex {
    const demandCoverageByGood = this.buildDemandCoverageByGood(goods);
    const demandGoodsByCategory = this.buildDemandGoodsByCategory(goods, demandCoverageByGood);
    const recipes = this.buildRecipesArray(goods);
    const recipesByOutput = this.buildRecipesByOutput(recipes);
    const productiveGoods = goods.filter(good => recipesByOutput[good.i]?.length);
    const minWorkersByGood = this.buildMinWorkersByGood(goods, recipesByOutput);
    const preservationGoods = productiveGoods.filter(
      good =>
        good.tags.includes("food") &&
        recipesByOutput[good.i]!.some(recipe =>
          recipe.ingredients.some(ingredient => {
            const ingredientGood = Goods.get(ingredient.goodId);
            return ingredientGood ? isFreshFoodGood(ingredientGood) : false;
          })
        )
    );
    // 2026-08-08 (docs/temp/0807-alcoholic.md): a preservation good's first-claim priority below is
    // worthless if a craft-produced ingredient it depends on (Wine's Barrels) never accumulates stock,
    // because that ingredient itself still has to out-rank every other Good in Phase 2's normal
    // profit-ranked loop, cycle after cycle, just to get produced at all. Extend first claim to those
    // direct craft ingredients too — one level of the recipe graph only (not recursive), since the
    // observed bottleneck (Barrels) sits one step down and further raw inputs (Wood, Salt) are abundant
    // enough not to need it.
    //
    // 2026-08-08 correction (same doc): only extend it to an ingredient that appears in *every* recipe
    // alternative of at least one preservation good — a true single-point-of-failure dependency, not
    // merely "used somewhere". Wine's { Grapes, Barrels } is its only recipe, so Barrels qualifies. But
    // Cheese's four coagulant recipes ({ Milk, Salt }/{ Milk, Vinegar }/{ Milk, Rennet }/{ Milk, Ash })
    // were deliberately designed so no single one bottlenecks Cheese-making (see that recipe's own
    // doc-comment) — an earlier, broader version of this filter (any direct ingredient of any recipe)
    // wrongly gave Rennet the same first-claim priority as Cheese itself despite Rennet having zero
    // independent demandCoverage. With nothing capping its output to what Cheese's { Rennet: 0.1 } leg
    // actually consumes, Rennet's healthy margin let it win Phase 1's per-step ranking against Cheese
    // (and everything else in the priority set) essentially unbounded, flooding the market with surplus
    // Rennet while starving Cheese of its own priority turns (confirmed via Balance History: Rennet
    // stock/cumulative-sales ~16400 vs. Cheese's ~550).
    const preservationIngredientGoods = productiveGoods.filter(
      good =>
        !preservationGoods.includes(good) &&
        preservationGoods.some(preservationGood => {
          const recipeAlternatives = recipesByOutput[preservationGood.i]!;
          return recipeAlternatives.every(recipe =>
            recipe.ingredients.some(ingredient => ingredient.goodId === good.i)
          );
        })
    );
    // Beer has a bounded household-demand headroom, so daily-beverage priority cannot produce an
    // export stockpile. It needs this early pass because staple Grain otherwise already satisfies
    // generic food demand before a brewer can be selected.
    const dailyBeverageGoods = productiveGoods.filter(good => good.name === "Beer");
    const priorityGoods = [...preservationGoods, ...preservationIngredientGoods, ...dailyBeverageGoods];

    return {
      goods,
      demandCoverageByGood,
      demandGoodsByCategory,
      recipesByOutput,
      productiveGoods,
      priorityGoods,
      minWorkersByGood
    };
  }

  private createBurgProductionState(
    burg: Burg,
    market: Market,
    index: ProductionIndex,
    strategicLaborMarket: LaborMarket | undefined,
    constructionOperation: ConstructionOperation | undefined
  ): BurgProductionState {
    const population = rn(burg.population || 0, 2);
    const inventory: number[] = [];
    const demandTargets = getDemandTargets(population);
    const demandCoverage = this.calculateDemandCoverage(inventory, index.demandCoverageByGood);
    const records: ProductionRecord[] = [];
    const smithingProgramByGood = new Map<string, SmithingProductProgram>();
    if (burg.i) {
      for (const goodName of SMITHING_PRODUCT_GOOD_NAMES) {
        const program = getSmithingProductProgram(burg.i, goodName);
        if (program) smithingProgramByGood.set(goodName, program);
      }
    }

    const good = Goods.get(getGoodCellColumn()[burg.cell]);
    if (good && isGoodEnabled(good) && !isMineSuppliedGoodName(good.name)) {
      const modifier = getModifiers(good, burg.cell);
      // No lower clamp (matches the rural counterpart, getCellProduction in production-utils.ts):
      // burg.population is the raw pre-scaling population score (~0.05-20, the same unit
      // burgs-generator.ts's group thresholds use — e.g. fort: max 1, village: 0.1-2), so a MIN
      // floor here would give every hamlet/village/fort the same flat bonus regardless of how far
      // below that floor its actual size is. See docs/analytics/urban-resource-bonus-rebalance.md.
      const bonus = Math.min(population * BONUS_URBAN_PRODUCTION, MAX_BONUS_PRODUCTION);
      // Dynamic stand-in for the old static `burg.shanty` flag: an underdeveloped Burg's
      // buildingStock throttles its own local-bonus output (docs/plan/
      // urban-construction-industry.md §3.3, decision §7.1-2a). 1 (no penalty) for Burgs
      // without a construction operation yet.
      const localBonus = bonus * modifier * getConstructionProductivityMultiplier(constructionOperation);
      if (localBonus > 0) {
        inventory[good.i] = (inventory[good.i] || 0) + localBonus;
        records.push({ goodId: good.i, units: rn(localBonus, 2) });
      }
    }

    return {
      burg,
      market,
      population,
      demandTargets,
      inventory,
      demandCoverage,
      records,
      ingredientCosts: 0,
      activeGoalGoodId: null,
      smithingProgramByGood,
      strategicLaborMarket,
      strategicDemandByGood: this.getCombinedStrategicDemand(market.i),
      remainingCalibratedLots: this.buildRemainingCalibratedLots(burg, population, index)
    };
  }

  /**
   * Seeds this cycle's per-good calibrated lot targets (docs/plan/craft-demand-calibration.md
   * §3.5). Empty unless applyCalibration is on. Only goods with a GOOD_DEMAND_CALIBRATION row are
   * tracked — every other good keeps runWorkerLoop()'s pre-PR-3, uncapped batching behavior.
   */
  private buildRemainingCalibratedLots(burg: Burg, population: number, index: ProductionIndex): Map<number, number> {
    const remainingCalibratedLots = new Map<number, number>();
    if (!getEconomyCalibrationState().applyCalibration) return remainingCalibratedLots;

    const populationRate = Math.max(0, this.worldContext.populationRate ?? 0) || 1;
    const laborPeopleBurg = laborPeople(population, populationRate);
    const port = Boolean(burg.port);
    const capital = Boolean(burg.capital);
    for (const good of index.productiveGoods) {
      if (!getGoodDemandCalibration(good.name)) continue;
      const lots = getCalibratedMonthlyLots({ goodName: good.name, laborPeopleBurg, port, capital });
      remainingCalibratedLots.set(good.i, Math.max(0, lots));
    }
    return remainingCalibratedLots;
  }

  /**
   * Public Metallurg orders and import procurement share one production-priority seam. Generic
   * production remains the sole owner of worker allocation, recipes, and material purchasing.
   */
  private getCombinedStrategicDemand(marketId: number): ReadonlyMap<number, StrategicProductionDemand> {
    const combined = new Map(getStrategicProductionDemandByGood(getStrategicProcurementOrders(), marketId));
    for (const demand of MetallurgWork.getProductionDemandByGood(marketId).values()) {
      const existing = combined.get(demand.goodId);
      if (existing) {
        existing.outstandingUnits += demand.outstandingUnits;
        existing.priorityCycles = Math.max(existing.priorityCycles, demand.priorityCycles);
        existing.stateFunded ||= demand.stateFunded;
      } else {
        combined.set(demand.goodId, { ...demand });
      }
    }
    return combined;
  }

  /**
   * Returns how many of the Burg's population points were engaged manufacturing recipe-based
   * Goods this cycle (docs/plan/urban-employment-demand.md §3.7), both as a Burg-wide total (the
   * pre-existing `basicEmploymentDemand` signal) and broken down by craft-guild domain
   * (docs/plan/knowledge-guild-system.md §9 Phase 2).
   *
   * Two phases (2026-08-07, docs/plan/fauna-biome-realism.md §3 Phase M): perishable-preserving
   * goods and their direct craft ingredients (`index.priorityGoods` — Wine, Preserved food, Cheese,
   * Stockfish, Raisins, plus e.g. Barrels for Wine as of 2026-08-08, docs/temp/0807-alcoholic.md) get
   * first claim on this cycle's craft labour, ahead of the normal profit-ranked loop over every
   * productive Good. Root cause this fixes: `getDemandFocus()`/`getDemandEffect()` only ever boost
   * a Good that covers the single most-underserved demand category, and rural Grain alone routinely
   * saturates the "food" target — so food-only Goods (Cheese included) never receive a demand boost
   * and lose every ranked comparison to whichever non-food category currently has real shortage,
   * even when Milk/Grapes/Fish sit unprocessed in the market and would spoil. The ingredient half of
   * the set fixes the same problem one step down the chain: without it, a preservation good could win
   * this priority queue every cycle and still never produce anything, because a shared craft
   * ingredient like Barrels (also consumed by Beer/Liquor) never accumulates stock — it still has to
   * out-rank higher-margin luxury goods in Phase 2 on every cycle to get made at all. Both phases still
   * reuse `makeProductionDecision()`'s existing `projectedGain <= 0` guard (see there), so this
   * never forces a manufacturing loss — it only removes these goods from having to *out-rank*
   * unrelated categories to get a turn at all.
   */
  private runWorkerLoop(index: ProductionIndex, state: BurgProductionState): CraftWorkerUsage {
    const applyCalibration = getEconomyCalibrationState().applyCalibration;
    const populationRate = Math.max(0, this.worldContext.populationRate ?? 0) || 1;
    const burgId = state.burg.i;
    const reservedTransportWork = burgId
      ? TransportAssetOrders.consumePlannedWork(burgId, state.population)
      : { total: 0, byDomain: new Map<CraftKnowledgeDomain, number>() };
    let workersUsed = reservedTransportWork.total;
    const byDomain = new Map<CraftDomainEmploymentRecord["domain"], number>();
    // Key Decision 10 (docs/plan/craft-demand-calibration.md): transport-asset construction labor
    // still draws down the Burg's population-point production budget (reservedTransportWork.total,
    // above), but is no longer counted as guild-craft practitioner labor once applyCalibration is
    // on — carts/wagons/barges are excluded from CraftDomainEmploymentRecord entirely.
    if (!applyCalibration) {
      for (const [domain, workers] of reservedTransportWork.byDomain) byDomain.set(domain, workers);
    }

    // Goods that produced zero output this cycle (ingredient/treasury shortfall) are dropped from
    // candidate lists for the rest of this call so a single stuck good cannot be re-selected every
    // step (docs/plan/craft-demand-calibration.md §3.5). Only populated when applyCalibration is on.
    const skippedGoodIds = new Set<number>();

    // Cap iterations to ceil(population) so floating-point leftovers cannot spin.
    const maxSteps = Math.max(0, Math.ceil(state.population));
    let step = 0;

    // Phase 1: preservation goods and their direct craft ingredients only. This protects the rare
    // case of fresh cargo already in a Burg's market, but is intentionally capped: food safety is a
    // bounded reserve target, not permission to move the entire urban workforce away from valuable
    // construction, military, or luxury work. Cell-local fresh harvests use cellFoodRescue instead.
    if (index.priorityGoods.length) {
      state.activeGoalGoodId = null;
      const priorityWorkCap = state.population * CELL_FOOD_PRESERVATION_LABOR_SHARE;
      let priorityWorkUsed = 0;
      for (; step < maxSteps && priorityWorkUsed < priorityWorkCap - 1e-9; step++) {
        const workersLeft = Math.min(state.population - workersUsed, priorityWorkCap - priorityWorkUsed);
        const workerFraction = Math.min(1, workersLeft);
        if (workerFraction <= 1e-9) break;

        const priorityCandidates = skippedGoodIds.size
          ? index.priorityGoods.filter(good => !skippedGoodIds.has(good.i))
          : index.priorityGoods;
        if (!priorityCandidates.length) break;

        const decision = this.makeProductionDecision(
          index,
          state,
          state.demandTargets,
          state.demandCoverage,
          state.activeGoalGoodId,
          workersLeft,
          workerFraction,
          priorityCandidates
        );
        if (!decision) break; // No more affordable/available preserving work this cycle.
        state.activeGoalGoodId = decision.goalGoodId;

        const laborBudget =
          applyCalibration && state.remainingCalibratedLots.has(decision.action.good.i)
            ? this.getCalibratedLaborBudget(state, decision.action.good, workersLeft, populationRate)
            : workerFraction;
        const { yieldLots, laborUsed } = this.executeManufacture(state, index, decision, laborBudget);
        const spent = applyCalibration ? laborUsed : workerFraction;
        this.settleCalibratedProduction(
          state,
          decision.action.good.i,
          yieldLots,
          laborUsed,
          applyCalibration,
          skippedGoodIds
        );
        workersUsed += spent;
        priorityWorkUsed += spent;

        const domain = getCraftDomainForGood(decision.action.good.name);
        if (domain) byDomain.set(domain, (byDomain.get(domain) ?? 0) + spent);
      }
    }

    // Phase 1b: goods with outstanding Metallurg/strategic-procurement demand (state armories'
    // Arms/Muskets/Harnesses/Artillery/Arrows/Bullets orders, Shipbuilding's material orders) get
    // their own guaranteed labor share too, split proportionally to each good's own outstanding
    // backlog. The allocation caps each backlog's weight before splitting this reserve, so an
    // oversized Tools queue cannot absorb the firearm goods' share. Each good is planned via a
    // single-candidate makeProductionDecision call — never
    // ranked against its siblings — which is the actual fix: Phase 2's single-winner-per-step
    // ranking always favors whichever tracked good has the best intrinsic profit margin (e.g.
    // Muskets, ~370% margin over its Iron/Charcoal/Wood cost) and starves every other one
    // completely (e.g. Bullets, ~100% margin) even when both are individually profitable and
    // materials are abundant. Confirmed via a direct production run: Bullets' normalizedGain
    // stayed positive but ~18x below Muskets', so Bullets never won a single Phase-2 iteration
    // across 3 simulated months. getStrategicDemandMultiplier()'s own boost caps at 4.5x, which
    // cannot close an 18x margin gap either — the fix has to stop pitting these goods against each
    // other for the same production slot, not just nudge the ranking further.
    if (state.strategicDemandByGood.size) {
      const strategicGoods = index.productiveGoods.filter(good => state.strategicDemandByGood.has(good.i));
      const totalStrategicWeight = strategicGoods.reduce((total, good) => {
        const demand = state.strategicDemandByGood.get(good.i);
        return total + (demand ? getStrategicLaborAllocationWeight(demand) : 0);
      }, 0);
      if (strategicGoods.length && totalStrategicWeight > 0) {
        const strategicWorkCap = state.population * STRATEGIC_PRIORITY_LABOR_SHARE;
        let strategicWorkUsed = 0;

        for (const good of strategicGoods) {
          if (step >= maxSteps || strategicWorkUsed >= strategicWorkCap - 1e-9) break;
          if (skippedGoodIds.has(good.i)) continue;
          const demand = state.strategicDemandByGood.get(good.i);
          if (!demand) continue;
          const strategicWeight = getStrategicLaborAllocationWeight(demand);
          const share = Math.min(
            strategicWorkCap * (strategicWeight / totalStrategicWeight),
            strategicWorkCap - strategicWorkUsed
          );
          let shareUsed = 0;
          state.activeGoalGoodId = null;

          for (; step < maxSteps && shareUsed < share - 1e-9; step++) {
            const workersLeft = Math.min(state.population - workersUsed, share - shareUsed);
            const workerFraction = Math.min(1, workersLeft);
            if (workerFraction <= 1e-9) break;

            const decision = this.makeProductionDecision(
              index,
              state,
              state.demandTargets,
              state.demandCoverage,
              state.activeGoalGoodId,
              workersLeft,
              workerFraction,
              [good]
            );
            if (!decision) break; // Not profitable (or infeasible) this cycle — move to the next good.
            state.activeGoalGoodId = decision.goalGoodId;

            const laborBudget =
              applyCalibration && state.remainingCalibratedLots.has(decision.action.good.i)
                ? this.getCalibratedLaborBudget(state, decision.action.good, workersLeft, populationRate)
                : workerFraction;
            const { yieldLots, laborUsed } = this.executeManufacture(state, index, decision, laborBudget);
            const spent = applyCalibration ? laborUsed : workerFraction;
            this.settleCalibratedProduction(
              state,
              decision.action.good.i,
              yieldLots,
              laborUsed,
              applyCalibration,
              skippedGoodIds
            );
            workersUsed += spent;
            strategicWorkUsed += spent;
            shareUsed += spent;
            if (applyCalibration && laborUsed <= 1e-9) break; // this good is stuck; move to the next.

            const domain = getCraftDomainForGood(decision.action.good.name);
            if (domain) byDomain.set(domain, (byDomain.get(domain) ?? 0) + spent);
          }
        }
      }
    }

    // Phase 2: the normal profit-ranked loop over every productive Good, for whatever labour
    // phases 1/1b didn't use. Fresh sticky/active-goal state so the earlier phases' picks don't
    // bias phase 2's full-candidate ranking.
    state.activeGoalGoodId = null;
    // Full good-ranking is O(productiveGoods); re-rank every few worker-units instead of
    // every unit. Output stays close when a burg's best craft is stable across a stretch.
    const reevalEvery = 4;
    let stickyDecision: ProductionDecision | null = null;
    for (; step < maxSteps; step++) {
      const workersLeft = state.population - workersUsed;
      const workerFraction = Math.min(1, workersLeft);
      if (workerFraction <= 1e-9) break;

      if (!stickyDecision || step % reevalEvery === 0) {
        const phase2Candidates = skippedGoodIds.size
          ? index.productiveGoods.filter(good => !skippedGoodIds.has(good.i))
          : index.productiveGoods;
        stickyDecision = this.makeProductionDecision(
          index,
          state,
          state.demandTargets,
          state.demandCoverage,
          state.activeGoalGoodId,
          workersLeft,
          workerFraction,
          phase2Candidates
        );
        if (!stickyDecision) break;
        state.activeGoalGoodId = stickyDecision.goalGoodId;
      }

      const chosenGood = stickyDecision.action.good;
      const laborBudget =
        applyCalibration && state.remainingCalibratedLots.has(chosenGood.i)
          ? this.getCalibratedLaborBudget(state, chosenGood, workersLeft, populationRate)
          : workerFraction;
      const { yieldLots, laborUsed } = this.executeManufacture(state, index, stickyDecision, laborBudget);
      const spent = applyCalibration ? laborUsed : workerFraction;
      this.settleCalibratedProduction(state, chosenGood.i, yieldLots, laborUsed, applyCalibration, skippedGoodIds);
      workersUsed += spent;
      // A stuck good (zero output this attempt) must not keep winning the sticky slot — force a
      // fresh ranking next step so a different good gets a turn (docs/plan/craft-demand-calibration.md §3.5).
      if (applyCalibration && laborUsed <= 1e-9) stickyDecision = null;

      const domain = getCraftDomainForGood(chosenGood.name);
      if (domain) byDomain.set(domain, (byDomain.get(domain) ?? 0) + spent);
    }

    return { total: workersUsed, byDomain };
  }

  /**
   * Labor budget (population points) offered to executeManufacture() for a good with a calibrated
   * monthly lot target (docs/plan/craft-demand-calibration.md §3.5). Bounded by whatever labor the
   * calling phase still has left, this good's remaining calibrated lots for the cycle (converted to
   * labor via its authored laborPointsPerLot), and — for guild-mapped goods — a domain-wide labor
   * cap so one good cannot absorb its whole domain's expected labor in a single batch.
   */
  private getCalibratedLaborBudget(
    state: BurgProductionState,
    good: Good,
    workersLeft: number,
    populationRate: number
  ): number {
    const remainingLots = state.remainingCalibratedLots.get(good.i) ?? 0;
    const laborPerLot = Math.max(1e-9, laborPointsForLots(good.name, 1, populationRate));
    let cap = workersLeft;

    const domain = getCraftDomainForGood(good.name);
    if (domain) {
      const port = Boolean(state.burg.port);
      const expected = expectedWorkerPoints({
        row: getOccupationalRow(domain),
        laborPeople: laborPeople(state.population, populationRate),
        populationRate,
        port,
        capital: Boolean(state.burg.capital),
        hasQuarry: false
      });
      cap = Math.min(cap, expected * domainShare(good.name, port));
    }

    return Math.max(0, Math.min(cap, remainingLots * laborPerLot));
  }

  /**
   * Decrements this cycle's remaining calibrated-lot target by what was actually produced, and
   * marks a good "skipped" for the rest of this runWorkerLoop() call when it produced nothing this
   * attempt (ingredient/treasury shortfall) — see the required test in
   * docs/plan/craft-demand-calibration.md §3.5: a good that plans positive lots but fails its
   * ingredient buy must not be re-selected every remaining step of the same cycle.
   */
  private settleCalibratedProduction(
    state: BurgProductionState,
    goodId: number,
    yieldLots: number,
    laborUsed: number,
    applyCalibration: boolean,
    skippedGoodIds: Set<number>
  ): void {
    if (!applyCalibration) return;
    const remaining = state.remainingCalibratedLots.get(goodId);
    if (remaining != null) state.remainingCalibratedLots.set(goodId, Math.max(0, remaining - yieldLots));
    if (laborUsed <= 1e-9) skippedGoodIds.add(goodId);
  }

  /**
   * `laborBudget` is a population-point labor allocation, not a lot count. Prior to
   * docs/plan/craft-demand-calibration.md PR 3, this method assumed labor and yield were the same
   * quantity (`actualYield = Math.min(workerFraction, maxYield)`), which forced a low-labor-
   * intensity good like Barrels to produce hundreds of lots in a single step whenever a full 1.0
   * labor slice was offered. When `applyCalibration` is on, `laborBudget` is first converted to a
   * desired lot count via the good's authored `laborPointsPerLot` (craftDemandCalibration.ts) —
   * unmapped goods keep `laborPerLot = 1`, so `desiredLots` is numerically identical to the legacy
   * `workerFraction` for them. `laborUsed` reflects only the labor actually consumed by the final,
   * fully-capped `actualYield` — zero on every early-return path (nothing was actually
   * manufactured), never the full offered `laborBudget`.
   */
  private executeManufacture(
    state: BurgProductionState,
    index: ProductionIndex,
    decision: ProductionDecision,
    laborBudget: number
  ): { yieldLots: number; laborUsed: number } {
    const { good, ingredients, byproducts, maxYield, ingredientCostPerUnit, smithingProgram } = decision.action;
    const applyCalibration = getEconomyCalibrationState().applyCalibration;
    const populationRate = Math.max(0, this.worldContext.populationRate ?? 0) || 1;
    const laborPerLot = applyCalibration ? Math.max(1e-9, laborPointsForLots(good.name, 1, populationRate)) : 1;
    const desiredLots = laborBudget / laborPerLot;
    let actualYield = Math.min(desiredLots, maxYield);
    const fundingState = this.getStateMilitaryManufacturingFund(state, decision.goalGoodId);
    const availableFunds = fundingState?.treasury ?? state.burg.treasury ?? 0;

    if (good.name === "Garments") {
      actualYield = Math.min(actualYield, getGarmentProductionHeadroom(state.market, state.inventory[good.i] || 0));
    }
    actualYield = Math.min(
      actualYield,
      getFoodProcessingProductionHeadroom(state.market, good.name, state.inventory[good.i] || 0)
    );

    // Cap production by what the Burg can actually afford. Without this, ingredient purchases below
    // had no budget check (Markets.buy() defaults to an unlimited budget) and a Burg could keep
    // manufacturing at a loss indefinitely, sinking burg.treasury unboundedly negative — mirrors the
    // budget cap fillDemandFromMarket already applies to demand-fulfillment purchases.
    if (ingredientCostPerUnit > 0) {
      const affordableYield = Math.max(0, availableFunds) / ingredientCostPerUnit;
      actualYield = Math.min(actualYield, affordableYield);
    }
    if (actualYield <= 0.001) return { yieldLots: 0, laborUsed: 0 };
    const laborUsed = actualYield * laborPerLot;

    const cultureModifier = getModifiers(good, state.burg.cell);
    // The Burg's craft guild for this Good's domain (GuildKnowledge.settleAnnual()) applies as an
    // efficiency multiplier alongside culture — docs/plan/knowledge-guild-system.md §6, §9 Phase 2.
    const domain = getCraftDomainForGood(good.name);
    const guildBonus = domain && state.burg.i ? getGuildBonus(state.burg.i, domain) : 1;
    // Mechanized spinning/weaving (docs/plan/technology-development-roadmap.md §8) stacks on top of
    // the guild-technique bonus for the whole textiles domain (Cloth/Garments/Sails), not just Cloth
    // itself — mechanization improved the whole weaving trade, and Garments/Sails are woven from it.
    const technologyBonus =
      domain === "textiles" && state.burg.state ? getMechanizedTextilesOutputMultiplier(state.burg.state) : 1;
    const produced = rn(
      actualYield *
        cultureModifier *
        guildBonus *
        technologyBonus *
        decision.laborProductivity *
        (smithingProgram?.outputMultiplier ?? 1),
      2
    );
    if (!produced) return { yieldLots: 0, laborUsed: 0 };

    // Plan all ingredient sourcing first; bail out before mutating state if any market buy fails.
    type Plan = { ingredientId: number; amount: number; fromInventory: number; deal: Deal | null };
    const plans: Plan[] = [];
    let remainingBudget = Math.max(0, availableFunds);
    for (const ingredient of ingredients) {
      const ingredientId = ingredient.goodId;
      const amount = actualYield * ingredient.amount;
      const fromInventory = Math.min(state.inventory[ingredientId] || 0, amount);
      const fromMarket = Math.max(0, amount - fromInventory);

      let deal: Deal | null = null;
      if (fromMarket > 0.01) {
        deal = Markets.buy({
          burg: state.burg,
          good: Goods.get(ingredientId)!,
          units: fromMarket,
          budget: remainingBudget,
          flow: { category: "recipeInput", guildDomain: domain, relatedGoodId: good.i }
        });
        if (!deal || deal.units < fromMarket - 0.01) {
          // Null deal: no stock or no budget left at all. Partial deal: budget ran out mid-purchase
          // (the affordableYield cap above is an estimate and can drift from execution-time prices).
          // Either way, bail out before producing more than the ingredients actually paid for.
          const message = `Failed to acquire ${rn(fromMarket, 2)} units of ${Goods.get(ingredientId)?.name} from market for production of ${good.name}`;
          ERROR && console.error(message);
          return { yieldLots: 0, laborUsed: 0 };
        }
        remainingBudget = Math.max(0, remainingBudget - deal.units * deal.price);
      }
      plans.push({ ingredientId, amount, fromInventory, deal });
    }

    const recipe: ProductionRecipeEntry[] = [];
    let materialCost = 0;
    for (const { ingredientId, amount, fromInventory, deal } of plans) {
      if (deal) {
        state.records.push({ dealId: deal.i });
        const marketCost = deal.units * deal.price;
        materialCost += marketCost;
        state.ingredientCosts += marketCost;
        if (fundingState) fundingState.treasury = rn(Math.max(0, (fundingState.treasury ?? 0) - marketCost), 2);
        else state.burg.treasury = rn((state.burg.treasury || 0) - marketCost, 2);
      }
      recipe.push({ goodId: ingredientId, units: rn(amount, 2) });

      const ingredient = Goods.get(ingredientId);
      if (ingredient) recordFoodProcessingConsumption(state.market, ingredient.name, amount);

      state.inventory[ingredientId] = Math.max(0, (state.inventory[ingredientId] || 0) - fromInventory);
      this.addDemandCoverage(state.demandCoverage, ingredientId, -fromInventory, index.demandCoverageByGood);
    }

    state.inventory[good.i] = (state.inventory[good.i] || 0) + produced;

    const producedByproducts: ProductionRecipeEntry[] = [];
    for (const byproduct of byproducts) {
      // Byproducts follow consumed input (actualYield), not master/guild-enhanced sale output.
      const units = rn(actualYield * byproduct.amount, 2);
      if (units <= 0) continue;
      const byproductGood = Goods.get(byproduct.goodId);
      if (!byproductGood) continue;
      this.depositByproductInMarket(state, byproductGood, units);
      producedByproducts.push({ goodId: byproduct.goodId, units });
    }

    if (good.name === "Wine" || good.name === "Beer") {
      const barrelIngredient = ingredients.find(ingredient => Goods.get(ingredient.goodId)?.name === "Barrels");
      const replacementCasks = produced * (barrelIngredient?.amount ?? 0);
      if (good.name === "Wine") recordWineCaskFilling(state.market, produced, replacementCasks);
      else recordBeerCaskFilling(state.market, produced, replacementCasks);
    }

    this.addDemandCoverage(state.demandCoverage, good.i, produced, index.demandCoverageByGood);

    const record: MfgRecord = { goodId: good.i, units: produced, recipe };
    if (producedByproducts.length) record.byproducts = producedByproducts;
    if (cultureModifier !== 1) record.cultureModifier = cultureModifier;
    if (smithingProgram) record.smithingProgram = smithingProgram;
    if (DEBUG.production) record.candidates = decision.candidates;
    state.records.push(record);

    if (state.burg.i && isSmithingWorkshopProductGood(good.name)) {
      SmithingWorkshopAccounting.recordProduction({
        burgId: state.burg.i,
        goodId: good.i,
        materials: recipe,
        materialCost,
        unitsProduced: produced,
        masterCharacterId: smithingProgram?.masterCharacterId ?? null
      });
    }

    return { yieldLots: produced, laborUsed };
  }

  /** A State pays only for its own military Metallurg order manufactured in one of its Burgs. */
  private getStateMilitaryManufacturingFund(
    state: Pick<BurgProductionState, "burg" | "strategicDemandByGood">,
    goalGoodId: number | null
  ): State | undefined {
    if (goalGoodId === null || !state.strategicDemandByGood.get(goalGoodId)?.stateFunded || !state.burg.state) {
      return undefined;
    }
    const fundingState = getWorldContext().pack.states[state.burg.state];
    return fundingState && !fundingState.removed ? fundingState : undefined;
  }

  /** Places unavoidable manufacturing residue directly into the local market, without a sale. */
  private depositByproductInMarket(
    state: Pick<BurgProductionState, "burg" | "market">,
    good: Good,
    units: number
  ): void {
    const marketGood = state.market.goods[good.i] ?? { stock: 0, price: good.value };
    state.market.goods[good.i] = marketGood;
    marketGood.stock = rn(marketGood.stock + units, 2);
    recordGoodFlow({
      direction: "source",
      category: "burgCraft",
      goodId: good.i,
      units,
      marketId: state.market.i,
      burgId: state.burg.i
    });
    recordFoodMarketIntake(state.market, good.name, units);

    const marketIntake = getOrCreateCumulativeGoodsSales();
    if (marketIntake) marketIntake[good.i] = rn((marketIntake[good.i] ?? 0) + units, 2);
    const marketProduction = getOrCreateMarketGoodProductionTotals();
    if (marketProduction) {
      const key = `${state.market.i}:${good.i}`;
      marketProduction[key] = rn((marketProduction[key] ?? 0) + units, 2);
    }
  }

  private sellInventoryToMarket(state: BurgProductionState, saleBudgetByBurg: ReadonlyMap<number, number>): number {
    let phaseRevenue = 0;
    const taxRate = this.getSalesTax(state.burg);
    let remainingBudget = saleBudgetByBurg.get(state.burg.i!) ?? 0;

    for (const goodIdStr in state.inventory) {
      const goodId = +goodIdStr;
      const units = state.inventory[goodId];
      if (units <= 0) continue;

      const good = Goods.get(goodId);
      if (!good || !isGoodEnabled(good)) continue;
      const deal = Markets.sell({ burg: state.burg, good, units, taxRate, budget: remainingBudget });
      if (!deal) continue;

      remainingBudget = rn(Math.max(0, remainingBudget - deal.units * deal.price), 2);

      const grossRevenue = deal.units * deal.price;
      const taxAmount = deal.tax ?? grossRevenue * taxRate;
      const revenue = grossRevenue - taxAmount;

      // Craft-domain manufactured goods split their after-tax MARGIN (not gross revenue) between
      // the domain guild's own treasury and the Burg's — private-industry vs. public-city wealth
      // (docs/plan/burg-treasury-equilibrium.md §3.1). Margin, not revenue, is what "value-added"
      // means: crediting gross revenue made a cheap-input/high-markup good (e.g. Paper off ~1-value
      // Hemp) the guild's best earner purely through sale volume, independent of how much profit it
      // actually turned. costBasis is this cycle's average local ingredient cost for the good,
      // captured alongside its price in initializeMarketPrices() (markets-generator.ts). Goods with
      // no guild domain (local-resource bonuses, unmapped goods) stay entirely burg.treasury, as before.
      const domain = state.burg.i ? getCraftDomainForGood(good.name) : null;
      let guildShare = 0;
      if (domain && revenue > 0) {
        const unitCost = state.market.goods[goodId]?.costBasis ?? 0;
        const margin = Math.max(0, revenue - unitCost * deal.units);
        guildShare = rn(margin * GUILD_PROFIT_SHARE, 2);
        GuildTreasury.creditGuildTreasury(state.burg.i!, domain, guildShare);
        phaseRevenue += revenue - guildShare;
      } else {
        phaseRevenue += revenue;
      }
      if (state.burg.i && isSmithingWorkshopProductGood(good.name)) {
        SmithingWorkshopAccounting.recordSale(state.burg.i, good.i, deal.units, revenue, guildShare);
      }
      state.records.push({ dealId: deal.i });
    }

    return phaseRevenue;
  }

  private buildRecipesByOutput(recipes: Recipe[]): Recipe[][] {
    const recipesByOutput: Recipe[][] = [];
    for (const recipe of recipes) {
      const outputId = recipe.good.i;
      const list = recipesByOutput[outputId];
      if (list) list.push(recipe);
      else recipesByOutput[outputId] = [recipe];
    }
    return recipesByOutput;
  }

  private buildMinWorkersByGood(goods: Good[], recipesByOutput: Recipe[][]): number[] {
    const minWorkersByGood: number[] = [];
    for (const good of goods) minWorkersByGood[good.i] = 1;

    for (let iteration = 0; iteration < goods.length; iteration++) {
      let changed = false;

      for (const good of goods) {
        const recipeList = recipesByOutput[good.i];
        if (!recipeList?.length) continue;

        let bestForGood = minWorkersByGood[good.i] ?? Infinity;
        for (const recipe of recipeList) {
          let workers = 1;
          for (const ingredient of recipe.ingredients) {
            const ingredientWorkers = minWorkersByGood[ingredient.goodId] ?? 1;
            workers += ingredientWorkers * ingredient.amount;
          }
          if (workers < bestForGood) bestForGood = workers;
        }

        if (bestForGood + 0.001 < (minWorkersByGood[good.i] ?? Infinity)) {
          minWorkersByGood[good.i] = bestForGood;
          changed = true;
        }
      }

      if (!changed) break;
    }

    return minWorkersByGood;
  }

  private buildDemandCoverageByGood(goods: Good[]): number[][] {
    const demandCoverageByGood: number[][] = [];

    for (const good of goods) {
      const coverage: number[] = Array(DEMAND_PRIORITY.length).fill(0);
      for (let category = 0; category < DEMAND_PRIORITY.length; category++) {
        coverage[category] = good.demandCoverage?.[DEMAND_PRIORITY[category] as DemandCategory] || 0;
      }
      demandCoverageByGood[good.i] = coverage;
    }

    return demandCoverageByGood;
  }

  private buildDemandGoodsByCategory(goods: Good[], demandCoverageByGood: number[][]): DemandGoodCandidate[][] {
    const demandGoodsByCategory: DemandGoodCandidate[][] = Array.from({ length: DEMAND_PRIORITY.length }, () => []);

    for (const good of goods) {
      const coverage = demandCoverageByGood[good.i];
      if (!coverage) continue;

      for (let category = 0; category < DEMAND_PRIORITY.length; category++) {
        const coverageWeight = coverage[category] || 0;
        if (coverageWeight <= 0) continue;
        demandGoodsByCategory[category].push({ good, goodId: good.i, coverageWeight });
      }
    }

    for (const candidates of demandGoodsByCategory) {
      candidates.sort(
        (a, b) => b.coverageWeight - a.coverageWeight || a.good.value - b.good.value || a.goodId - b.goodId
      );
    }

    return demandGoodsByCategory;
  }

  private calculateDemandCoverage(
    inventory: Record<number, number> | number[],
    demandCoverageByGood: number[][]
  ): number[] {
    const demandCoverage: number[] = Array(DEMAND_PRIORITY.length).fill(0);

    for (const goodIdStr in inventory) {
      const goodId = +goodIdStr;
      const amount = inventory[goodId] || 0;
      if (amount <= 0) continue;

      this.addDemandCoverage(demandCoverage, goodId, amount, demandCoverageByGood);
    }

    return demandCoverage;
  }

  private addDemandCoverage(
    demandCoverage: number[],
    goodId: number,
    amount: number,
    demandCoverageByGood: number[][]
  ): void {
    if (!amount) return;

    const coverage = demandCoverageByGood[goodId];
    if (!coverage) return;
    for (let category = 0; category < DEMAND_PRIORITY.length; category++) {
      const coveredAmount = coverage[category] || 0;
      if (!coveredAmount) continue;
      demandCoverage[category] += amount * coveredAmount;
    }
  }

  private fillDemandFromMarket({
    burg,
    demandCoverageByGood,
    demandGoodsByCategory,
    demandTargets,
    records
  }: {
    burg: Burg;
    demandCoverageByGood: number[][];
    demandGoodsByCategory: DemandGoodCandidate[][];
    demandTargets: number[];
    records: ProductionRecord[];
  }): void {
    const market = Markets.get(burg.market);
    if (!market) return;

    const demandCoverage = new Array(DEMAND_PRIORITY.length).fill(0);

    for (let categoryIndex = 0; categoryIndex < DEMAND_PRIORITY.length; categoryIndex++) {
      let shortage = Math.max(0, demandTargets[categoryIndex] - demandCoverage[categoryIndex]);
      if (shortage <= 0.001) continue;

      const candidates = demandGoodsByCategory[categoryIndex];
      const sortedCandidates: { candidate: DemandGoodCandidate; costPerCoverage: number }[] = [];
      for (const candidate of candidates) {
        const marketGood = market.goods[candidate.goodId];
        const stock = marketGood?.stock || 0;
        if (stock <= 0.01) continue;
        const price = Markets.customerBuyPrice(marketGood.price, market.centerBurgId, candidate.goodId);
        const costPerCoverage = price / candidate.coverageWeight;
        sortedCandidates.push({ candidate, costPerCoverage });
      }
      sortedCandidates.sort((a, b) => a.costPerCoverage - b.costPerCoverage);

      for (const { candidate } of sortedCandidates) {
        if (shortage <= 0.001) break;

        const budget = burg.treasury || 0;
        if (budget <= 0.01) break;

        const units = shortage / candidate.coverageWeight;
        const deal = Markets.buy({ burg, good: candidate.good, units, budget, flow: { category: "burgDemand" } });
        if (!deal) continue;

        records.push({ dealId: deal.i });
        const totalCost = deal.units * deal.price;
        burg.treasury = rn((burg.treasury || 0) - totalCost, 2);

        const retainedCoverageByCategory = demandCoverageByGood[candidate.goodId];
        for (let coverageCategoryIndex = 0; coverageCategoryIndex < DEMAND_PRIORITY.length; coverageCategoryIndex++) {
          const retainedCoverage = retainedCoverageByCategory[coverageCategoryIndex] || 0;
          if (!retainedCoverage) continue;
          demandCoverage[coverageCategoryIndex] += deal.units * retainedCoverage;
        }

        shortage = Math.max(0, demandTargets[categoryIndex] - demandCoverage[categoryIndex]);
      }
    }
  }

  private getDemandFocus(demandTargets: number[], demandCoverage: number[]): DemandFocus | null {
    for (let categoryIndex = 0; categoryIndex < DEMAND_PRIORITY.length; categoryIndex++) {
      const shortage = Math.max(0, demandTargets[categoryIndex] - demandCoverage[categoryIndex]);
      if (shortage <= 0.001) continue;

      return {
        category: DEMAND_PRIORITY[categoryIndex] as DemandCategory,
        categoryIndex,
        shortage
      };
    }

    return null;
  }

  private getDemandEffect(good: Good, demandFocus: DemandFocus | null, demandCoverageByGood: number[][]): DemandEffect {
    if (!demandFocus) return { multiplier: 1, category: null };

    const coverageWeight = demandCoverageByGood[good.i]?.[demandFocus.categoryIndex] || 0;
    if (!coverageWeight) return { multiplier: 1, category: null };

    const multiplier = 1 + coverageWeight * demandFocus.shortage;
    return {
      multiplier,
      category: demandFocus.category
    };
  }

  private buildImmediateManufactureCandidate(
    state: BurgProductionState,
    recipe: Recipe,
    demandEffect: DemandEffect,
    units: number,
    goalGoodId?: number
  ): { action: PlannedAction; candidate: ProductionCandidate } | null {
    let maxYield = Infinity;
    let marketCostTotal = 0;

    for (const ingredient of recipe.ingredients) {
      const quote = Markets.quoteMarket(state.market, ingredient.goodId);
      const inventoryAvailable = state.inventory[ingredient.goodId] || 0;
      const marketAvailable = quote.stock || 0;
      const totalAvailable = inventoryAvailable + marketAvailable;
      if (totalAvailable < ingredient.amount * units - 0.001) return null;
      maxYield = Math.min(maxYield, totalAvailable / ingredient.amount);
    }

    if (!Number.isFinite(maxYield) || maxYield <= 0) return null;

    const actualUnits = Math.min(units, maxYield);
    for (const ingredient of recipe.ingredients) {
      const quote = Markets.quoteMarket(state.market, ingredient.goodId);
      const inventoryAvailable = state.inventory[ingredient.goodId] || 0;
      const amountNeeded = actualUnits * ingredient.amount;
      const fromMarket = Math.max(0, amountNeeded - Math.min(inventoryAvailable, amountNeeded));
      marketCostTotal += fromMarket * quote.buyPrice;
    }

    const modifier = getModifiers(recipe.good, state.burg.cell);
    const smithingProgram = state.smithingProgramByGood.get(recipe.good.name) ?? null;
    const outQuote = Markets.quoteMarket(state.market, recipe.good.i);
    const sellValue = (outQuote.sellPrice || recipe.good.value) * modifier * (smithingProgram?.outputMultiplier ?? 1);
    const ingredientCost = marketCostTotal / actualUnits;
    const salesTaxRate = this.getSalesTax(state.burg);
    const postTaxSellValue = sellValue * (1 - salesTaxRate);
    if (!hasViableFoodProcessingMargin(recipe.good.name, sellValue, ingredientCost, salesTaxRate)) return null;
    const projectedGain = (postTaxSellValue - ingredientCost) * demandEffect.multiplier;
    const score = projectedGain;

    return {
      action: {
        good: recipe.good,
        ingredients: recipe.ingredients,
        byproducts: recipe.byproducts,
        maxYield,
        ingredientCostPerUnit: ingredientCost,
        smithingProgram
      },
      candidate: {
        goodId: recipe.good.i,
        units: actualUnits,
        sellPrice: sellValue,
        ingredientCost,
        cultureModifier: modifier,
        demandCategory: demandEffect.category,
        demandMultiplier: demandEffect.multiplier,
        score,
        ingredients: recipe.ingredients,
        byproducts: recipe.byproducts,
        goalGoodId
      }
    };
  }

  private planGoodAction(
    index: ProductionIndex,
    state: BurgProductionState,
    good: Good,
    targetUnits: number,
    stepUnits: number,
    workersLeft: number,
    demandEffect: DemandEffect,
    path: boolean[] = []
  ): GoalActionPlan | null {
    if (workersLeft <= 0 || targetUnits <= 0) return null;
    if (path[good.i]) return null;

    path[good.i] = true;

    const modifier = getModifiers(good, state.burg.cell);
    const smithingProgram = state.smithingProgramByGood.get(good.name) ?? null;
    const sellQuote = Markets.quoteMarket(state.market, good.i);
    const sellValuePerUnit = (sellQuote.sellPrice || good.value) * modifier * (smithingProgram?.outputMultiplier ?? 1);
    const totalProjectedGain = sellValuePerUnit * targetUnits * demandEffect.multiplier;

    const recipeList = index.recipesByOutput[good.i];
    if (!recipeList?.length) {
      path[good.i] = false;
      return null;
    }

    let bestPlan: GoalActionPlan | null = null;

    for (const recipe of recipeList) {
      const immediate = this.buildImmediateManufactureCandidate(
        state,
        recipe,
        demandEffect,
        Math.min(stepUnits, targetUnits),
        good.i
      );
      if (immediate && targetUnits <= workersLeft + 0.001) {
        const perUnitNetGain = immediate.candidate.score;
        const immediateMarketCost = immediate.candidate.ingredientCost * immediate.candidate.units;
        const plan: GoalActionPlan = {
          goalGoodId: good.i,
          workersNeeded: targetUnits,
          marketCost: immediateMarketCost,
          projectedGain: perUnitNetGain * targetUnits,
          normalizedGain: perUnitNetGain,
          action: immediate.action,
          candidate: immediate.candidate
        };
        if (!bestPlan || plan.normalizedGain > bestPlan.normalizedGain + 0.001) bestPlan = plan;
        continue;
      }

      let workersNeeded = targetUnits;
      let marketCost = 0;
      let feasible = true;
      let nextActionPlan: GoalActionPlan | null = null;

      for (const ingredient of recipe.ingredients) {
        const amountNeeded = targetUnits * ingredient.amount;
        let remaining = amountNeeded;

        const quote = Markets.quoteMarket(state.market, ingredient.goodId);
        const fromInventory = Math.min(remaining, state.inventory[ingredient.goodId] || 0);
        remaining -= fromInventory;

        const fromMarket = Math.min(remaining, quote.stock);
        remaining -= fromMarket;
        marketCost += fromMarket * quote.buyPrice;

        if (remaining <= 0.001) continue;

        const ingredientGood = Goods.get(ingredient.goodId);
        if (!ingredientGood) {
          feasible = false;
          break;
        }

        const lowerBoundWorkers = remaining * (index.minWorkersByGood[ingredient.goodId] ?? Infinity);
        workersNeeded += lowerBoundWorkers;
        if (workersNeeded > workersLeft + 0.001) {
          feasible = false;
          break;
        }

        const subPlan = this.planGoodAction(
          index,
          state,
          ingredientGood,
          remaining,
          stepUnits,
          workersLeft - targetUnits,
          demandEffect,
          path
        );

        if (!subPlan) {
          feasible = false;
          break;
        }

        marketCost += subPlan.marketCost;

        if (!nextActionPlan || subPlan.normalizedGain > nextActionPlan.normalizedGain + 0.001) {
          nextActionPlan = subPlan;
        }
      }

      if (!feasible || !nextActionPlan || workersNeeded > workersLeft + 0.001) continue;

      const projectedGain = totalProjectedGain - marketCost;
      const normalizedGain = workersNeeded > 0 ? projectedGain / workersNeeded : projectedGain;
      const action = nextActionPlan.action;
      const candidate: ProductionCandidate = {
        ...nextActionPlan.candidate,
        score: normalizedGain * Math.min(stepUnits, targetUnits),
        goalGoodId: good.i,
        isPreparation: nextActionPlan.goalGoodId !== good.i,
        gainPerWorker: normalizedGain,
        workersNeeded
      };

      const plan: GoalActionPlan = {
        goalGoodId: good.i,
        workersNeeded,
        marketCost,
        projectedGain,
        normalizedGain,
        action,
        candidate
      };
      if (!bestPlan || plan.normalizedGain > bestPlan.normalizedGain + 0.001) bestPlan = plan;
    }

    path[good.i] = false;
    return bestPlan;
  }

  private makeProductionDecision(
    index: ProductionIndex,
    state: BurgProductionState,
    demandTargets: number[],
    demandCoverage: number[],
    activeGoalGoodId: number | null,
    workersLeft: number,
    fraction: number,
    candidateGoods: Good[] = index.productiveGoods
  ): ProductionDecision | null {
    // Candidate list is only attached to production records when debug.production is on.
    const collectCandidates = Boolean(DEBUG.production);
    const candidates: ProductionCandidate[] = [];
    const demandFocus = this.getDemandFocus(demandTargets, demandCoverage);

    let chosenGoal: GoalActionPlan | null = null;
    let activeGoal: GoalActionPlan | null = null;
    for (const good of candidateGoods) {
      if (!isGoodManufacturableInState(good, state.burg.state || 0)) continue;
      const populationDemandEffect = this.getDemandEffect(good, demandFocus, index.demandCoverageByGood);
      const strategicDemandMultiplier = getStrategicDemandMultiplier(
        state.strategicDemandByGood.get(good.i),
        demandFocus !== null
      );
      // Phase 5 (§9.4): 1 (no-op) for every good except Wine/Raisins — see viticultureAllocation.ts.
      const viticultureAllocationMultiplier = getViticultureAllocationMultiplier(good, state.burg.i ?? 0);
      const demandEffect: DemandEffect = {
        multiplier: populationDemandEffect.multiplier * strategicDemandMultiplier * viticultureAllocationMultiplier,
        category: populationDemandEffect.category
      };
      const goalPlan = this.planGoodAction(index, state, good, fraction, fraction, workersLeft, demandEffect);
      if (!goalPlan || goalPlan.projectedGain <= 0) continue;
      if (collectCandidates) candidates.push(goalPlan.candidate);
      if (good.i === activeGoalGoodId) activeGoal = goalPlan;
      if (!chosenGoal || goalPlan.normalizedGain > chosenGoal.normalizedGain + 0.001) chosenGoal = goalPlan;
    }

    if (activeGoalGoodId !== null && chosenGoal && !activeGoal) {
      const activeGood = Goods.get(activeGoalGoodId);
      if (activeGood) {
        const populationDemandEffect = this.getDemandEffect(activeGood, demandFocus, index.demandCoverageByGood);
        const activeDemand: DemandEffect = {
          multiplier:
            populationDemandEffect.multiplier *
            getStrategicDemandMultiplier(state.strategicDemandByGood.get(activeGood.i), demandFocus !== null) *
            getViticultureAllocationMultiplier(activeGood, state.burg.i ?? 0),
          category: populationDemandEffect.category
        };
        activeGoal = this.planGoodAction(index, state, activeGood, fraction, fraction, workersLeft, activeDemand);
      }
    }

    if (activeGoal && chosenGoal && activeGoal.normalizedGain >= chosenGoal.normalizedGain) chosenGoal = activeGoal;
    if (!chosenGoal) return null;

    const goalGood = Goods.get(chosenGoal.goalGoodId);
    const appliesStrategicLabor = goalGood && state.strategicDemandByGood.has(goalGood.i);
    const laborProductivity = appliesStrategicLabor
      ? getStrategicLaborProductivity(state.strategicLaborMarket, getStrategicOccupation(goalGood))
      : 1;

    return { action: chosenGoal.action, candidates, goalGoodId: chosenGoal.goalGoodId, laborProductivity };
  }

  private buildRecipesArray(goods: Good[]): Recipe[] {
    const recipes: Recipe[] = [];
    for (const good of goods) {
      if (!good.recipes?.length) continue;
      for (const [recipeIndex, recipe] of good.recipes.entries()) {
        const entries = Object.entries(recipe).map(([goodId, amount]) => ({
          goodId: +goodId,
          amount
        }));
        if (
          !entries.length ||
          entries.some(entry => {
            const ingredient = Goods.get(entry.goodId);
            return !ingredient || !isGoodEnabled(ingredient);
          })
        ) {
          continue;
        }
        // Unscaled (multiplier 1): executeManufacture multiplies by actualYield at execution time,
        // same as it does for `entries` above.
        const byproducts = expandRecipeByproducts(good.byproducts, recipeIndex)
          .filter(entry => {
            const byproduct = Goods.get(entry.goodId);
            return Boolean(byproduct && isGoodEnabled(byproduct));
          })
          .map(entry => ({ goodId: entry.goodId, amount: entry.units }));
        recipes.push({ good, ingredients: entries, byproducts });
      }
    }
    return recipes;
  }

  // Urban production for a single burg
  getBurgProduction(burg: Burg): Record<number, number> {
    const produced: Record<number, number> = {};
    for (const record of getBurgProductionRecords(burg)) {
      if (isDealRecord(record)) continue;
      produced[record.goodId] = rn((produced[record.goodId] || 0) + record.units, 2);
      // Byproducts (e.g. Ash from a Brick/Liquor kiln, Pomace from Wine pressing) are real output
      // credited to state.inventory in executeManufacture() alongside the primary good — without
      // this, every reader of getBurgProduction() (tooltips, burg economy summary, world production
      // totals in economyTotals.ts, the Goods map layer, the Goods editor's top-producers list)
      // silently reports zero for a byproduct-only producer.
      if (isMfgRecord(record) && record.byproducts) {
        for (const byproduct of record.byproducts) {
          produced[byproduct.goodId] = rn((produced[byproduct.goodId] || 0) + byproduct.units, 2);
        }
      }
    }
    return produced;
  }
}

export const isDealRecord = (record: ProductionRecord): record is DealRecord => "dealId" in record;
export const isMfgRecord = (record: ProductionRecord): record is MfgRecord => "recipe" in record;

type PlannedAction = {
  good: Good;
  ingredients: Ingredient[];
  byproducts: Ingredient[];
  maxYield: number;
  /** Estimated market cost per unit yielded, used to cap actualYield by the Burg's treasury at execution time. */
  ingredientCostPerUnit: number;
  /** Direct master supervision for the initial forged-goods vertical slice. */
  smithingProgram: SmithingProductProgram | null;
};

type Recipe = { good: Good; ingredients: Ingredient[]; byproducts: Ingredient[] };

type ProductionIndex = {
  goods: Good[];
  demandCoverageByGood: number[][];
  demandGoodsByCategory: DemandGoodCandidate[][];
  recipesByOutput: Recipe[][];
  productiveGoods: Good[];
  /**
   * Food-tagged productiveGoods whose recipe consumes at least one `freshFood`-tagged ingredient
   * (Fish/Game/Milk/Shellfish/Grapes) — Wine, Preserved food, Cheese, Stockfish, Raisins as of
   * 2026-08-07 (docs/plan/fauna-biome-realism.md §3 Phase M) — plus, as of 2026-08-08
   * (docs/temp/0807-alcoholic.md), any other productiveGood that is a *hard* dependency of one of
   * those: an ingredient appearing in *every* recipe alternative of that preservation good, not merely
   * some of them (e.g. Barrels, the only recipe Wine has). A good used in only some alternatives
   * (Cheese's Rennet/Ash/Vinegar/Salt coagulant choices) is deliberately excluded — Cheese was designed
   * so no single one of those bottlenecks it, and giving one first-claim priority anyway let it win
   * every Phase-1 ranking step against Cheese itself with nothing capping its output to what Cheese
   * actually consumes (see buildProductionIndex()'s inline correction note for the observed effect).
   * Given first claim on craft labour in runWorkerLoop() ahead of the normal profit-ranked loop — see
   * that function's doc-comment for why.
   */
  priorityGoods: Good[];
  minWorkersByGood: number[];
};

type ProductionCycle = {
  index: ProductionIndex;
  sortedBurgs: Burg[];
  strategicLaborMarketById: ReadonlyMap<number, LaborMarket>;
  constructionOperationByBurg: ReadonlyMap<number, ConstructionOperation>;
  /** Smoothed craft/manufacturing worker figure per Burg (docs/plan/urban-employment-demand.md §3.7), mutated in place as each Burg is produced and persisted once the cycle finishes. */
  craftWorkersByBurg: Map<number, number>;
  /** Same as craftWorkersByBurg, but keyed by `craftDomainKey(burgId, domain)` (docs/plan/knowledge-guild-system.md §9 Phase 2). */
  craftDomainWorkersByKey: Map<string, number>;
  /** Market cash reserved for each Burg's own sales before production order begins. */
  saleBudgetByBurg: ReadonlyMap<number, number>;
};

/** `${burgId}:${domain}` key into craftDomainWorkersByKey / craftDomainEmploymentRecords. */
function craftDomainKey(burgId: number, domain: CraftDomainEmploymentRecord["domain"]): string {
  return `${burgId}:${domain}`;
}

function parseCraftDomainKey(key: string): [number, CraftDomainEmploymentRecord["domain"]] {
  const [burgIdStr, domain] = key.split(":");
  return [+burgIdStr, domain as CraftDomainEmploymentRecord["domain"]];
}

type CraftWorkerUsage = {
  total: number;
  byDomain: Map<CraftDomainEmploymentRecord["domain"], number>;
};

type IncrementalProductionOptions = {
  isCancelled?: () => boolean;
  onProgress?: (completed: number, total: number) => void;
  frameBudgetMs?: number;
  /**
   * Skips global trade matching and caravan spawning for this cycle (Markets.runGlobalTrade /
   * Caravans.spawnFromDeals — the data the Trade layer/animation draws from). Used only by the
   * initial "Preparing economy" Map Ready task when the user has opted to defer trade-route
   * generation until requested; the "economy.production.settle" / regenerate commands never set
   * this, so Advance Time and manual regeneration always compute trade normally.
   */
  skipGlobalTrade?: boolean;
};

type BurgProductionState = {
  burg: Burg;
  market: Market;
  population: number;
  demandTargets: number[];
  inventory: number[];
  demandCoverage: number[];
  records: ProductionRecord[];
  ingredientCosts: number;
  activeGoalGoodId: number | null;
  /** Resolved once per Burg so production candidate ranking does not repeatedly scan characters. */
  smithingProgramByGood: ReadonlyMap<string, SmithingProductProgram>;
  strategicDemandByGood: ReadonlyMap<number, StrategicProductionDemand>;
  strategicLaborMarket: LaborMarket | undefined;
  /**
   * This cycle's remaining calibrated monthly lot target, by goodId, for every good with a
   * GOOD_DEMAND_CALIBRATION row (craftDemandCalibration.ts). Empty when applyCalibration is off.
   * A good absent from this map has no calibrated cap — runWorkerLoop() falls back to its
   * pre-PR-3 behavior for it (docs/plan/craft-demand-calibration.md §3.5).
   */
  remainingCalibratedLots: Map<number, number>;
};

type DemandEffect = { multiplier: number; category: DemandCategory | null };

type DemandFocus = { category: DemandCategory; categoryIndex: number; shortage: number };

type DemandGoodCandidate = { good: Good; goodId: number; coverageWeight: number };

type ProductionDecision = {
  action: PlannedAction;
  candidates: ProductionCandidate[];
  goalGoodId: number | null;
  laborProductivity: number;
};

type GoalActionPlan = {
  goalGoodId: number;
  workersNeeded: number;
  marketCost: number;
  projectedGain: number;
  normalizedGain: number;
  action: PlannedAction;
  candidate: ProductionCandidate;
};

export const Production = new ProductionModule();
