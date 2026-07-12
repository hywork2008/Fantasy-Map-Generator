import FlatQueue from "flatqueue";

import type { Burg, PackedGraph } from "../../hostTypes";
import { openDialog } from "../../hostUi";
import { downloadFile, formatPrice, getFileName, rn } from "../../hostUtils";
import { getWorldContext } from "../economyContext";
import { Goods } from "../generators/goods-generator";
import { Markets } from "../generators/markets-generator";
import type { Market } from "../generators/marketTypes";
import { isMarketTradePermitted } from "../generators/merchantOrganizations";
import { TradeAnimation } from "../generators/trade-animation";
import {
  estimateSpeculativeTrade,
  getNetTradeProfit,
  getTransportCost,
  isGoodTradePermitted,
  MIN_TRADE_PROFIT
} from "../generators/tradeOpportunityEstimator";
import { calculateRouteDurationFromDistances } from "../generators/tradeRouteDuration";
import { clearHighlight, highlight } from "../renderers/draw-trade-animation";
import {
  getMarketTradeOpportunitiesState,
  type MarketTradeOpportunityOption,
  type MarketTradeOpportunityRow,
  type MarketTradeOpportunitySort,
  setMarketTradeOpportunitiesState
} from "../store/marketTradeOpportunitiesState";

const TRADE_ROUTE_GROUPS = new Set(["roads", "trails", "searoutes"]);

type TradeRouteKind = "land" | "sea";

interface TradeRouteEdge {
  readonly distance: number;
  readonly kind: TradeRouteKind;
}

interface TradeRouteGraph {
  readonly adjacency: Map<number, Map<number, TradeRouteEdge>>;
}

interface TradeRouteDistance {
  readonly total: number;
  readonly land: number;
  readonly sea: number;
  readonly transfers: number;
}

export function open(selectedGoodId?: number): void {
  const goods = getWorldContext().pack.goods || [];
  const options: MarketTradeOpportunityOption[] = goods.map(good => ({ goodId: good.i, goodName: good.name }));
  const currentSelectedGoodId = getMarketTradeOpportunitiesState().selectedGoodId;
  const nextSelectedGoodId = selectedGoodId ?? currentSelectedGoodId ?? options[0]?.goodId ?? null;

  setMarketTradeOpportunitiesState({
    options,
    selectedGoodId: nextSelectedGoodId,
    sortBy: getMarketTradeOpportunitiesState().sortBy,
    sortDirection: getMarketTradeOpportunitiesState().sortDirection
  });

  refresh();
  openDialog("marketTradeOpportunities");
}

export function close(): void {
  setMarketTradeOpportunitiesState({ rows: [] });
  clearHighlight();
}

export function refresh(): void {
  const selectedGoodId = getMarketTradeOpportunitiesState().selectedGoodId;
  if (selectedGoodId === null) {
    setMarketTradeOpportunitiesState({ rows: [] });
    return;
  }

  const good = Goods.get(selectedGoodId);
  if (!good) {
    setMarketTradeOpportunitiesState({ rows: [] });
    return;
  }
  const goodId = selectedGoodId;

  const rows: MarketTradeOpportunityRow[] = [];
  const world = getWorldContext();
  const markets = world.pack.markets || [];
  const mapDiagonal = Math.hypot(world.graphWidth, world.graphHeight) || 1;
  const tradeRouteGraph = buildTradeRouteGraph(world.pack);
  const hasTradeRoutes = tradeRouteGraph.adjacency.size > 0;
  const speculativeRows: MarketTradeOpportunityRow[] = [];

  for (const source of markets) {
    const sourceGood = source.goods[goodId];
    if (!sourceGood || sourceGood.stock <= 0) continue;

    const sourceCenter = world.pack.burgs[source.centerBurgId];
    if (!sourceCenter) continue;

    for (const target of markets) {
      if (target.i === source.i) continue;
      const targetGood = target.goods[goodId];
      if (!targetGood) continue;

      const targetCenter = world.pack.burgs[target.centerBurgId];
      if (!targetCenter) continue;

      const buyPrice = Markets.customerBuyPrice(sourceGood.price, source.centerBurgId, goodId);
      const sellPrice = Markets.customerSellPrice(targetGood.price, target.centerBurgId, goodId);
      const distance = getTradeDistance(sourceCenter, targetCenter, tradeRouteGraph, hasTradeRoutes);
      if (distance === null) continue;
      const durationDays = calculateRouteDurationFromDistances(
        distance.land * world.distanceScale,
        distance.sea * world.distanceScale,
        distance.transfers
      );
      if (!isGoodTradePermitted(good, durationDays) || !isMarketTradePermitted(source, target, durationDays)) continue;

      const transportCost = getTransportCost(distance.total, mapDiagonal) * good.value;
      const unitProfit = rn(sellPrice - buyPrice - transportCost, 2);
      if (unitProfit <= 0) {
        const estimate = estimateSpeculativeTrade({
          good,
          sourceMarketId: source.i,
          targetMarketId: target.i,
          sourceGood,
          targetGood,
          sourcePopulation: getMarketPopulation(source.i),
          targetPopulation: getMarketPopulation(target.i),
          distance: distance.total,
          mapDiagonal,
          durationDays,
          buyPrice,
          sellPrice
        });
        if (estimate) {
          speculativeRows.push(
            createRow({
              source,
              target,
              distance,
              buyPrice: estimate.buyPrice,
              sellPrice: estimate.sellPrice,
              transportCost: estimate.transportCost,
              unitProfit: estimate.unitProfit,
              maxUnits: estimate.maxUnits,
              totalProfit: estimate.totalProfit
            })
          );
        }
        continue;
      }

      const maxUnits = rn(sourceGood.stock, 2);
      const totalProfit = getNetTradeProfit(unitProfit, maxUnits, durationDays);
      if (totalProfit < MIN_TRADE_PROFIT) continue;
      rows.push(
        createRow({
          source,
          target,
          distance,
          buyPrice: rn(buyPrice, 2),
          sellPrice: rn(sellPrice, 2),
          transportCost: rn(transportCost, 2),
          unitProfit,
          maxUnits,
          totalProfit: rn(totalProfit, 2)
        })
      );
    }
  }

  const displayRows = rows.length ? rows : speculativeRows;
  displayRows.sort((a, b) => b.totalProfit - a.totalProfit || b.unitProfit - a.unitProfit);
  setMarketTradeOpportunitiesState({ rows: displayRows.slice(0, 200) });
}

function createRow({
  source,
  target,
  distance,
  buyPrice,
  sellPrice,
  transportCost,
  unitProfit,
  maxUnits,
  totalProfit
}: {
  source: Market;
  target: Market;
  distance: TradeRouteDistance;
  buyPrice: number;
  sellPrice: number;
  transportCost: number;
  unitProfit: number;
  maxUnits: number;
  totalProfit: number;
}): MarketTradeOpportunityRow {
  const world = getWorldContext();
  return {
    sourceMarketId: source.i,
    targetMarketId: target.i,
    sourceBurgId: source.centerBurgId,
    targetBurgId: target.centerBurgId,
    sourceMarketName: Markets.getName(source),
    targetMarketName: Markets.getName(target),
    distance: rn(distance.total * world.distanceScale),
    landDistance: rn(distance.land * world.distanceScale),
    seaDistance: rn(distance.sea * world.distanceScale),
    transferCount: distance.transfers,
    buyPrice,
    sellPrice,
    transportCost,
    unitProfit,
    maxUnits,
    totalProfit
  };
}

function buildTradeRouteGraph(pack: PackedGraph): TradeRouteGraph {
  const adjacency = new Map<number, Map<number, TradeRouteEdge>>();

  const addEdge = (from: number, to: number, edge: TradeRouteEdge) => {
    if (!adjacency.has(from)) adjacency.set(from, new Map());
    const neighbors = adjacency.get(from)!;
    const existing = neighbors.get(to);
    if (existing === undefined || edge.distance < existing.distance) neighbors.set(to, edge);
  };

  for (const route of pack.routes ?? []) {
    if (!TRADE_ROUTE_GROUPS.has(route.group)) continue;
    const kind: TradeRouteKind = route.group === "searoutes" ? "sea" : "land";

    const points = route.points;
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, y1, cell1] = points[i];
      const [x2, y2, cell2] = points[i + 1];
      if (cell1 === cell2) continue;

      const dist = Math.hypot(x2 - x1, y2 - y1);
      const edge = { distance: dist, kind };
      addEdge(cell1, cell2, edge);
      addEdge(cell2, cell1, edge);
    }
  }

  return { adjacency };
}

function getTradeDistance(
  source: Burg,
  target: Burg,
  tradeRouteGraph: TradeRouteGraph,
  hasTradeRoutes: boolean
): TradeRouteDistance | null {
  const routeDistance = findTradeRouteDistance(tradeRouteGraph, source.cell, target.cell);
  if (routeDistance !== null) return routeDistance;
  if (hasTradeRoutes) return null;
  const fallbackDistance = getStraightLineApproximation(source, target);
  return { total: fallbackDistance, land: fallbackDistance, sea: 0, transfers: 0 };
}

function findTradeRouteDistance(graph: TradeRouteGraph, start: number, end: number): TradeRouteDistance | null {
  if (start === end) return { total: 0, land: 0, sea: 0, transfers: 0 };
  if (!graph.adjacency.has(start) || !graph.adjacency.has(end)) return null;

  const dist = new Map<number, number>();
  const from = new Map<number, number>();
  const fromEdge = new Map<number, TradeRouteEdge>();
  dist.set(start, 0);

  const queue = new FlatQueue<number>();
  queue.push(start, 0);
  const settled = new Set<number>();

  while (queue.length) {
    const currentDist = queue.peekValue();
    const current = queue.pop();
    if (current === undefined || currentDist === undefined) break;
    if (settled.has(current)) continue;
    settled.add(current);
    if (current === end) return summarizeTradeRoute(currentDist, end, from, fromEdge);

    const neighbors = graph.adjacency.get(current);
    if (!neighbors) continue;

    for (const [next, edge] of neighbors) {
      if (settled.has(next)) continue;
      const total = currentDist + edge.distance;
      if (total < (dist.get(next) ?? Infinity)) {
        dist.set(next, total);
        from.set(next, current);
        fromEdge.set(next, edge);
        queue.push(next, total);
      }
    }
  }

  return null;
}

function summarizeTradeRoute(
  total: number,
  end: number,
  from: Map<number, number>,
  fromEdge: Map<number, TradeRouteEdge>
): TradeRouteDistance {
  const edges: TradeRouteEdge[] = [];
  let node = end;
  while (from.has(node)) {
    const edge = fromEdge.get(node);
    if (edge) edges.push(edge);
    node = from.get(node)!;
  }
  edges.reverse();

  let land = 0;
  let sea = 0;
  let transfers = 0;
  let previousKind: TradeRouteKind | null = null;

  for (const edge of edges) {
    if (edge.kind === "sea") sea += edge.distance;
    else land += edge.distance;

    if (previousKind !== null && edge.kind !== previousKind) transfers++;
    previousKind = edge.kind;
  }

  return { total, land, sea, transfers };
}

function getStraightLineApproximation(source: { x: number; y: number }, target: { x: number; y: number }): number {
  const dx = Math.abs(source.x - target.x);
  const dy = Math.abs(source.y - target.y);
  return dx > dy ? dx + 0.414 * dy : dy + 0.414 * dx;
}

function getMarketPopulation(marketId: number): number {
  return getWorldContext().pack.burgs.reduce((sum, burg) => {
    if (!burg.i || burg.removed || burg.market !== marketId) return sum;
    return sum + (burg.population ?? 0);
  }, 0);
}

export function setSelectedGoodId(selectedGoodId: number): void {
  setMarketTradeOpportunitiesState({ selectedGoodId });
  refresh();
}

export function setSorting(sortBy: MarketTradeOpportunitySort): void {
  const { sortBy: currentSortBy, sortDirection } = getMarketTradeOpportunitiesState();
  const nextDirection =
    currentSortBy === sortBy ? sortDirection * -1 : sortBy === "source" || sortBy === "target" ? 1 : -1;
  setMarketTradeOpportunitiesState({ sortBy, sortDirection: nextDirection });
}

export function highlightTradeOpportunity(row: MarketTradeOpportunityRow): void {
  const { burgs } = getWorldContext().pack;
  const source = burgs[row.sourceBurgId];
  const target = burgs[row.targetBurgId];
  if (!source || !target) return;

  const routePath = getWorldContext().pack.cells?.routes
    ? TradeAnimation.findRoutePath(source.cell, target.cell)
    : null;
  highlight(
    routePath?.points?.length
      ? routePath.points
      : [
          [source.x, source.y],
          [target.x, target.y]
        ]
  );
}

export function clearTradeOpportunityHighlight(): void {
  clearHighlight();
}

export function downloadCsv(): void {
  const selectedGoodId = getMarketTradeOpportunitiesState().selectedGoodId;
  const good = selectedGoodId === null ? null : Goods.get(selectedGoodId);
  if (!good) return;

  let csv =
    "Good,Buy Market,Sell Market,Distance,Land Distance,Sea Distance,Transfers,Buy Price,Sell Price,Transport Cost,Unit Profit,Max Units,Total Profit\n";
  for (const row of getMarketTradeOpportunitiesState().rows) {
    csv += [
      good.name,
      row.sourceMarketName,
      row.targetMarketName,
      row.distance,
      row.landDistance,
      row.seaDistance,
      row.transferCount,
      formatPrice(row.buyPrice),
      formatPrice(row.sellPrice),
      formatPrice(row.transportCost),
      formatPrice(row.unitProfit),
      row.maxUnits,
      formatPrice(row.totalProfit)
    ].join(",");
    csv += "\n";
  }
  downloadFile(csv, `${getFileName(`${good.name}_Trade_Opportunities`)}.csv`);
}
