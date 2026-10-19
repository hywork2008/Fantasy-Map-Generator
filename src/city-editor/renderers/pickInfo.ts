import { approachBeyondLabel } from "../generators/approachBeyond";
import type { FeatureGroup } from "../types/document";
import type { SvgPickInfo } from "../types/selection";

/** Retarget logical route metadata without changing the physical interval's style. */
export function featureGroupPickInfo(group: FeatureGroup, physicalInfo: SvgPickInfo): SvgPickInfo {
  const beyondLabel = group.kind === "road" ? approachBeyondLabel(group.beyond) : null;
  const info: SvgPickInfo = {
    ...physicalInfo,
    id: group.id,
    label: beyondLabel ? `${group.kind} (${group.name} · ${beyondLabel})` : `${group.kind} (${group.name})`,
    name: group.name,
    locked: group.locked
  };
  delete info.beyond;
  delete info.beyondLabel;
  if (beyondLabel && group.kind === "road") {
    info.beyond = group.beyond;
    info.beyondLabel = beyondLabel;
  }
  return info;
}

export function parsePickInfo(raw: string | null): SvgPickInfo | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as SvgPickInfo;
  } catch {
    return null;
  }
}
