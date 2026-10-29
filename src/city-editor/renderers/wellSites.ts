import type { WellSite } from "../../city3d/three/wellMeshes";
import type { DistrictFabric } from "../generators/blockInfill";
import type { CityDocument } from "../types/document";

/** Use planned waterworks for both views; older fabrics fall back to plaza basins. */
export function collectWellSites(city: CityDocument, fabric: DistrictFabric): WellSite[] {
  const aerial = fabric.aerialLandmarks;
  const sites: WellSite[] = (aerial?.domesticWater ?? [])
    .filter(water => water.kind === "well" || water.kind === "publicBasin")
    .map(water => ({
      id: water.id,
      point: water.center,
      ...(water.kind === "publicBasin" ? { kind: "publicBasin" as const } : {})
    }));
  for (const element of city.elements) {
    if (!aerial?.domesticWater && element.kind === "plaza" && element.point)
      sites.push({ id: element.id, point: element.point, kind: "publicBasin" });
  }
  // Religious-house assemblies own their wells on the shared precinct foundation.
  return sites.filter((site, index) =>
    sites
      .slice(0, index)
      .every(other => Math.hypot(site.point[0] - other.point[0], site.point[1] - other.point[1]) > 0.01)
  );
}
