import {
  FIXED_SITE_CROSSING_BUDGETS,
  fixedCrossingsMatchFrame,
  validFixedBurgCrossings
} from "../../utils/fixedBurgCrossings";
import { requiredSiteExtent } from "../../utils/requiredSiteBounds";
import type { BurgSiteDescriptor } from "./gen/site/burgSiteDescriptor";
import type { CityDocument } from "./types";

/** Preserve source geometry as read-only import data, independently of the editable mesh. */
export function applyImportedFixedCrossings(document: CityDocument, site?: BurgSiteDescriptor): void {
  if (!site) {
    if (
      document.importedFixedCrossings &&
      (!validFixedBurgCrossings(document.importedFixedCrossings, FIXED_SITE_CROSSING_BUDGETS) ||
        !Number.isFinite(document.frame.extentMeters) ||
        requiredSiteExtent(document.importedFixedCrossings.requiredBounds) > document.frame.extentMeters)
    )
      throw new RangeError("City frame does not contain imported fixed crossings");
    return;
  }
  const payload = site.fixedCrossings;
  if (!payload) {
    delete document.importedFixedCrossings;
    return;
  }
  if (!validFixedBurgCrossings(payload, FIXED_SITE_CROSSING_BUDGETS) || !fixedCrossingsMatchFrame(payload, site.frame))
    throw new RangeError("Invalid imported fixed crossings");
  if (
    !Number.isFinite(document.frame.extentMeters) ||
    document.frame.extentMeters <= 0 ||
    requiredSiteExtent(payload.requiredBounds) > document.frame.extentMeters
  )
    throw new RangeError("City frame does not contain imported fixed crossings");
  document.importedFixedCrossings = structuredClone(payload);
}
