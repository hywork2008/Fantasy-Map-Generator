import { generateFromFmgDescriptor } from "../core/gen/pipeline";
import { REGION_SITE_VERSION, type RegionDocument } from "../core/types";
import { loadRegionSite } from "./siteStore";

export async function loadIncomingRegionFromStorage(): Promise<RegionDocument | null> {
  try {
    const data = await loadRegionSite();
    if (!data) return null;
    if (data.version !== REGION_SITE_VERSION && data.version !== 1) {
      console.warn("Region Site Descriptor version mismatch:", data.version);
      return null;
    }
    return generateFromFmgDescriptor(data);
  } catch (err) {
    console.error("Failed to load incoming region from storage:", err);
    return null;
  }
}
