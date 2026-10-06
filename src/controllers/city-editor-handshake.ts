import { getBurgSiteDescriptor } from "../services/burgSiteDescriptor";
import { tip } from "../services/tooltipService";
import { openURL } from "../utils";

/**
 * Stashes the burg's site descriptor for the City Generator / City Editor tab.
 * Keep the key in sync with `CITY_SITE_KEY` in city-generator/site/incomingSite.ts
 * and city-editor/io/incomingCity.ts.
 */
export function stashCitySite(burgId: number): boolean {
  const descriptor = getBurgSiteDescriptor(burgId);
  if (!descriptor) {
    tip("Cannot build the site descriptor for this burg", false, "error");
    return false;
  }
  try {
    // window.open spawns a fresh same-origin tab, which inherits a copy of
    // this sessionStorage — so each burg's hand-off is independent and a reload
    // of the city tab keeps showing the same burg.
    sessionStorage.setItem("fmg.citySite", JSON.stringify(descriptor));
    return true;
  } catch {
    tip("Could not stash the site descriptor (storage blocked)", false, "error");
    return false;
  }
}

/**
 * Opens City Editor for the specified burg ID.
 */
export function openCityEditorForBurg(burgId: number): boolean {
  if (!stashCitySite(burgId)) return false;
  openURL(`${import.meta.env.BASE_URL}city-editor/`);
  return true;
}
