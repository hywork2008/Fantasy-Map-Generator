import { generateFromFmgDescriptor } from "../core/gen/pipeline";
import { REGION_SITE_KEY, REGION_SITE_VERSION, type RegionDocument, type RegionSiteDescriptor } from "../core/types";

export function loadIncomingRegionFromStorage(): RegionDocument | null {
  try {
    const raw = sessionStorage.getItem(REGION_SITE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<RegionSiteDescriptor>;
    if (data.version !== REGION_SITE_VERSION) {
      console.warn("Region Site Descriptor version mismatch:", data.version);
      return null;
    }
    return generateFromFmgDescriptor(data as RegionSiteDescriptor);
  } catch (err) {
    console.error("Failed to load incoming region from storage:", err);
    return null;
  }
}
