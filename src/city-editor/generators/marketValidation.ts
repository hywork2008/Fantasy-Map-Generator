import type { MarketSite } from "../types/contracts/market";

/** Optional additive contract: old maps have no markets and retain their original contents. */
export function validMarkets(value: unknown): value is MarketSite[] | undefined {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.length > 128) return false;
  const ring = (points: unknown): boolean =>
    Array.isArray(points) &&
    points.length >= 3 &&
    points.length <= 2048 &&
    points.every(point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite));
  const paths = (lines: unknown): boolean =>
    Array.isArray(lines) &&
    lines.length <= 2048 &&
    lines.every(line => Array.isArray(line) && line.length >= 2 && ring([...line, line[0]]));
  const ids = new Set<string>();
  return value.every(market => {
    if (!market || typeof market !== "object" || typeof market.id !== "string" || ids.has(market.id)) return false;
    ids.add(market.id);
    return (
      market.version === 1 &&
      ["plaza", "river-port", "sea-port", "street", "hall-front", "freeform"].includes(market.setting) &&
      (market.anchorElementId === undefined || typeof market.anchorElementId === "string") &&
      (market.activity === undefined || ["market-day", "closed"].includes(market.activity)) &&
      ring(market.boundary) &&
      paths(market.accessPaths) &&
      (market.cargoAccessPaths === undefined || paths(market.cargoAccessPaths)) &&
      Array.isArray(market.reservedAreas) &&
      market.reservedAreas.length <= 4096 &&
      market.reservedAreas.every(ring) &&
      Array.isArray(market.stallElementIds) &&
      market.stallElementIds.length <= 6 &&
      market.stallElementIds.every((id: unknown) => typeof id === "string") &&
      new Set(market.stallElementIds).size === market.stallElementIds.length
    );
  });
}
