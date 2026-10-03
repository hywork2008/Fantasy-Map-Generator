/** Mandatory display bounds in metres relative to the unchanged town origin. */
export interface RequiredSiteBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}
export function isRequiredSiteBounds(value: unknown): value is RequiredSiteBounds {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const b = value as RequiredSiteBounds;
  return (
    Object.keys(b).sort().join() === "maxX,maxY,minX,minY" &&
    [b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite) &&
    b.minX <= b.maxX &&
    b.minY <= b.maxY &&
    Number.isFinite(requiredSiteExtent(b))
  );
}
/** A centred square contains asymmetric bounds without moving the origin. */
export function requiredSiteExtent(bounds: RequiredSiteBounds): number {
  return 2 * Math.max(Math.abs(bounds.minX), Math.abs(bounds.minY), Math.abs(bounds.maxX), Math.abs(bounds.maxY));
}
