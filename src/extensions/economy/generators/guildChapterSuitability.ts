import type { Burg } from "../../hostTypes";
import {
  getAcademyKnowledgeStocks,
  getConstructionOperations,
  getCraftDomainEmploymentRecords,
  getMarkets,
  getMineOperations,
  getMineralDeposits,
  getQuarryOperations,
  getSmelterOperations,
  getWorldContext
} from "../economyContext";
import type { CraftKnowledgeDomain } from "./guildKnowledgeTypes";

export interface GuildChapterSuitabilityContext {
  readonly burgsByState: ReadonlyMap<number, readonly number[]>;
  readonly mineWorkersByBurg: ReadonlyMap<number, number>;
  readonly smelterWorkersByBurg: ReadonlyMap<number, number>;
  readonly oreNearBurg: ReadonlySet<number>;
  readonly quarryWorkersByBurg: ReadonlyMap<number, number>;
  readonly quarryCandidateScoreByBurg: ReadonlyMap<number, number>;
  readonly constructionDemandByBurg: ReadonlyMap<number, number>;
  readonly craftWorkersByBurgDomain: ReadonlyMap<string, number>;
  readonly marketUrbanSizeByBurg: ReadonlyMap<number, number>;
  readonly forestAccessByBurg: ReadonlyMap<number, number>;
  readonly academyAdminByBurg: ReadonlyMap<number, number>;
  readonly capitalIds: ReadonlySet<number>;
  readonly portIds: ReadonlySet<number>;
  readonly citadelIds: ReadonlySet<number>;
  readonly wallsIds: ReadonlySet<number>;
  readonly plazaIds: ReadonlySet<number>;
  readonly logPopByBurg: ReadonlyMap<number, number>;
}

const WORKER_SATURATION = 6;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function addTo(map: Map<number, number>, key: number, value: number): void {
  map.set(key, (map.get(key) ?? 0) + value);
}

function craftKey(burgId: number, domain: CraftKnowledgeDomain): string {
  return `${burgId}:${domain}`;
}

function isLiveBurg(burg: Burg | undefined): burg is Burg & { i: number; state: number } {
  return Boolean(burg?.i && burg.state && !burg.removed);
}

/**
 * Collects only existing economy and map signals. It intentionally does not import Shipbuilding
 * or create new geology: guild placement remains an Economy-owned read-only interpretation.
 */
export function buildGuildChapterSuitabilityContext(): GuildChapterSuitabilityContext {
  const world = getWorldContext();
  const { burgs, cells, states = [] } = world.pack;
  const burgsByState = new Map<number, number[]>();
  const mineWorkersByBurg = new Map<number, number>();
  const smelterWorkersByBurg = new Map<number, number>();
  const quarryWorkersByBurg = new Map<number, number>();
  const quarryCandidateScoreByBurg = new Map<number, number>();
  const constructionDemandByBurg = new Map<number, number>();
  const craftWorkersByBurgDomain = new Map<string, number>();
  const marketUrbanSizeByBurg = new Map<number, number>();
  const forestAccessByBurg = new Map<number, number>();
  const academyAdminByBurg = new Map<number, number>();
  const capitalIds = new Set<number>();
  const portIds = new Set<number>();
  const citadelIds = new Set<number>();
  const wallsIds = new Set<number>();
  const plazaIds = new Set<number>();
  const logPopByBurg = new Map<number, number>();

  for (const burg of burgs) {
    if (!isLiveBurg(burg)) continue;
    const stateBurgs = burgsByState.get(burg.state) ?? [];
    stateBurgs.push(burg.i);
    burgsByState.set(burg.state, stateBurgs);
    if (burg.capital || states[burg.state]?.capital === burg.i) capitalIds.add(burg.i);
    if (burg.port) portIds.add(burg.i);
    if (burg.citadel) citadelIds.add(burg.i);
    if (burg.walls) wallsIds.add(burg.i);
    if (burg.plaza) plazaIds.add(burg.i);
  }

  for (const operation of getMineOperations()) {
    if (operation.active) addTo(mineWorkersByBurg, operation.burgId, operation.workers);
  }
  for (const operation of getSmelterOperations()) {
    if (operation.active) addTo(smelterWorkersByBurg, operation.burgId, operation.workers);
  }
  for (const operation of getQuarryOperations()) {
    if (!operation.active) continue;
    addTo(quarryWorkersByBurg, operation.burgId, operation.quarryWorkers);
    quarryCandidateScoreByBurg.set(
      operation.burgId,
      Math.max(quarryCandidateScoreByBurg.get(operation.burgId) ?? 0, operation.stoneRatio)
    );
  }
  for (const operation of getConstructionOperations()) {
    if (!operation.active) continue;
    constructionDemandByBurg.set(operation.burgId, clamp01(1 - operation.buildingStock));
  }
  for (const record of getCraftDomainEmploymentRecords()) {
    const key = craftKey(record.burgId, record.domain);
    craftWorkersByBurgDomain.set(key, (craftWorkersByBurgDomain.get(key) ?? 0) + record.workers);
  }
  for (const stock of getAcademyKnowledgeStocks()) {
    if (stock.domain === "administration") academyAdminByBurg.set(stock.burgId, clamp01(stock.stock));
  }

  const markets = getMarkets();
  for (const burg of burgs) {
    if (!isLiveBurg(burg)) continue;
    const market = markets.find(candidate => candidate.i === burg.market);
    if (market) marketUrbanSizeByBurg.set(burg.i, market.centerBurgId === burg.i ? 1 : 0.55);
  }

  const oreNearBurg = new Set<number>();
  const discoveredCells = new Set(
    getMineralDeposits()
      .filter(deposit => deposit.discovered && !deposit.exhausted)
      .map(deposit => deposit.cell)
  );
  for (const burg of burgs) {
    if (!isLiveBurg(burg)) continue;
    const localCells = [burg.cell, ...(cells.c?.[burg.cell] ?? [])];
    if (localCells.some(cellId => discoveredCells.has(cellId))) oreNearBurg.add(burg.i);

    const neighbors = [burg.cell, ...(cells.c?.[burg.cell] ?? [])];
    const forestCells = neighbors.filter(cellId => {
      const biome = cells.biomeCode?.[cellId] ?? 0;
      return world.biomesData.tags?.[biome]?.includes("forest") ?? false;
    });
    forestAccessByBurg.set(burg.i, neighbors.length ? forestCells.length / neighbors.length : 0);
  }

  for (const [stateId, burgIds] of burgsByState) {
    const maxLogPopulation = Math.max(1, ...burgIds.map(id => Math.log1p(Math.max(0, burgs[id]?.population ?? 0))));
    for (const burgId of burgIds) {
      logPopByBurg.set(burgId, Math.log1p(Math.max(0, burgs[burgId]?.population ?? 0)) / maxLogPopulation);
    }
    // Keep the state id read in this loop to make the grouping invariant explicit.
    void stateId;
  }

  return {
    burgsByState,
    mineWorkersByBurg,
    smelterWorkersByBurg,
    oreNearBurg,
    quarryWorkersByBurg,
    quarryCandidateScoreByBurg,
    constructionDemandByBurg,
    craftWorkersByBurgDomain,
    marketUrbanSizeByBurg,
    forestAccessByBurg,
    academyAdminByBurg,
    capitalIds,
    portIds,
    citadelIds,
    wallsIds,
    plazaIds,
    logPopByBurg
  };
}

/** Scores a burg's organizational suitability for one formal guild hall, from 0 to 1. */
export function scoreGuildChapterSuitability(
  burgId: number,
  domain: CraftKnowledgeDomain,
  context: GuildChapterSuitabilityContext
): number {
  const workers = (value: number | undefined): number => clamp01((value ?? 0) / WORKER_SATURATION);
  const craft = (target: CraftKnowledgeDomain): number =>
    workers(context.craftWorkersByBurgDomain.get(craftKey(burgId, target)));
  const mine = workers(context.mineWorkersByBurg.get(burgId));
  const smelter = workers(context.smelterWorkersByBurg.get(burgId));
  const quarry = workers(context.quarryWorkersByBurg.get(burgId));
  const market = context.marketUrbanSizeByBurg.get(burgId) ?? 0;
  const forest = context.forestAccessByBurg.get(burgId) ?? 0;
  const population = context.logPopByBurg.get(burgId) ?? 0;
  const capital = context.capitalIds.has(burgId) ? 1 : 0;
  const port = context.portIds.has(burgId) ? 1 : 0;
  const oreNear = context.oreNearBurg.has(burgId) ? 1 : 0;
  const fortified = context.citadelIds.has(burgId) || context.wallsIds.has(burgId) ? 1 : 0;
  const plaza = context.plazaIds.has(burgId) ? 1 : 0;

  switch (domain) {
    case "metallurgy":
      return clamp01(
        0.35 * smelter + 0.25 * mine + 0.2 * oreNear + 0.1 * craft(domain) + 0.05 * capital + 0.05 * population
      );
    case "woodworking":
      return clamp01(0.4 * forest + 0.2 * port + 0.2 * craft(domain) + 0.15 * market + 0.05 * population);
    case "masonry":
      return clamp01(
        0.3 * quarry +
          0.2 * (context.quarryCandidateScoreByBurg.get(burgId) ?? 0) +
          0.2 * (context.constructionDemandByBurg.get(burgId) ?? 0) +
          0.15 * fortified +
          0.1 * craft(domain) +
          0.05 * population
      );
    case "textiles":
      return clamp01(0.35 * craft(domain) + 0.25 * market + 0.15 * plaza + 0.15 * population + 0.1 * capital);
    case "leather":
      return clamp01(0.4 * craft(domain) + 0.25 * market + 0.2 * population + 0.15 * forest);
    case "glassware":
      return clamp01(0.3 * craft(domain) + 0.25 * port + 0.2 * capital + 0.15 * market + 0.1 * population);
    case "instruments":
      return clamp01(0.45 * capital + 0.35 * population + 0.2 * market);
    case "printing":
      return clamp01(
        0.3 * (context.academyAdminByBurg.get(burgId) ?? 0) + 0.25 * capital + 0.25 * craft(domain) + 0.2 * market
      );
  }
}
