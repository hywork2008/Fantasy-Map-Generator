import { openDialog } from "../../hostUi";
import { rn } from "../../hostUtils";
import {
  getGoods,
  getMarkets,
  getMetallurgMaterialForecasts,
  getMetallurgWorkOrders,
  getWorldContext
} from "../economyContext";
import {
  type MetallurgMaterialForecastRow,
  type MetallurgWorkOrderRow,
  setMetallurgWorkOverviewState
} from "../store/metallurgWorkOverviewState";

export function open(): void {
  openDialog("metallurgWorkOverview");
  refreshMetallurgWorkOverview();
}

/** Reads persisted planning data only; this overview never recalculates demand or consumes stock. */
export function refreshMetallurgWorkOverview(): void {
  const world = getWorldContext();
  const goodsById = new Map(getGoods().map(good => [good.i, good]));
  const marketsById = new Map(getMarkets().map(market => [market.i, market]));
  const shortagesByOrderId = new Map<number, number>();

  for (const forecast of getMetallurgMaterialForecasts()) {
    for (const orderId of forecast.workOrderIds) {
      shortagesByOrderId.set(orderId, (shortagesByOrderId.get(orderId) ?? 0) + forecast.projectedShortage);
    }
  }

  const orders: MetallurgWorkOrderRow[] = getMetallurgWorkOrders()
    .map(order => {
      const good = goodsById.get(order.productGoodId);
      const remainingUnits = Math.max(0, order.requestedUnits - order.completedUnits);
      const remainingWork = Math.max(0, order.plannedWork - order.completedWork);
      const requiredMaterials = order.materials.reduce((sum, material) => sum + material.units, 0);
      const shortage = shortagesByOrderId.get(order.id) ?? 0;
      const ownerName =
        order.ownerKind === "state"
          ? world.pack.states[order.ownerId]?.name || `State ${order.ownerId}`
          : world.pack.burgs[order.ownerId]?.name || `Burg ${order.ownerId}`;
      return {
        id: order.id,
        ownerName,
        productName: good?.name || `Good ${order.productGoodId}`,
        kind: order.kind,
        status: order.status,
        remainingUnits: rn(remainingUnits, 2),
        remainingWork: rn(remainingWork, 2),
        materialCoverage: requiredMaterials > 0 ? rn(Math.max(0, 1 - shortage / requiredMaterials), 3) : 1
      };
    })
    .toSorted((left, right) => {
      const leftBlocked = left.status === "waitingMaterials" ? 1 : 0;
      const rightBlocked = right.status === "waitingMaterials" ? 1 : 0;
      return rightBlocked - leftBlocked || right.remainingWork - left.remainingWork || left.id - right.id;
    });

  const materials: MetallurgMaterialForecastRow[] = getMetallurgMaterialForecasts()
    .map(forecast => {
      const market = marketsById.get(forecast.marketId);
      const marketBurg = market ? world.pack.burgs[market.centerBurgId] : undefined;
      return {
        id: `${forecast.marketId}:${forecast.goodId}`,
        marketName: marketBurg?.name || `Market ${forecast.marketId}`,
        materialName: goodsById.get(forecast.goodId)?.name || `Good ${forecast.goodId}`,
        requiredUnits: rn(forecast.requiredUnits, 2),
        availableMarketStock: rn(forecast.availableMarketStock, 2),
        inboundUnits: rn(forecast.inboundUnits, 2),
        projectedShortage: rn(forecast.projectedShortage, 2),
        workOrderCount: forecast.workOrderIds.length
      };
    })
    .toSorted(
      (left, right) =>
        right.projectedShortage - left.projectedShortage || left.marketName.localeCompare(right.marketName)
    );

  setMetallurgWorkOverviewState({
    orders,
    materials,
    queuedWork: rn(
      orders.reduce((sum, order) => sum + order.remainingWork, 0),
      2
    ),
    blockedWork: rn(
      orders.filter(order => order.status === "waitingMaterials").reduce((sum, order) => sum + order.remainingWork, 0),
      2
    ),
    shortageCount: materials.filter(material => material.projectedShortage > 0).length
  });
}
