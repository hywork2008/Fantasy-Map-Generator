/**
 * First-wave steam industry: mine pumps, railway links, and municipal waterworks.
 * docs/plan/steam-industrial-implementation.md Phases 0 / 3A / 3B.
 */

import { Routes } from "../../../generators/routes-generator";
import { getTechnologyStage } from "../../../generators/technologyProgress";
import { isTechnologyStageAtLeast } from "../../../generators/technologyTypes";
import { rn } from "../../hostUtils";
import {
  getGoods,
  getMarkets,
  getRailwayLinks,
  getSimulationYear,
  getSteamInstallationsLastSettledYear,
  getUrbanWaterSystems,
  getWorldContext,
  setRailwayLinks,
  setUrbanWaterSystems
} from "../economyContext";
import { isGoodEnabled } from "./goods-generator";
import { Markets } from "./markets-generator";
import { SteamInstallations } from "./steamInstallations";
import type { RailwayLink, SteamWaterworks } from "./steamTypes";

const RAIL_COAL_PER_LINK = 1.2;
const WATERWORKS_COAL = 1.5;
const WATERWORKS_LIFTING_MIN = 0.15;

function consumeNamed(marketId: number, name: string, amount: number): number {
  const good = getGoods().find(entry => entry.name === name);
  if (!good || !isGoodEnabled(good)) return 0;
  return Markets.consumeForSmelting(marketId, good.i, amount, 0.5);
}

/** Resolves a market to its center burg's cell, for laying track between two markets. */
function marketBurgCell(marketId: number, markets: ReturnType<typeof getMarkets>): number | undefined {
  const market = markets.find(entry => entry.i === marketId);
  if (!market) return undefined;
  const burg = getWorldContext().pack.burgs?.[market.centerBurgId];
  if (!burg?.i || burg.removed) return undefined;
  return burg.cell;
}

/** Returns true when this call laid new "railways" route track (docs/plan/steam-industrial-implementation.md §7). */
function settleRailways(year: number): boolean {
  const states = getWorldContext().pack.states ?? [];
  const markets = getMarkets();
  const links = [...getRailwayLinks()];
  let nextId = links.reduce((max, link) => Math.max(max, link.i), 0) + 1;

  for (const state of states) {
    if (!state?.i || state.removed) continue;
    const stage = getTechnologyStage("railwayOperations", state.i);
    if (!isTechnologyStageAtLeast(stage, "demonstrated")) continue;

    const stateMarkets = markets.filter(market => {
      const burg = getWorldContext().pack.burgs?.[market.centerBurgId];
      return burg && !burg.removed && burg.state === state.i;
    });
    if (stateMarkets.length < 2) continue;

    const target = isTechnologyStageAtLeast(stage, "adopted") ? Math.min(stateMarkets.length - 1, 3) : 1;
    const existing = links.filter(link => link.stateId === state.i);
    if (existing.length < target) {
      for (let i = 0; i < stateMarkets.length && existing.length + 1 <= target; i++) {
        for (let j = i + 1; j < stateMarkets.length; j++) {
          const from = stateMarkets[i].i;
          const to = stateMarkets[j].i;
          if (
            links.some(
              link =>
                link.stateId === state.i &&
                ((link.fromMarketId === from && link.toMarketId === to) ||
                  (link.fromMarketId === to && link.toMarketId === from))
            )
          ) {
            continue;
          }
          const created: RailwayLink = {
            i: nextId++,
            stateId: state.i,
            fromMarketId: from,
            toMarketId: to,
            utilization: 0,
            lastFueledYear: year
          };
          links.push(created);
          existing.push(created);
          break;
        }
      }
    }
  }

  let networkChanged = false;
  for (const link of links) {
    // Materialize the visible/pathable "railways" route once, the first year the
    // link exists. Older links loaded from a save without this field get track
    // laid retroactively instead of staying an invisible economic-only edge.
    if (!link.materialized) {
      const fromCell = marketBurgCell(link.fromMarketId, markets);
      const toCell = marketBurgCell(link.toMarketId, markets);
      if (fromCell !== undefined && toCell !== undefined && Routes.connectRailway(fromCell, toCell, link.stateId)) {
        link.materialized = true;
        networkChanged = true;
      }
    }

    const coal = consumeNamed(link.fromMarketId, "Coal", RAIL_COAL_PER_LINK);
    link.utilization = rn(Math.min(1, coal / RAIL_COAL_PER_LINK), 4);
    link.lastFueledYear = year;
  }
  setRailwayLinks(links);
  return networkChanged;
}

function settleWaterworks(year: number): void {
  const systems = getUrbanWaterSystems();
  if (!systems.length) return;
  const burgs = getWorldContext().pack.burgs ?? [];
  let changed = false;

  for (const system of systems) {
    const burg = burgs[system.burgId];
    if (!burg?.i || burg.removed || !burg.state) continue;
    const stage = getTechnologyStage("municipalSteamPumping", burg.state);
    if (!isTechnologyStageAtLeast(stage, "demonstrated")) continue;
    if ((system.waterLifting ?? 0) < WATERWORKS_LIFTING_MIN) continue;

    const marketId = burg.market ?? 0;
    if (!marketId) continue;
    const coal = consumeNamed(marketId, "Coal", WATERWORKS_COAL);
    const utilization = rn(Math.min(1, coal / WATERWORKS_COAL), 4);
    const works: SteamWaterworks = {
      burgId: system.burgId,
      active: utilization > 0.25,
      engines: 1,
      condition: Math.max(0.2, (system.steamWaterworks?.condition ?? 1) * 0.98 + utilization * 0.04),
      lastFueledYear: year,
      annualCoalUsed: coal,
      utilization
    };
    system.steamWaterworks = works;
    if (works.active) {
      system.serviceWaterCapacity = rn(Math.min(1, (system.serviceWaterCapacity ?? 0) + 0.12 * utilization), 4);
      system.healthPressure = rn(Math.max(0, (system.healthPressure ?? 0) - 0.08 * utilization), 4);
    }
    changed = true;
  }
  if (changed) setUrbanWaterSystems(systems);
}

export class SteamIndustryModule {
  /**
   * Settles this year's steam industry (mine pumps / railway links / waterworks), at most
   * once per simulation year (self-gated on `getSteamInstallationsLastSettledYear`). Returns
   * true when `settleRailways` materialized new "railways" route track this call, so the
   * caller can invalidate the `map.networks` topic and redraw the map.
   */
  settleAnnual(): boolean {
    const year = getSimulationYear();
    if (getSteamInstallationsLastSettledYear() === year) return false;
    SteamInstallations.settleAnnual();
    const railwayNetworkChanged = settleRailways(year);
    settleWaterworks(year);
    return railwayNetworkChanged;
  }
}

export const SteamIndustry = new SteamIndustryModule();
