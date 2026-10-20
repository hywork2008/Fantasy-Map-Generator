import type { WellSite } from "../../city3d/three/wellMeshes";
import type { DistrictFabric } from "../generators/blockInfill";
import type { CityDocument } from "../types/document";

/** Reuse the same well locations as the town SVG; cisterns, springs and ponds stay distinct. */
export function collectWellSites(city: CityDocument, fabric: DistrictFabric): WellSite[] {
  const aerial = fabric.aerialLandmarks;
  const sites: WellSite[] = (aerial?.domesticWater ?? [])
    .filter(water => water.kind === "well")
    .map(water => ({ id: water.id, point: water.center }));
  for (const element of city.elements) {
    if (element.kind === "plaza" && element.point) sites.push({ id: element.id, point: element.point });
  }
  for (const monastery of aerial?.monasteries ?? []) {
    if (monastery.well) sites.push({ id: `${monastery.id}:well`, point: monastery.well });
  }
  return sites.filter((site, index) =>
    sites
      .slice(0, index)
      .every(other => Math.hypot(site.point[0] - other.point[0], site.point[1] - other.point[1]) > 0.01)
  );
}
