import type { Burg } from "../../hostTypes";
import { DEBUG, ERROR, measureTickStep, rn, TIME } from "../../hostUtils";
import {
  getBurgProductionRecords,
  getConstructionOperations,
  getCraftDomainEmploymentRecords,
  getCraftEmploymentRecords,
  getDeals,
  getGoodCellColumn,
  getGoods,
  getMarkets,
  getStrategicLaborMarkets,
  getStrategicProcurementOrders,
  getWorldContext,
  setBurgProductionRecords,
  setCraftDomainEmploymentRecords,
  setCraftEmploymentRecords,
  setDeals,
  setStrategicLaborMarkets
} from "../economyContext";
import { syncBurgMarketLedgers } from "./burgMarketLedgers";
import { Caravans } from "./caravans";
import {
  type ConstructionOperation,
  ConstructionOperations,
  getConstructionProductivityMultiplier
} from "./constructionEmployment";
import { smoothCraftWorkers } from "./craftEmployment";
import { ExportStaging } from "./exportStaging";
import { hasViableFoodProcessingMargin } from "./foodProcessingEconomics";
import {
  getFoodProcessingProductionHeadroom,
  recordFoodProcessingConsumption,
  recordWineCaskFilling,
  settleFoodProcessingHouseholds
} from "./foodProcessingLedger";
import type { DemandCategory, Good } from "./goods-generator";
import { DEMAND_PRIORITY, Goods, getDemandTargets, isGoodEnabled } from "./goods-generator";
import { getGuildBonus } from "./guildKnowledge";
import {
  CRAFT_KNOWLEDGE_DOMAINS,
  type CraftDomainEmploymentRecord,
  type CraftKnowledgeDomain,
  getCraftDomainForGood
} from "./guildKnowledgeTypes";
import { GUILD_PROFIT_SHARE, GuildTreasury } from "./guildTreasury";
import { beginFlowCycleCapture, recordFlowCycleEnd } from "./marketFlowDiagnostics";
import { Markets } from "./markets-generator";
import type { Deal, Market } from "./marketTypes";
import { MerchantTradeCapital } from "./merchantTradeCapital";
import { MerchantTransportAssets } from "./merchantTransportAssets";
import { MilitaryResources } from "./militaryResources";
import { MineOperations } from "./mineOperations";
import { isMineSuppliedGoodName } from "./mineralResources";
import { Minting } from "./minting";
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
import { SmelterOperations } from "./smelterOperations";
import {
  getStrategicLaborProductivity,
  getStrategicOccupation,
  type LaborMarket,
  reconcileStrategicLaborMarkets
} from "./strategicLaborMarkets";
import {
  getStrategicDemandMultiplier,
  getStrategicProductionDemandByGood,
  type StrategicProductionDemand
} from "./strategicProductionDemand";
import { getGarmentProductionHeadroom, settleTextileHouseholdDemand } from "./textileDemand";
import { TradeSecurity } from "./tradeSecurity";
import { TransportAssetOrders } from "./transportAssetOrders";
import { advanceViticultureAllocationShares, getViticultureAllocationMultiplier } from "./viticultureAllocation";
import { VolcanicAshOperations } from "./volcanicAshOperations";

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
    frameBudgetMs = 8
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
      this.finishProductionCycle(cycle);
      return true;
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

    // A0 flow diagnostics: retail stock before rural/burg production this cycle.
    beginFlowCycleCapture();

    measureTickStep("production:rural", () => Markets.collectRuralProduction());
    measureTickStep("production:minesSmelters", () => {
      MineOperations.produceMonth();
      SmelterOperations.produceMonth();
    });
    measureTickStep("production:quarryAshConstruction", () => {
      QuarryOperations.produceMonth();
      VolcanicAshOperations.produceMonth();
      ConstructionOperations.produceMonth();
    });
    measureTickStep("production:monthlyLedgers", () => {
      Minting.settleMonthly();
      MilitaryResources.settleMonthly();
      TradeSecurity.settleMonthly();
    });
    measureTickStep("production:pricesAndLabor", () => {
      Markets.initializeMarketPrices();
      TransportAssetOrders.beginProductionCycle();
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

    return {
      index,
      sortedBurgs,
      strategicLaborMarketById,
      constructionOperationByBurg,
      craftWorkersByBurg,
      craftDomainWorkersByKey
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
    cycle.craftWorkersByBurg.set(
      burg.i,
      smoothCraftWorkers(cycle.craftWorkersByBurg.get(burg.i) ?? 0, craftWorkersUsed.total)
    );
    for (const domain of CRAFT_KNOWLEDGE_DOMAINS) {
      const key = craftDomainKey(burg.i, domain);
      const observed = craftWorkersUsed.byDomain.get(domain) ?? 0;
      const smoothed = smoothCraftWorkers(cycle.craftDomainWorkersByKey.get(key) ?? 0, observed);
      cycle.craftDomainWorkersByKey.set(key, smoothed);
    }
    // Phase 5 (docs/plan/biome-goods-producer-ecosystem.md §9.4): advances Wine/Raisins' smoothed
    // allocation shares from this cycle's market snapshot, read back next cycle by
    // getViticultureAllocationMultiplier() in makeProductionDecision() — same one-cycle-lag timing
    // as the craft employment smoothing above.
    advanceViticultureAllocationShares(burg.i, market);

    const phaseRevenue = this.sellInventoryToMarket(state);
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

    measureTickStep("production:globalTrade", () => Markets.runGlobalTrade());
    measureTickStep("production:spawnCaravans", () => Caravans.spawnFromDeals(getDeals()));
    measureTickStep("production:fillDemand", () => this.fillBurgsDemand(cycle.sortedBurgs, cycle.index));
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
          recipe.ingredients.some(ingredient => Goods.get(ingredient.goodId)?.tags.includes("freshFood"))
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
    const priorityGoods = [...preservationGoods, ...preservationIngredientGoods];

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
      strategicLaborMarket,
      strategicDemandByGood: getStrategicProductionDemandByGood(getStrategicProcurementOrders(), market.i)
    };
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
    const burgId = state.burg.i;
    const reservedTransportWork = burgId
      ? TransportAssetOrders.consumePlannedWork(burgId, state.population)
      : { total: 0, byDomain: new Map<CraftKnowledgeDomain, number>() };
    let workersUsed = reservedTransportWork.total;
    const byDomain = new Map<CraftDomainEmploymentRecord["domain"], number>();
    for (const [domain, workers] of reservedTransportWork.byDomain) byDomain.set(domain, workers);

    // Cap iterations to ceil(population) so floating-point leftovers cannot spin.
    const maxSteps = Math.max(0, Math.ceil(state.population));
    let step = 0;

    // Phase 1: preservation goods and their direct craft ingredients only, re-evaluated every step —
    // this candidate set is small (a handful of Goods), so the reevalEvery batching phase 2 needs for
    // its much larger productiveGoods list isn't worth the staleness here.
    if (index.priorityGoods.length) {
      state.activeGoalGoodId = null;
      for (; step < maxSteps; step++) {
        const workersLeft = state.population - workersUsed;
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
          index.priorityGoods
        );
        if (!decision) break; // No more affordable/available preserving work this cycle.
        state.activeGoalGoodId = decision.goalGoodId;

        this.executeManufacture(state, index, decision, workerFraction);
        workersUsed += workerFraction;

        const domain = getCraftDomainForGood(decision.action.good.name);
        if (domain) byDomain.set(domain, (byDomain.get(domain) ?? 0) + workerFraction);
      }
    }

    // Phase 2: the normal profit-ranked loop over every productive Good, for whatever labour
    // phase 1 didn't use. Fresh sticky/active-goal state so phase 1's preservation pick doesn't
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
        stickyDecision = this.makeProductionDecision(
          index,
          state,
          state.demandTargets,
          state.demandCoverage,
          state.activeGoalGoodId,
          workersLeft,
          workerFraction
        );
        if (!stickyDecision) break;
        state.activeGoalGoodId = stickyDecision.goalGoodId;
      }

      this.executeManufacture(state, index, stickyDecision, workerFraction);
      workersUsed += workerFraction;

      const domain = getCraftDomainForGood(stickyDecision.action.good.name);
      if (domain) byDomain.set(domain, (byDomain.get(domain) ?? 0) + workerFraction);
    }

    return { total: workersUsed, byDomain };
  }

  private executeManufacture(
    state: BurgProductionState,
    index: ProductionIndex,
    decision: ProductionDecision,
    workerFraction: number
  ): void {
    const { good, ingredients, maxYield, ingredientCostPerUnit } = decision.action;
    let actualYield = Math.min(workerFraction, maxYield);

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
      const affordableYield = Math.max(0, state.burg.treasury || 0) / ingredientCostPerUnit;
      actualYield = Math.min(actualYield, affordableYield);
    }
    if (actualYield <= 0.001) return;

    const cultureModifier = getModifiers(good, state.burg.cell);
    // The Burg's craft guild for this Good's domain (GuildKnowledge.settleAnnual()) applies as an
    // efficiency multiplier alongside culture — docs/plan/knowledge-guild-system.md §6, §9 Phase 2.
    const domain = getCraftDomainForGood(good.name);
    const guildBonus = domain && state.burg.i ? getGuildBonus(state.burg.i, domain) : 1;
    const produced = rn(actualYield * cultureModifier * guildBonus * decision.laborProductivity, 2);
    if (!produced) return;

    // Plan all ingredient sourcing first; bail out before mutating state if any market buy fails.
    type Plan = { ingredientId: number; amount: number; fromInventory: number; deal: Deal | null };
    const plans: Plan[] = [];
    let remainingBudget = Math.max(0, state.burg.treasury || 0);
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
          budget: remainingBudget
        });
        if (!deal || deal.units < fromMarket - 0.01) {
          // Null deal: no stock or no budget left at all. Partial deal: budget ran out mid-purchase
          // (the affordableYield cap above is an estimate and can drift from execution-time prices).
          // Either way, bail out before producing more than the ingredients actually paid for.
          const message = `Failed to acquire ${rn(fromMarket, 2)} units of ${Goods.get(ingredientId)?.name} from market for production of ${good.name}`;
          ERROR && console.error(message);
          return;
        }
        remainingBudget = Math.max(0, remainingBudget - deal.units * deal.price);
      }
      plans.push({ ingredientId, amount, fromInventory, deal });
    }

    const recipe: ProductionRecipeEntry[] = [];
    for (const { ingredientId, amount, fromInventory, deal } of plans) {
      if (deal) {
        state.records.push({ dealId: deal.i });
        const marketCost = deal.units * deal.price;
        state.ingredientCosts += marketCost;
        state.burg.treasury = rn((state.burg.treasury || 0) - marketCost, 2);
      }
      recipe.push({ goodId: ingredientId, units: rn(amount, 2) });

      const ingredient = Goods.get(ingredientId);
      if (ingredient) recordFoodProcessingConsumption(state.market, ingredient.name, amount);

      state.inventory[ingredientId] = Math.max(0, (state.inventory[ingredientId] || 0) - fromInventory);
      this.addDemandCoverage(state.demandCoverage, ingredientId, -fromInventory, index.demandCoverageByGood);
    }

    state.inventory[good.i] = (state.inventory[good.i] || 0) + produced;

    if (good.name === "Wine") {
      const barrelIngredient = ingredients.find(ingredient => Goods.get(ingredient.goodId)?.name === "Barrels");
      recordWineCaskFilling(state.market, produced, produced * (barrelIngredient?.amount ?? 0));
    }

    this.addDemandCoverage(state.demandCoverage, good.i, produced, index.demandCoverageByGood);

    const record: MfgRecord = { goodId: good.i, units: produced, recipe };
    if (cultureModifier !== 1) record.cultureModifier = cultureModifier;
    if (DEBUG.production) record.candidates = decision.candidates;
    state.records.push(record);
  }

  private sellInventoryToMarket(state: BurgProductionState): number {
    let phaseRevenue = 0;
    const taxRate = this.getSalesTax(state.burg);

    for (const goodIdStr in state.inventory) {
      const goodId = +goodIdStr;
      const units = state.inventory[goodId];
      if (units <= 0) continue;

      const good = Goods.get(goodId);
      if (!good || !isGoodEnabled(good)) continue;
      const deal = Markets.sell({ burg: state.burg, good, units, taxRate });
      if (!deal) continue;

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
      if (domain && revenue > 0) {
        const unitCost = state.market.goods[goodId]?.costBasis ?? 0;
        const margin = Math.max(0, revenue - unitCost * deal.units);
        const guildShare = rn(margin * GUILD_PROFIT_SHARE, 2);
        GuildTreasury.creditGuildTreasury(state.burg.i!, domain, guildShare);
        phaseRevenue += revenue - guildShare;
      } else {
        phaseRevenue += revenue;
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
        const deal = Markets.buy({ burg, good: candidate.good, units, budget });
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
    const outQuote = Markets.quoteMarket(state.market, recipe.good.i);
    const sellValue = (outQuote.sellPrice || recipe.good.value) * modifier;
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
        maxYield,
        ingredientCostPerUnit: ingredientCost
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
    const sellQuote = Markets.quoteMarket(state.market, good.i);
    const sellValuePerUnit = (sellQuote.sellPrice || good.value) * modifier;
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
      for (const recipe of good.recipes) {
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
        recipes.push({ good, ingredients: entries });
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
    }
    return produced;
  }
}

export const isDealRecord = (record: ProductionRecord): record is DealRecord => "dealId" in record;
export const isMfgRecord = (record: ProductionRecord): record is MfgRecord => "recipe" in record;

type PlannedAction = {
  good: Good;
  ingredients: Ingredient[];
  maxYield: number;
  /** Estimated market cost per unit yielded, used to cap actualYield by the Burg's treasury at execution time. */
  ingredientCostPerUnit: number;
};

type Recipe = { good: Good; ingredients: Ingredient[] };

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
  strategicDemandByGood: ReadonlyMap<number, StrategicProductionDemand>;
  strategicLaborMarket: LaborMarket | undefined;
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
