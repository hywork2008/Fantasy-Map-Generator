import { TradeAnimation } from "./trade-animation";

/**
 * Shared route-planning boundary for trade simulation. The animation module keeps the
 * implementation during the compatibility transition; simulation callers depend on this
 * facade so path planning can evolve independently from presentation.
 */
export const TradeRoutePlanner = {
  findRoutePath(startCell: number, endCell: number) {
    return TradeAnimation.findRoutePath(startCell, endCell);
  },
  clearCache() {
    TradeAnimation.clearRouteCache();
  }
};
