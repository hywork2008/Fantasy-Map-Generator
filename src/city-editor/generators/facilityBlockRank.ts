import type { Point } from "../types/document";
import type { FacilityDemand, FacilityGroup } from "./facilityUses";
import { facilitySiteArea, facilityUseOf } from "./facilityUses";
import { plotArea } from "./parcelGeometry";

export interface PlotFrontage {
  distance: number;
  width: number;
}

interface RankedPlot {
  polygon: Point[];
  face: { properties: { settlement?: "core" | "outskirts" } };
}

/**
 * Up to four blocks a use-group should try before the original candidate scan.
 * Commerce, hazard and river uses prefer continuous land on a wide frontage.
 * Craft uses stay on blocks sized for a few workshops, not one swallowed field.
 */
export function preferredFacilityPlots<T extends RankedPlot>(
  request: FacilityDemand,
  plots: readonly T[],
  group: FacilityGroup,
  frontage: (polygon: Point[]) => PlotFrontage
): T[] {
  const need = Math.max(facilitySiteArea(request), 1);
  const use = facilityUseOf(request);
  const ranked = plots
    .map(plot => {
      const area = plotArea(plot.polygon);
      if (request.zone && plot.face.properties.settlement !== request.zone) return { plot, score: -1 };
      if (area + 1e-6 < need) return { plot, score: -1 };
      const face = frontage(plot.polygon);
      if (!Number.isFinite(face.distance)) return { plot, score: -1 };
      const fits = Math.max(1, Math.floor(area / need));
      const useful = Math.min(fits, Math.max(1, group.count));
      let score = useful * 100 - face.distance + face.width * 3;
      if (use === "craft") {
        const target = Math.max(need, group.median * Math.min(group.count, 4));
        score -= Math.abs(area - target) * 0.03;
      } else score += Math.min(area, Math.max(group.total, need)) * 0.04;
      return { plot, score };
    })
    .filter(row => row.score >= 0)
    .sort((a, b) => b.score - a.score);
  return ranked.slice(0, 4).map(row => row.plot);
}
