import type { BurgGroup } from "../types/models";

/**
 * Returns the zoom level at which a burg group becomes visible.
 *
 * Explicit `minZoom` values take precedence. Groups without one use their
 * importance order, so the most important group appears first.
 */
export function getBurgGroupMinZoom(groupId: string, groups: readonly BurgGroup[]): number {
  const group = groups.find(candidate => candidate.name === groupId);
  if (!group) return 0;
  if (typeof group.minZoom === "number" && Number.isFinite(group.minZoom)) return group.minZoom;

  const maxOrder = Math.max(...groups.map(candidate => candidate.order), 1);
  const invertedOrder = maxOrder - group.order + 1;
  return invertedOrder === 1 ? 1.5 : invertedOrder * 2 - 1.5;
}

export function isBurgGroupVisible(groupId: string, groups: readonly BurgGroup[], scale: number): boolean {
  return scale >= getBurgGroupMinZoom(groupId, groups);
}
