/** Euclidean distance from the burg's local origin to its surveyed shoreline.
 * Older shared sites have no explicit distance; use their clipped shoreline. */
export function shoreDistanceMeters(waterbody: {
  shoreDistanceMeters?: number;
  shoreline: [number, number][][];
}): number | null {
  const supplied = waterbody.shoreDistanceMeters;
  if (supplied != null && Number.isFinite(supplied) && supplied >= 0) return supplied;
  let best = Infinity;
  for (const line of waterbody.shoreline) {
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = line[i - 1];
      const [bx, by] = line[i];
      const dx = bx - ax;
      const dy = by - ay;
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared)) : 0;
      const distance = Math.hypot(ax + t * dx, ay + t * dy);
      if (Number.isFinite(distance)) best = Math.min(best, distance);
    }
  }
  return Number.isFinite(best) ? best : null;
}
