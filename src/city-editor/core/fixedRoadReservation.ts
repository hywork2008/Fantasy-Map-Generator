import { checkCorridorArc } from "../../services/approachCorridorGeometry";
import { checkDryLandSegment } from "../../services/dryLandCorridor";
import { PhysicalWaterIndex, PhysicalWaterValidationCache } from "../../services/physicalWaterIndex";
import { FIXED_SITE_CROSSING_BUDGETS, validFixedBurgCrossings } from "../../utils/fixedBurgCrossings";
import { requiredSiteExtent } from "../../utils/requiredSiteBounds";
import { currentFixedCrossingApproaches } from "./fixedApproachAdoption";
import type { CityDocument, Point } from "./types";

const emptyWater = PhysicalWaterIndex.build([], new PhysicalWaterValidationCache())!;
/** Reserve currently authorized analytic roads before deriving housing. Buildings
 * never become a second source of route geometry; copied/unvalidated approaches
 * reserve no corridor because they cannot be drawn either.
 */
export class FixedRoadReservation {
  private index: PhysicalWaterIndex;
  constructor(document: CityDocument) {
    const polygons: Point[][] = [];
    const addLine = (start: readonly [number, number], end: readonly [number, number], width: number) => {
      const checked = checkDryLandSegment({
        start,
        end,
        widthMeters: width,
        water: emptyWater,
        supportsDryFootprint: () => true
      });
      if ("footprint" in checked) polygons.push(checked.footprint.map(p => [...p]));
    };
    const fixed = document.importedFixedCrossings;
    if (
      fixed &&
      validFixedBurgCrossings(fixed, FIXED_SITE_CROSSING_BUDGETS) &&
      requiredSiteExtent(fixed.requiredBounds) <= document.frame.extentMeters
    ) {
      for (const c of fixed.crossings) addLine(c.approachA, c.approachB, fixed.roadWidthMeters);
      for (const approach of currentFixedCrossingApproaches(document) ?? []) {
        for (const piece of approach.corridor.pieces) {
          if (piece.kind === "line") addLine(piece.start, piece.end, fixed.roadWidthMeters);
          else {
            const settings = approach.request.settings;
            const checked = checkCorridorArc(piece, {
              roadWidthMeters: fixed.roadWidthMeters,
              maxEnvelopeErrorMeters: settings.maxEnvelopeErrorMeters,
              maxArcSections: settings.maxArcSections,
              water: emptyWater,
              supportsDryFootprint: () => true
            });
            if ("footprints" in checked) polygons.push(...checked.footprints.map(p => p.map(q => [...q] as Point)));
          }
        }
      }
    }
    this.index = PhysicalWaterIndex.build(
      polygons.map((polygon, id) => ({ id, rings: [polygon] })),
      new PhysicalWaterValidationCache()
    )!;
  }
  hitsPolygon(polygon: readonly Point[]): boolean {
    return this.index.touchesWater(polygon);
  }
}
